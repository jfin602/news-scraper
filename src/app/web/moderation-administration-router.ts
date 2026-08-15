import type { Request, Response, Router } from 'express';

import {
  ArticleAdministrationError,
  type ArticleAdministrationService,
} from '../../admin/article-administration.ts';
import {
  DuplicateAdministrationError,
  type DuplicateAdministrationService,
} from '../../admin/duplicate-administration.ts';
import {
  chooseDuplicatePrimary,
  dismissDuplicateReview,
  DuplicateModerationError,
  mergeDuplicateArticles,
  splitDuplicateGroup,
} from '../../deduplication/moderation.ts';
import type { Database } from '../../database/database.ts';
import type { AdminApiRouteRegistrar } from './admin-router.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export function registerModerationAdministrationRoutes(
  database: Database,
  articles: ArticleAdministrationService,
  duplicates: DuplicateAdministrationService,
): AdminApiRouteRegistrar {
  return (router: Router) => {
    router.get('/articles', async (request, response) => {
      try {
        response
          .status(200)
          .json(await articles.search(parseQuery(request, ARTICLE_QUERY_KEYS)));
      } catch (error) {
        sendArticleError(error, response);
      }
    });
    router.get('/articles/:articleId', async (request, response) => {
      try {
        response
          .status(200)
          .json({ article: await articles.getArticle(articleId(request)) });
      } catch (error) {
        sendArticleError(error, response);
      }
    });
    router.get('/articles/:articleId/history', async (request, response) => {
      try {
        response.status(200).json({
          history: await articles.listHistory(
            articleId(request),
            parseQuery(request, HISTORY_QUERY_KEYS),
          ),
        });
      } catch (error) {
        sendArticleError(error, response);
      }
    });
    router.put('/articles/:articleId/visibility', async (request, response) => {
      try {
        const body = exactBody(request.body, ['action', 'reason']);
        if (body.action !== 'hide' && body.action !== 'restore')
          throw new ArticleAdministrationError('invalid_request');
        const result =
          body.action === 'hide'
            ? await articles.hideArticle(articleId(request), {
                reason: body.reason,
              })
            : await articles.restoreArticle(articleId(request), {
                reason: body.reason,
              });
        response.status(200).json(result);
      } catch (error) {
        sendArticleError(error, response);
      }
    });
    router.put(
      '/articles/:articleId/display-title',
      async (request, response) => {
        try {
          response
            .status(200)
            .json(
              await articles.setDisplayTitleOverride(
                articleId(request),
                request.body,
              ),
            );
        } catch (error) {
          sendArticleError(error, response);
        }
      },
    );
    router.delete(
      '/articles/:articleId/display-title',
      async (request, response) => {
        try {
          response
            .status(200)
            .json(
              await articles.clearDisplayTitleOverride(
                articleId(request),
                request.body,
              ),
            );
        } catch (error) {
          sendArticleError(error, response);
        }
      },
    );
    router.put('/articles/:articleId/categories', async (request, response) => {
      try {
        response
          .status(200)
          .json(
            await articles.setCategoryOverride(
              articleId(request),
              request.body,
            ),
          );
      } catch (error) {
        sendArticleError(error, response);
      }
    });
    router.delete(
      '/articles/:articleId/categories',
      async (request, response) => {
        try {
          response
            .status(200)
            .json(
              await articles.clearCategoryOverride(
                articleId(request),
                request.body,
              ),
            );
        } catch (error) {
          sendArticleError(error, response);
        }
      },
    );

    router.get('/duplicate-reviews', async (request, response) => {
      try {
        response
          .status(200)
          .json(
            await duplicates.searchReviews(
              parseQuery(request, DUPLICATE_QUERY_KEYS),
            ),
          );
      } catch (error) {
        sendDuplicateError(error, response);
      }
    });
    router.get('/duplicate-reviews/:candidateId', async (request, response) => {
      try {
        response.status(200).json({
          review: await duplicates.getReview(uuid(request.params.candidateId)),
        });
      } catch (error) {
        sendDuplicateError(error, response);
      }
    });
    router.post(
      '/duplicate-reviews/:candidateId/dismiss',
      async (request, response) => {
        try {
          sendModerationResult(
            response,
            await dismissDuplicateReview(
              database,
              uuid(request.params.candidateId),
              reason(exactBody(request.body, ['reason']).reason),
            ),
          );
        } catch (error) {
          sendModerationError(error, response);
        }
      },
    );
    router.post('/duplicate-groups/merge', async (request, response) => {
      try {
        const body = exactBody(request.body, [
          'articleIds',
          'primaryArticleId',
          'reason',
        ]);
        const ids = uuidArray(body.articleIds, 2);
        sendModerationResult(
          response,
          await mergeDuplicateArticles(database, ids, {
            ...(body.primaryArticleId === undefined
              ? {}
              : { primaryArticleId: uuid(body.primaryArticleId) }),
            reason: reason(body.reason),
          }),
        );
      } catch (error) {
        sendModerationError(error, response);
      }
    });
    router.post(
      '/duplicate-groups/:groupId/split',
      async (request, response) => {
        try {
          const body = exactBody(request.body, ['articleIds', 'reason']);
          sendModerationResult(
            response,
            await splitDuplicateGroup(
              database,
              uuid(request.params.groupId),
              uuidArray(body.articleIds, 1),
              reason(body.reason),
            ),
          );
        } catch (error) {
          sendModerationError(error, response);
        }
      },
    );
    router.post(
      '/duplicate-groups/:groupId/primary',
      async (request, response) => {
        try {
          const body = exactBody(request.body, ['articleId', 'reason']);
          sendModerationResult(
            response,
            await chooseDuplicatePrimary(
              database,
              uuid(request.params.groupId),
              uuid(body.articleId),
              reason(body.reason),
            ),
          );
        } catch (error) {
          sendModerationError(error, response);
        }
      },
    );
  };
}

