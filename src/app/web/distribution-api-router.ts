import { Router, type Request, type Response } from 'express';

import type {
  DistributionProfilePageItem,
  DistributionProfilePageOutcome,
  DistributionProfilePageService,
} from '../../distribution/profile-page.ts';
import type {
  MachineRequestGuardInput,
  MachineRequestGuardResult,
} from '../../distribution/credentials/machine-request-guard.ts';
import type { MachineAuthenticationPrincipal } from '../../distribution/credentials/machine-authentication.ts';

export const DISTRIBUTION_API_VERSION = 'v1';
const MAXIMUM_IF_NONE_MATCH_LENGTH = 8_192;

export interface DistributionApiRequestGuard {
  guard(input: MachineRequestGuardInput): Promise<MachineRequestGuardResult>;
}

export interface DistributionApiTelemetryEvent {
  readonly event: 'distribution_request';
  readonly apiVersion: typeof DISTRIBUTION_API_VERSION;
  readonly profileKey: string | null;
  readonly status: number;
  readonly outcome:
    | 'success'
    | 'not_modified'
    | 'invalid_request'
    | 'unauthenticated'
    | 'rate_limited'
    | 'not_found'
    | 'profile_disabled'
    | 'snapshot_changed'
    | 'service_unavailable';
  readonly durationMilliseconds: number;
  readonly itemCount?: number;
  readonly continuation?: boolean;
  readonly credential?: Readonly<{
    credentialId: string;
    lookupId: string;
  }>;
  readonly classification?:
    | 'invalid_authentication'
    | 'authenticated_credential'
    | 'missing'
    | 'draft'
    | 'disabled'
    | 'snapshot_changed'
    | 'dependency_failure';
}

export interface DistributionApiRouterDependencies {
  readonly pageService: DistributionProfilePageService;
  readonly requestGuard: DistributionApiRequestGuard;
  readonly invalidAuthNetworkKey: (request: Request) => string;
  readonly now?: () => Date;
  telemetry?: (event: DistributionApiTelemetryEvent) => void;
}

interface ParsedRequest {
  readonly profileKey: string;
  readonly cursor: string | undefined;
}

export function createDistributionApiRouter(
  dependencies: DistributionApiRouterDependencies,
): Router {
  const router = Router();
  const now = dependencies.now ?? (() => new Date());

  router.get('/:profileKey', async (request, response) => {
    const startedAt = now();
    let parsed: ParsedRequest | undefined;
    let principal: MachineAuthenticationPrincipal | undefined;
    let event:
      Omit<DistributionApiTelemetryEvent, 'durationMilliseconds'> | undefined;

    try {
      parsed = parseRequest(request);
      if (parsed === undefined) {
        event = respondError(response, 400, 'invalid_request');
        return;
      }

      let guard: MachineRequestGuardResult;
      try {
        guard = await dependencies.requestGuard.guard({
          authorizationHeader: request.get('Authorization') || undefined,
          invalidAuthNetworkKey: dependencies.invalidAuthNetworkKey(request),
        });
      } catch {
        event = respondError(response, 503, 'service_unavailable', {
          profileKey: parsed.profileKey,
          classification: 'dependency_failure',
        });
        return;
      }

      if (guard.outcome === 'unauthenticated') {
        event = respondError(response, 401, 'unauthenticated', {
          profileKey: parsed.profileKey,
          classification: 'invalid_authentication',
        });
        return;
      }
      if (guard.outcome === 'rate_limited') {
        response.set('Retry-After', String(guard.retryAfterSeconds));
        event = respondError(response, 429, 'rate_limited', {
          profileKey: parsed.profileKey,
          classification: guard.classification,
        });
        return;
      }
      principal = guard.principal;

      let page: DistributionProfilePageOutcome;
      try {
        page = await dependencies.pageService.read(
          parsed.profileKey,
          parsed.cursor,
        );
      } catch {
        event = respondError(response, 503, 'service_unavailable', {
          profileKey: parsed.profileKey,
          principal,
          classification: 'dependency_failure',
        });
        return;
      }
      event = respondPage(response, page, parsed, principal, now);
    } catch {
      event = respondError(response, 503, 'service_unavailable', {
        ...(parsed === undefined ? {} : { profileKey: parsed.profileKey }),
        ...(principal === undefined ? {} : { principal }),
        classification: 'dependency_failure',
      });
    } finally {
      if (event !== undefined) {
        emitTelemetry(dependencies.telemetry, {
          ...event,
          durationMilliseconds: durationMilliseconds(startedAt, now()),
        });
      }
    }
  });
  return router;
}

