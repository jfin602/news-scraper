import { createHash } from 'node:crypto';

import { validateAdminInputRecord } from './input-validation.ts';
import type { Database, QueryExecutor } from '../database/database.ts';
import {
  ARTICLE_MODERATION_HISTORY_PAGE_SIZE,
  ARTICLE_MODERATION_MAX_HISTORY_PAGE_SIZE,
  ARTICLE_MODERATION_MAX_PAGE_SIZE,
  ARTICLE_MODERATION_PAGE_SIZE,
  clearManualCategoryOverride,
  lockModeratedArticle,
  readAuditEvents,
  readModeratedArticle,
  readModeratedArticles,
  readObservations,
  replaceManualCategoryOverride,
  type ModeratedArticle,
  type ModeratedArticleDetail,
  type ModerationAuditEvent,
  type ModerationCategory,
  type ModerationDuplicateRole,
  type ModerationReviewState,
  type ModerationSearchCursor,
  type ModerationSearchCriteria,
  type ModerationObservation,
  type ModerationVisibilityState,
  writeAuditEvent,
} from '../articles/moderation-repository.ts';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const CONFIG_KEY_PATTERN = /^[a-z0-9]+(_[a-z0-9]+)*$/u;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u;
const CURSOR_FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/u;
const CURSOR_TIMESTAMP_PATTERN =
  /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})\.([0-9]{6})Z$/u;
const MAX_QUERY_CODE_POINTS = 200;
const MAX_CONFIG_KEY_LENGTH = 100;
const MAX_CURSOR_LENGTH = 2048;
const MAX_REASON_LENGTH = 2000;
const MAX_DETAIL_LIMIT = 100;
const CURSOR_VERSION = 1;

export type ArticleAdministrationErrorCode =
  | 'invalid_request'
  | 'article_not_found'
  | 'article_visibility_conflict'
  | 'category_not_found';

export class ArticleAdministrationError extends Error {
  readonly code: ArticleAdministrationErrorCode;

  constructor(code: ArticleAdministrationErrorCode) {
    super(`Article administration command failed: ${code}`);
    this.name = 'ArticleAdministrationError';
    this.code = code;
  }
}

export interface ArticleModerationDetail extends ModeratedArticleDetail {
  readonly observations: readonly ModerationObservation[];
  readonly history: Readonly<{
    readonly events: readonly ModerationAuditEvent[];
    readonly nextCursor: Readonly<{
      occurredAt: string;
      eventId: string;
    }> | null;
  }>;
}

export interface ArticleModerationMutationResult {
  readonly changed: boolean;
  readonly article: ModeratedArticleDetail;
  readonly auditEvent: ModerationAuditEvent | null;
}

export interface ArticleAdministrationService {
  search(input?: unknown): Promise<
    Readonly<{
      readonly articles: readonly ModeratedArticle[];
      readonly nextCursor: string | null;
    }>
  >;
  getArticle(articleId: unknown): Promise<ArticleModerationDetail>;
  listHistory(
    articleId: unknown,
    input?: unknown,
  ): Promise<
    Readonly<{
      readonly events: readonly ModerationAuditEvent[];
      readonly nextCursor: string | null;
    }>
  >;
  hideArticle(
    articleId: unknown,
    input?: unknown,
  ): Promise<ArticleModerationMutationResult>;
  restoreArticle(
    articleId: unknown,
    input?: unknown,
  ): Promise<ArticleModerationMutationResult>;
  setDisplayTitleOverride(
    articleId: unknown,
    input: unknown,
  ): Promise<ArticleModerationMutationResult>;
  clearDisplayTitleOverride(
    articleId: unknown,
    input?: unknown,
  ): Promise<ArticleModerationMutationResult>;
  setCategoryOverride(
    articleId: unknown,
    input: unknown,
  ): Promise<ArticleModerationMutationResult>;
  clearCategoryOverride(
    articleId: unknown,
    input?: unknown,
  ): Promise<ArticleModerationMutationResult>;
}

interface ReasonCommand {
  readonly reason: string | null;
}

interface CursorPayload {
  readonly version: number;
  readonly criteriaFingerprint: string;
  readonly lastSeenAt: string;
  readonly articleId: string;
}

interface HistoryCursorPayload {
  readonly version: number;
  readonly occurredAt: string;
  readonly eventId: string;
}