const ARTICLE_QUERY_KEYS = [
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
];
const HISTORY_QUERY_KEYS = ['pageSize', 'cursor'];
const DUPLICATE_QUERY_KEYS = ['state', 'confidence', 'pageSize', 'cursor'];

function parseQuery(
  request: Request,
  allowed: readonly string[],
): Record<string, unknown> {
  const url = new URL(request.originalUrl, 'http://localhost');
  const result: Record<string, unknown> = {};
  for (const [key, value] of url.searchParams) {
    if (!allowed.includes(key) || Object.hasOwn(result, key))
      throw new ArticleAdministrationError('invalid_request');
    result[key] =
      key === 'pageSize' || key === 'confidence'
        ? Number(value)
        : key === 'duplicateReviewParticipating'
          ? value === 'true'
            ? true
            : value === 'false'
              ? false
              : value
          : value;
  }
  return result;
}

function exactBody(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new ArticleAdministrationError('invalid_request');
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !keys.includes(key)))
    throw new ArticleAdministrationError('invalid_request');
  return body;
}
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value))
    throw new DuplicateModerationError('invalid_input');
  return value.toLowerCase();
}
function uuidArray(value: unknown, minimum: number): string[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > 100)
    throw new DuplicateModerationError('invalid_input');
  const result = value.map(uuid);
  if (new Set(result).size !== result.length)
    throw new DuplicateModerationError('invalid_input');
  return result;
}
function reason(value: unknown): string | null {
  if (
    value !== undefined &&
    value !== null &&
    (typeof value !== 'string' ||
      value.trim() === '' ||
      value.length > 2000 ||
      value !== value.trim())
  )
    throw new DuplicateModerationError('invalid_input');
  return value === undefined || value === null ? null : value;
}
function articleId(request: Request): string {
  const value = request.params.articleId;
  if (typeof value !== 'string')
    throw new ArticleAdministrationError('invalid_request');
  return value;
}
function sendArticleError(error: unknown, response: Response): void {
  if (!(error instanceof ArticleAdministrationError)) throw error;
  response
    .status(
      error.code === 'article_not_found'
        ? 404
        : error.code === 'article_visibility_conflict'
          ? 409
          : error.code === 'category_not_found'
            ? 404
            : 400,
    )
    .json({ error: error.code });
}
function sendDuplicateError(error: unknown, response: Response): void {
  if (error instanceof ArticleAdministrationError) {
    response.status(400).json({ error: 'invalid_request' });
    return;
  }
  if (!(error instanceof DuplicateAdministrationError)) throw error;
  response
    .status(error.code === 'duplicate_review_not_found' ? 404 : 400)
    .json({ error: error.code });
}
function sendModerationResult(
  response: Response,
  result: { outcome: string },
): void {
  const status =
    result.outcome === 'not_found'
      ? 404
      : result.outcome === 'conflict'
        ? 409
        : 200;
  response.status(status).json(result);
}
function sendModerationError(error: unknown, response: Response): void {
  if (error instanceof DuplicateModerationError)
    response.status(error.reason === 'invalid_input' ? 400 : 500).json({
      error:
        error.reason === 'invalid_input' ? 'invalid_request' : 'internal_error',
    });
  else throw error;
}