function parseRequest(request: Request): ParsedRequest | undefined {
  if (typeof request.params.profileKey !== 'string') return undefined;
  const rawQuery = rawQueryString(request);
  let parameters: URLSearchParams;
  try {
    parameters = new URLSearchParams(rawQuery);
  } catch {
    return undefined;
  }
  const entries = [...parameters.entries()];
  if (
    entries.some(([key]) => key !== 'cursor') ||
    entries.filter(([key]) => key === 'cursor').length > 1
  ) {
    return undefined;
  }
  const cursor = parameters.get('cursor');
  if (cursor !== null && cursor.length === 0) return undefined;
  return { profileKey: request.params.profileKey, cursor: cursor ?? undefined };
}

function respondPage(
  response: Response,
  page: DistributionProfilePageOutcome,
  request: ParsedRequest,
  principal: MachineAuthenticationPrincipal,
  now: () => Date,
): Omit<DistributionApiTelemetryEvent, 'durationMilliseconds'> {
  if (page.kind !== 'active') {
    return respondNonActive(response, page, request.profileKey, principal);
  }
  const etag = quotedEtag(page.snapshotRevision);
  if (etag === undefined) {
    return respondError(response, 503, 'service_unavailable', {
      profileKey: request.profileKey,
      principal,
      classification: 'dependency_failure',
    });
  }
  response.set({ 'Cache-Control': 'private, no-cache', ETag: etag });
  if (
    request.cursor === undefined &&
    ifNoneMatchMatches(response.req.get('If-None-Match'), etag)
  ) {
    response.status(304).end();
    return event(304, 'not_modified', request.profileKey, principal, {
      itemCount: 0,
      continuation: false,
    });
  }
  response.status(200).json({
    apiVersion: DISTRIBUTION_API_VERSION,
    generatedAt: isoDate(now()),
    snapshotRevision: page.snapshotRevision,
    profile: {
      configKey: page.profile.configKey,
      displayName: page.profile.displayName,
    },
    publication: { name: page.publication.name },
    items: page.items.map(serializeItem),
    nextCursor: page.nextCursor,
  });
  return event(200, 'success', request.profileKey, principal, {
    itemCount: page.items.length,
    continuation: request.cursor !== undefined,
  });
}

function respondNonActive(
  response: Response,
  page: Exclude<DistributionProfilePageOutcome, { kind: 'active' }>,
  profileKey: string,
  principal: MachineAuthenticationPrincipal,
): Omit<DistributionApiTelemetryEvent, 'durationMilliseconds'> {
  switch (page.kind) {
    case 'invalid_input':
      return respondError(response, 400, 'invalid_request', {
        profileKey,
        principal,
      });
    case 'not_found':
      return respondError(response, 404, 'not_found', {
        profileKey,
        principal,
        classification: 'missing',
      });
    case 'draft':
      return respondError(response, 404, 'not_found', {
        profileKey,
        principal,
        classification: 'draft',
      });
    case 'disabled':
      return respondError(response, 409, 'profile_disabled', {
        profileKey,
        principal,
        classification: 'disabled',
      });
    case 'snapshot_changed':
      return respondError(response, 409, 'snapshot_changed', {
        profileKey,
        principal,
        classification: 'snapshot_changed',
      });
    case 'read_failed':
      return respondError(response, 503, 'service_unavailable', {
        profileKey,
        principal,
        classification: 'dependency_failure',
      });
  }
}