export function createArticleAdministrationService(
  database: Database,
): ArticleAdministrationService {
  return Object.freeze({
    async search(input: unknown = {}) {
      const request = normalizeSearchRequest(input);
      const result = await readModeratedArticles(database, request);
      return Object.freeze({
        articles: result.articles,
        nextCursor:
          result.nextCursor === null
            ? null
            : encodeArticleModerationCursor(
                request.criteria,
                result.nextCursor,
              ),
      });
    },

    async getArticle(articleId: unknown) {
      const id = normalizeArticleId(articleId);
      const article = await readModeratedArticle(database, id);
      if (article === undefined) {
        throw new ArticleAdministrationError('article_not_found');
      }
      const observations = await readObservations(
        database,
        id,
        MAX_DETAIL_LIMIT,
      );
      const history = await readAuditEvents(
        database,
        id,
        ARTICLE_MODERATION_HISTORY_PAGE_SIZE,
      );
      return Object.freeze({
        ...article,
        observations,
        history,
      });
    },

    async listHistory(articleId: unknown, input: unknown = {}) {
      const id = normalizeArticleId(articleId);
      const request = normalizeHistoryRequest(input);
      if ((await readModeratedArticle(database, id)) === undefined) {
        throw new ArticleAdministrationError('article_not_found');
      }
      const result = await readAuditEvents(
        database,
        id,
        request.pageSize,
        request.cursor,
      );
      return Object.freeze({
        events: result.events,
        nextCursor:
          result.nextCursor === null
            ? null
            : encodeHistoryCursor(result.nextCursor),
      });
    },

    async hideArticle(articleId: unknown, input: unknown = {}) {
      return mutateVisibility(database, articleId, input, 'hidden');
    },

    async restoreArticle(articleId: unknown, input: unknown = {}) {
      return mutateVisibility(database, articleId, input, 'visible');
    },

    async setDisplayTitleOverride(articleId: unknown, input: unknown) {
      const id = normalizeArticleId(articleId);
      const command = normalizeDisplayTitleCommand(input, false);
      return database.transaction(async (transaction) => {
        const article = await requireLockedArticle(transaction, id);
        const prior = article.displayTitleOverride;
        if (prior === command.value) {
          return unchangedResult(article);
        }
        await transaction.query(
          `UPDATE articles
           SET display_title_override = $2, updated_at = now()
           WHERE id = $1`,
          [id, command.value],
        );
        const auditEvent = await writeAuditEvent(transaction, {
          action: 'article_display_title_override_set',
          targetId: id,
          reason: command.reason,
          priorState: { displayTitleOverride: prior },
          newState: { displayTitleOverride: command.value },
        });
        return changedResult(transaction, id, auditEvent);
      });
    },

    async clearDisplayTitleOverride(articleId: unknown, input: unknown = {}) {
      const id = normalizeArticleId(articleId);
      const command = normalizeReasonCommand(input);
      return database.transaction(async (transaction) => {
        const article = await requireLockedArticle(transaction, id);
        if (article.displayTitleOverride === null) {
          return unchangedResult(article);
        }
        await transaction.query(
          `UPDATE articles
           SET display_title_override = NULL, updated_at = now()
           WHERE id = $1`,
          [id],
        );
        const auditEvent = await writeAuditEvent(transaction, {
          action: 'article_display_title_override_cleared',
          targetId: id,
          reason: command.reason,
          priorState: { displayTitleOverride: article.displayTitleOverride },
          newState: { displayTitleOverride: null },
        });
        return changedResult(transaction, id, auditEvent);
      });
    },

    async setCategoryOverride(articleId: unknown, input: unknown) {
      const id = normalizeArticleId(articleId);
      const command = normalizeCategoryCommand(input);
      return database.transaction(async (transaction) => {
        const article = await requireLockedArticle(transaction, id);
        const categories = await resolveCategories(
          transaction,
          command.categoryConfigKeys,
        );
        const current = article.manualCategoryOverride;
        const currentKeys = current.categories
          .map((category) => category.configKey)
          .sort();
        const nextKeys = [...command.categoryConfigKeys].sort();
        if (current.active && sameStrings(currentKeys, nextKeys)) {
          return unchangedResult(article);
        }
        await replaceManualCategoryOverride(
          transaction,
          id,
          categories.map((category) => category.id),
        );
        const auditEvent = await writeAuditEvent(transaction, {
          action: 'article_category_override_set',
          targetId: id,
          reason: command.reason,
          priorState: {
            manualCategoryOverride: {
              active: current.active,
              categoryConfigKeys: currentKeys,
            },
          },
          newState: {
            manualCategoryOverride: {
              active: true,
              categoryConfigKeys: nextKeys,
            },
          },
        });
        return changedResult(transaction, id, auditEvent);
      });
    },

    async clearCategoryOverride(articleId: unknown, input: unknown = {}) {
      const id = normalizeArticleId(articleId);
      const command = normalizeReasonCommand(input);
      return database.transaction(async (transaction) => {
        const article = await requireLockedArticle(transaction, id);
        if (!article.manualCategoryOverride.active) {
          return unchangedResult(article);
        }
        await clearManualCategoryOverride(transaction, id);
        const auditEvent = await writeAuditEvent(transaction, {
          action: 'article_category_override_cleared',
          targetId: id,
          reason: command.reason,
          priorState: {
            manualCategoryOverride: {
              active: true,
              categoryConfigKeys: article.manualCategoryOverride.categories.map(
                (category) => category.configKey,
              ),
            },
          },
          newState: {
            manualCategoryOverride: {
              active: false,
              categoryConfigKeys: [],
            },
          },
        });
        return changedResult(transaction, id, auditEvent);
      });
    },
  });
}

