import { readFileSync } from 'node:fs';

import express, { type Express } from 'express';

import {
  PublicDiscoveryInputError,
  type PublicDiscoveryRequest,
  parsePublicDiscoveryRequest,
} from '../../public-feed/discovery.ts';
import {
  PublicFeedRepositoryError,
  type PublicDiscoveryChoice,
  type PublicFeed,
} from '../../public-feed/repository.ts';
import { sendPublicFeedPage } from './public-feed-page.ts';

const publicFeedStylesheet = readFileSync(
  new URL('./public/public-feed.css', import.meta.url),
  'utf8',
);
const publicFeedClient = readFileSync(
  new URL('./public/public-feed.js', import.meta.url),
  'utf8',
);

export interface ReadinessDependency {
  checkReady(): Promise<boolean>;
}

export interface PublicFeedDependency {
  read(request: PublicDiscoveryRequest): Promise<PublicFeed | undefined>;
}

export interface WebDependencies {
  readonly readiness: ReadinessDependency;
  readonly publicFeed: PublicFeedDependency;
}

export function createWebApp(dependencies: WebDependencies): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use((_request, response, next) => {
    response.set('X-Content-Type-Options', 'nosniff');
    next();
  });

  app.get('/health/live', (_request, response) => {
    response.set('Cache-Control', 'no-store');
    response.status(200).json({ status: 'ok', role: 'web' });
  });
  app.get('/health/ready', async (_request, response) => {
    response.set('Cache-Control', 'no-store');
    try {
      if (await dependencies.readiness.checkReady()) {
        response.status(200).json({ status: 'ready', role: 'web' });
        return;
      }
    } catch {
      // Health responses deliberately hide dependency details.
    }
    response.status(503).json({ status: 'not_ready', role: 'web' });
  });

  app.get('/api/feed', async (request, response) => {
    response.set('Cache-Control', 'no-store');

    let discoveryRequest: PublicDiscoveryRequest;
    try {
      discoveryRequest = parsePublicDiscoveryRequest(rawQueryString(request));
    } catch (error) {
      if (error instanceof PublicDiscoveryInputError) {
        response.status(400).json({ error: 'invalid_request' });
        return;
      }
      response.status(503).json({ error: 'service_unavailable' });
      return;
    }

    try {
      const feed = await dependencies.publicFeed.read(discoveryRequest);
      if (feed === undefined) {
        response.status(404).json({ error: 'not_found' });
        return;
      }
      response.status(200).json({
        publication: { name: feed.publication.name },
        discovery: {
          query: {
            q: discoveryRequest.keywordQuery ?? null,
            source: discoveryRequest.sourceConfigKey ?? null,
            category: discoveryRequest.categoryConfigKey ?? null,
          },
          sources: publicDiscoveryChoices(feed.sourceChoices),
          categories: publicDiscoveryChoices(feed.categoryChoices),
        },
        items: feed.items.map((item) => ({
          articleId: item.articleId,
          effectiveFeedDate: item.effectiveFeedDate.toISOString(),
          feedDateSource: item.feedDateSource,
          headline: item.headline,
          sourceName: item.sourceName,
          originalUrl: item.originalUrl,
        })),
        nextCursor: feed.nextCursor ?? null,
      });
    } catch (error) {
      if (
        error instanceof PublicFeedRepositoryError &&
        error.reason === 'unsupported_discovery_filter'
      ) {
        response.status(400).json({ error: 'invalid_request' });
        return;
      }
      response.status(503).json({ error: 'service_unavailable' });
    }
  });

  app.get('/public-feed.css', (_request, response) => {
    response
      .set('Cache-Control', 'no-store')
      .status(200)
      .type('css')
      .send(publicFeedStylesheet);
  });

  app.get('/public-feed.js', (_request, response) => {
    response
      .set('Cache-Control', 'no-store')
      .status(200)
      .type('js')
      .send(publicFeedClient);
  });

  app.get('/', (_request, response) => {
    sendPublicFeedPage(response);
  });

  return app;
}

function rawQueryString(request: { readonly originalUrl: string }): string {
  const queryIndex = request.originalUrl.indexOf('?');
  return queryIndex === -1 ? '' : request.originalUrl.slice(queryIndex + 1);
}

function publicDiscoveryChoices(
  choices: readonly PublicDiscoveryChoice[] | undefined,
): readonly PublicDiscoveryChoice[] {
  return (choices ?? []).map((choice) => ({
    configKey: choice.configKey,
    displayName: choice.displayName,
  }));
}