function respondError(
  response: Response,
  status: 400 | 401 | 404 | 409 | 429 | 503,
  outcome: DistributionApiTelemetryEvent['outcome'],
  details: Partial<
    Pick<
      DistributionApiTelemetryEvent,
      'profileKey' | 'credential' | 'classification'
    >
  > & { readonly principal?: MachineAuthenticationPrincipal } = {},
): Omit<DistributionApiTelemetryEvent, 'durationMilliseconds'> {
  response.set('Cache-Control', 'private, no-store');
  response.status(status).json({ error: outcome });
  return event(status, outcome, details.profileKey ?? null, details.principal, {
    ...(details.classification === undefined
      ? {}
      : { classification: details.classification }),
  });
}

function event(
  status: number,
  outcome: DistributionApiTelemetryEvent['outcome'],
  profileKey: string | null,
  principal: MachineAuthenticationPrincipal | undefined,
  extra: Partial<
    Pick<
      DistributionApiTelemetryEvent,
      'itemCount' | 'continuation' | 'classification'
    >
  >,
): Omit<DistributionApiTelemetryEvent, 'durationMilliseconds'> {
  return {
    event: 'distribution_request',
    apiVersion: DISTRIBUTION_API_VERSION,
    profileKey: boundedProfileKey(profileKey),
    status,
    outcome,
    ...(extra.itemCount === undefined ? {} : { itemCount: extra.itemCount }),
    ...(extra.continuation === undefined
      ? {}
      : { continuation: extra.continuation }),
    ...(extra.classification === undefined
      ? {}
      : { classification: extra.classification }),
    ...(principal === undefined
      ? {}
      : {
          credential: {
            credentialId: principal.credentialId,
            lookupId: principal.lookupId,
          },
        }),
  };
}

function boundedProfileKey(profileKey: string | null): string | null {
  return profileKey !== null && profileKey.length <= 128 ? profileKey : null;
}

function serializeItem(item: DistributionProfilePageItem) {
  return {
    articleId: item.articleId,
    headline: item.headline,
    originalUrl: item.originalUrl,
    effectiveFeedDate: isoDate(item.effectiveFeedDate),
    feedDateSource: item.feedDateSource,
    publishedAt: item.publishedAt === null ? null : isoDate(item.publishedAt),
    author: item.author,
    summary: item.summary,
    imageUrl: item.imageUrl,
    source: {
      configKey: item.source.configKey,
      displayName: item.source.displayName,
    },
    categories: item.categories.map((category) => ({
      configKey: category.configKey,
      displayName: category.displayName,
    })),
  };
}

function rawQueryString(request: Request): string {
  const queryIndex = request.originalUrl.indexOf('?');
  return queryIndex === -1 ? '' : request.originalUrl.slice(queryIndex + 1);
}

function quotedEtag(revision: string): string | undefined {
  return /^[\x21\x23-\x7e]+$/u.test(revision) ? `"${revision}"` : undefined;
}

function ifNoneMatchMatches(value: string | undefined, etag: string): boolean {
  if (value === undefined || value.length > MAXIMUM_IF_NONE_MATCH_LENGTH)
    return false;
  return value.split(',').some((candidate) => {
    const tag = candidate.trim();
    return tag === '*' || tag.replace(/^W\//u, '') === etag;
  });
}

function isoDate(value: Date): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error('Distribution API received an invalid date.');
  }
  return value.toISOString();
}

function durationMilliseconds(start: Date, end: Date): number {
  if (!(start instanceof Date) || !(end instanceof Date)) return 0;
  return Math.max(0, end.getTime() - start.getTime());
}

function emitTelemetry(
  telemetry: DistributionApiRouterDependencies['telemetry'],
  telemetryEvent: DistributionApiTelemetryEvent,
): void {
  try {
    telemetry?.(telemetryEvent);
  } catch {
    // Telemetry is operational and must not alter the machine response.
  }
}