export function normalizeArticleModerationSearchRequest(
  input: unknown,
): Readonly<{
  readonly criteria: ModerationSearchCriteria;
  readonly cursor?: ModerationSearchCursor;
}> {
  return normalizeSearchRequest(input);
}

export function encodeArticleModerationCursor(
  criteria: ModerationSearchCriteria,
  position: ModerationSearchCursor,
): string {
  const normalizedCriteria = normalizeCriteria(criteria);
  const normalizedPosition = normalizeSearchCursorPosition(position);
  return Buffer.from(
    JSON.stringify({
      version: CURSOR_VERSION,
      criteriaFingerprint: criteriaFingerprint(normalizedCriteria),
      lastSeenAt: normalizedPosition.lastSeenAt,
      articleId: normalizedPosition.articleId,
    } satisfies CursorPayload),
    'utf8',
  ).toString('base64url');
}

export function decodeArticleModerationCursor(
  cursor: unknown,
  criteria: ModerationSearchCriteria,
): ModerationSearchCursor {
  try {
    if (
      typeof cursor !== 'string' ||
      cursor.length === 0 ||
      cursor.length > MAX_CURSOR_LENGTH ||
      !BASE64URL_PATTERN.test(cursor)
    ) {
      throw new Error();
    }
    const bytes = Buffer.from(cursor, 'base64url');
    if (bytes.toString('base64url') !== cursor) throw new Error();
    const parsed: unknown = JSON.parse(bytes.toString('utf8'));
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      throw new Error();
    }
    const payload = parsed as Partial<CursorPayload>;
    const keys = ['version', 'criteriaFingerprint', 'lastSeenAt', 'articleId'];
    if (
      Object.keys(payload).length !== keys.length ||
      keys.some((key) => !Object.hasOwn(payload, key)) ||
      payload.version !== CURSOR_VERSION ||
      typeof payload.criteriaFingerprint !== 'string' ||
      !CURSOR_FINGERPRINT_PATTERN.test(payload.criteriaFingerprint) ||
      payload.criteriaFingerprint !==
        criteriaFingerprint(normalizeCriteria(criteria))
    ) {
      throw new Error();
    }
    return normalizeSearchCursorPosition({
      lastSeenAt: payload.lastSeenAt,
      articleId: payload.articleId,
    });
  } catch {
    throw new ArticleAdministrationError('invalid_request');
  }
}

async function mutateVisibility(
  database: Database,
  articleId: unknown,
  input: unknown,
  target: 'hidden' | 'visible',
): Promise<ArticleModerationMutationResult> {
  const id = normalizeArticleId(articleId);
  const command = normalizeReasonCommand(input);
  return database.transaction(async (transaction) => {
    const article = await requireLockedArticle(transaction, id);
    if (article.visibilityState === 'archived') {
      throw new ArticleAdministrationError('article_visibility_conflict');
    }
    if (article.visibilityState === target) {
      return unchangedResult(article);
    }
    await transaction.query(
      `UPDATE articles
       SET visibility_state = $2, updated_at = now()
       WHERE id = $1`,
      [id, target],
    );
    const auditEvent = await writeAuditEvent(transaction, {
      action: target === 'hidden' ? 'article_hidden' : 'article_restored',
      targetId: id,
      reason: command.reason,
      priorState: { visibilityState: article.visibilityState },
      newState: { visibilityState: target },
    });
    return changedResult(transaction, id, auditEvent);
  });
}

