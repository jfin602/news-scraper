import { readFileSync } from 'node:fs';

import express, { type Express } from 'express';

import type { PublicFeed } from '../../public-feed/repository.ts';
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
  read(): Promise<PublicFeed | undefined>;
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

  app.get('/api/feed', async (_request, response) => {
    response.set('Cache-Control', 'no-store');
    try {
      const feed = await dependencies.publicFeed.read();
      if (feed === undefined) {
        response.status(404).json({ error: 'not_found' });
        return;
      }
      response.status(200).json({
        publication: { name: feed.publication.name },
        items: feed.items.map((item) => ({
          articleId: item.articleId,
          effectiveFeedDate: item.effectiveFeedDate.toISOString(),
          feedDateSource: item.feedDateSource,
          headline: item.headline,
          sourceName: item.sourceName,
          originalUrl: item.originalUrl,
        })),
      });
    } catch {
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

  app.get('/publications/:publicationSlug', (_request, response) => {
    sendPublicFeedPage(response);
  });

  return app;
}