async function requireLockedArticle(
  transaction: QueryExecutor,
  articleId: string,
): Promise<ModeratedArticleDetail> {
  const article = await lockModeratedArticle(transaction, articleId);
  if (article === undefined) {
    throw new ArticleAdministrationError('article_not_found');
  }
  return article;
}

async function changedResult(
  transaction: QueryExecutor,
  articleId: string,
  auditEvent: ModerationAuditEvent,
): Promise<ArticleModerationMutationResult> {
  const article = await readModeratedArticle(transaction, articleId);
  if (article === undefined)
    throw new ArticleAdministrationError('article_not_found');
  return Object.freeze({ changed: true, article, auditEvent });
}

function unchangedResult(
  article: ModeratedArticleDetail,
): ArticleModerationMutationResult {
  return Object.freeze({ changed: false, article, auditEvent: null });
}

async function resolveCategories(
  transaction: QueryExecutor,
  configKeys: readonly string[],
): Promise<readonly (ModerationCategory & { readonly id: string })[]> {
  if (configKeys.length === 0) return Object.freeze([]);
  const result = await transaction.query<{
    readonly id: unknown;
    readonly config_key: unknown;
    readonly display_name: unknown;
  }>(
    `SELECT id, config_key, display_name
     FROM categories
     WHERE config_key = ANY($1::text[])
     ORDER BY config_key ASC`,
    [configKeys],
  );
  if (result.rows.length !== configKeys.length) {
    throw new ArticleAdministrationError('category_not_found');
  }
  return Object.freeze(
    result.rows.map((row) => {
      if (
        typeof row.id !== 'string' ||
        typeof row.config_key !== 'string' ||
        typeof row.display_name !== 'string'
      ) {
        throw new ArticleAdministrationError('category_not_found');
      }
      return Object.freeze({
        id: row.id,
        configKey: row.config_key,
        displayName: row.display_name,
      });
    }),
  );
}

function normalizeSearchRequest(input: unknown): Readonly<{
  readonly criteria: ModerationSearchCriteria;
  readonly cursor?: ModerationSearchCursor;
}> {
  try {
    const record = exactRecord(input, [
      'q',
      'sourceConfigKey',
      'visibilityState',
      'categoryConfigKey',
      'duplicateRole',
      'duplicateGroupId',
      'duplicateReviewState',
      'duplicateReviewParticipating',
      'pageSize',
      'cursor',
    ]);
    const criteria = normalizeCriteria({
      query: normalizeOptionalQuery(record.q),
      sourceConfigKey: normalizeOptionalConfigKey(record.sourceConfigKey),
      visibilityState: normalizeOptionalVisibility(record.visibilityState),
      categoryConfigKey: normalizeOptionalConfigKey(record.categoryConfigKey),
      duplicateRole: normalizeOptionalDuplicateRole(record.duplicateRole),
      duplicateGroupId: normalizeOptionalUuid(record.duplicateGroupId),
      duplicateReviewState: normalizeOptionalReviewState(
        record.duplicateReviewState,
      ),
      duplicateReviewParticipating: normalizeOptionalBoolean(
        record.duplicateReviewParticipating,
      ),
      pageSize: normalizePageSize(record.pageSize),
    });
    const cursor =
      record.cursor === undefined
        ? undefined
        : decodeArticleModerationCursor(record.cursor, criteria);
    return Object.freeze({
      criteria,
      ...(cursor === undefined ? {} : { cursor }),
    });
  } catch (error) {
    if (error instanceof ArticleAdministrationError) throw error;
    throw new ArticleAdministrationError('invalid_request');
  }
}

function normalizeCriteria(
  input: Readonly<{
    readonly query?: string | undefined;
    readonly sourceConfigKey?: string | undefined;
    readonly visibilityState?: ModerationVisibilityState | undefined;
    readonly categoryConfigKey?: string | undefined;
    readonly duplicateRole?: ModerationDuplicateRole | undefined;
    readonly duplicateGroupId?: string | undefined;
    readonly duplicateReviewState?: ModerationReviewState | undefined;
    readonly duplicateReviewParticipating?: boolean | undefined;
    readonly pageSize?: number | undefined;
  }>,
): ModerationSearchCriteria {
  return Object.freeze({
    ...(input.query === undefined ? {} : { query: input.query }),
    ...(input.sourceConfigKey === undefined
      ? {}
      : { sourceConfigKey: input.sourceConfigKey }),
    ...(input.visibilityState === undefined
      ? {}
      : { visibilityState: input.visibilityState }),
    ...(input.categoryConfigKey === undefined
      ? {}
      : { categoryConfigKey: input.categoryConfigKey }),
    ...(input.duplicateRole === undefined
      ? {}
      : { duplicateRole: input.duplicateRole }),
    ...(input.duplicateGroupId === undefined
      ? {}
      : { duplicateGroupId: input.duplicateGroupId }),
    ...(input.duplicateReviewState === undefined
      ? {}
      : { duplicateReviewState: input.duplicateReviewState }),
    ...(input.duplicateReviewParticipating === undefined
      ? {}
      : { duplicateReviewParticipating: input.duplicateReviewParticipating }),
    pageSize: input.pageSize ?? ARTICLE_MODERATION_PAGE_SIZE,
  });
}

function criteriaFingerprint(criteria: ModerationSearchCriteria): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        q: criteria.query?.toLowerCase() ?? null,
        source: criteria.sourceConfigKey ?? null,
        visibility: criteria.visibilityState ?? null,
        category: criteria.categoryConfigKey ?? null,
        duplicateRole: criteria.duplicateRole ?? null,
        duplicateGroup: criteria.duplicateGroupId ?? null,
        duplicateReviewState: criteria.duplicateReviewState ?? null,
        duplicateReviewParticipating:
          criteria.duplicateReviewParticipating ?? null,
        pageSize: criteria.pageSize,
      }),
      'utf8',
    )
    .digest('hex');
}

function normalizeSearchCursorPosition(
  position: Readonly<{
    readonly lastSeenAt?: string | undefined;
    readonly articleId?: string | undefined;
  }>,
): ModerationSearchCursor {
  if (
    typeof position.lastSeenAt !== 'string' ||
    !isCanonicalTimestamp(position.lastSeenAt) ||
    typeof position.articleId !== 'string' ||
    !UUID_PATTERN.test(position.articleId)
  ) {
    throw new ArticleAdministrationError('invalid_request');
  }
  return Object.freeze({
    lastSeenAt: position.lastSeenAt,
    articleId: position.articleId.toLowerCase(),
  });
}

function encodeHistoryCursor(
  position: Readonly<{ occurredAt: string; eventId: string }>,
): string {
  const payload: HistoryCursorPayload = {
    version: CURSOR_VERSION,
    occurredAt: position.occurredAt,
    eventId: position.eventId,
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function normalizeHistoryRequest(input: unknown): Readonly<{
  readonly pageSize: number;
  readonly cursor?: Readonly<{ occurredAt: string; eventId: string }>;
}> {
  try {
    const record = exactRecord(input, ['pageSize', 'cursor']);
    const cursor =
      record.cursor === undefined
        ? undefined
        : decodeHistoryCursor(record.cursor);
    return Object.freeze({
      pageSize: normalizePageSize(
        record.pageSize,
        ARTICLE_MODERATION_HISTORY_PAGE_SIZE,
        ARTICLE_MODERATION_MAX_HISTORY_PAGE_SIZE,
      ),
      ...(cursor === undefined ? {} : { cursor }),
    });
  } catch (error) {
    if (error instanceof ArticleAdministrationError) throw error;
    throw new ArticleAdministrationError('invalid_request');
  }
}

function decodeHistoryCursor(
  input: unknown,
): Readonly<{ occurredAt: string; eventId: string }> {
  try {
    if (
      typeof input !== 'string' ||
      input.length > MAX_CURSOR_LENGTH ||
      !BASE64URL_PATTERN.test(input)
    )
      throw new Error();
    const bytes = Buffer.from(input, 'base64url');
    if (bytes.toString('base64url') !== input) throw new Error();
    const parsed: unknown = JSON.parse(bytes.toString('utf8'));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error();
    const payload = parsed as Partial<HistoryCursorPayload>;
    if (
      Object.keys(payload).length !== 3 ||
      payload.version !== CURSOR_VERSION ||
      typeof payload.occurredAt !== 'string' ||
      !isCanonicalTimestamp(payload.occurredAt) ||
      typeof payload.eventId !== 'string' ||
      !UUID_PATTERN.test(payload.eventId)
    )
      throw new Error();
    return Object.freeze({
      occurredAt: payload.occurredAt,
      eventId: payload.eventId.toLowerCase(),
    });
  } catch {
    throw new ArticleAdministrationError('invalid_request');
  }
}

function normalizeDisplayTitleCommand(
  input: unknown,
  allowClear: boolean,
): Readonly<{ value: string | null; reason: string | null }> {
  const record = exactRecord(
    input,
    allowClear
      ? ['displayTitleOverride', 'reason']
      : ['displayTitleOverride', 'reason'],
  );
  const value = record.displayTitleOverride;
  if (typeof value !== 'string')
    throw new ArticleAdministrationError('invalid_request');
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 2048)
    throw new ArticleAdministrationError('invalid_request');
  return Object.freeze({
    value: trimmed,
    reason: normalizeReason(record.reason),
  });
}

function normalizeCategoryCommand(
  input: unknown,
): Readonly<{ categoryConfigKeys: readonly string[]; reason: string | null }> {
  const record = exactRecord(input, ['categoryConfigKeys', 'reason']);
  if (
    !Array.isArray(record.categoryConfigKeys) ||
    record.categoryConfigKeys.length > 100
  )
    throw new ArticleAdministrationError('invalid_request');
  const keys = new Set<string>();
  for (const value of record.categoryConfigKeys) {
    const key = normalizeRequiredConfigKey(value);
    keys.add(key);
  }
  return Object.freeze({
    categoryConfigKeys: Object.freeze([...keys].sort()),
    reason: normalizeReason(record.reason),
  });
}

function normalizeReasonCommand(input: unknown): ReasonCommand {
  const record = exactRecord(input, ['reason']);
  return Object.freeze({ reason: normalizeReason(record.reason) });
}

function normalizeReason(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string')
    throw new ArticleAdministrationError('invalid_request');
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_REASON_LENGTH)
    throw new ArticleAdministrationError('invalid_request');
  return trimmed;
}

function exactRecord(
  input: unknown,
  optionalKeys: readonly string[],
): Record<string, unknown> {
  const record = validateAdminInputRecord(input, [], optionalKeys);
  if (record === undefined)
    throw new ArticleAdministrationError('invalid_request');
  return record;
}

function normalizeArticleId(value: unknown): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value))
    throw new ArticleAdministrationError('invalid_request');
  return value.toLowerCase();
}

function normalizeOptionalQuery(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string')
    throw new ArticleAdministrationError('invalid_request');
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  if (Array.from(trimmed).length > MAX_QUERY_CODE_POINTS)
    throw new ArticleAdministrationError('invalid_request');
  return trimmed;
}

function normalizeOptionalConfigKey(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return normalizeRequiredConfigKey(value);
}

function normalizeRequiredConfigKey(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_CONFIG_KEY_LENGTH ||
    !CONFIG_KEY_PATTERN.test(value)
  )
    throw new ArticleAdministrationError('invalid_request');
  return value;
}

function normalizeOptionalUuid(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return normalizeArticleId(value);
}

function normalizeOptionalVisibility(
  value: unknown,
): ModerationVisibilityState | undefined {
  if (value === undefined) return undefined;
  if (value !== 'visible' && value !== 'hidden' && value !== 'archived')
    throw new ArticleAdministrationError('invalid_request');
  return value;
}

function normalizeOptionalDuplicateRole(
  value: unknown,
): ModerationDuplicateRole | undefined {
  if (value === undefined) return undefined;
  if (value !== 'ungrouped' && value !== 'primary' && value !== 'non_primary')
    throw new ArticleAdministrationError('invalid_request');
  return value;
}

function normalizeOptionalReviewState(
  value: unknown,
): ModerationReviewState | undefined {
  if (value === undefined) return undefined;
  if (
    value !== 'pending' &&
    value !== 'dismissed' &&
    value !== 'merged' &&
    value !== 'superseded'
  )
    throw new ArticleAdministrationError('invalid_request');
  return value;
}

function normalizeOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean')
    throw new ArticleAdministrationError('invalid_request');
  return value;
}

function normalizePageSize(
  value: unknown,
  defaultValue = ARTICLE_MODERATION_PAGE_SIZE,
  max = ARTICLE_MODERATION_MAX_PAGE_SIZE,
): number {
  if (value === undefined) return defaultValue;
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > max
  )
    throw new ArticleAdministrationError('invalid_request');
  return value;
}

function isCanonicalTimestamp(value: string): boolean {
  const match = CURSOR_TIMESTAMP_PATTERN.exec(value);
  if (match === null) return false;
  const [year, month, day, hour, minute, second] = match
    .slice(1, 7)
    .map(Number);
  if (
    [year, month, day, hour, minute, second].some((part) => part === undefined)
  )
    return false;
  const date = new Date(
    Date.UTC(year!, month! - 1, day!, hour!, minute!, second!, 0),
  );
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second
  );
}

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}
