import express, { type Express } from 'express';

import type { PublicFeed } from '../../public-feed/repository.ts';

export interface ReadinessDependency {
  checkReady(): Promise<boolean>;
}

export interface PublicFeedDependency {
  read(publicationSlug: string): Promise<PublicFeed | undefined>;
}

export interface WebDependencies {
  readonly readiness: ReadinessDependency;
  readonly publicFeed: PublicFeedDependency;
}

export function createWebApp(dependencies: WebDependencies): Express {
  const app = express();
  app.disable('x-powered-by');

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

  app.get(
    '/api/publications/:publicationSlug/feed',
    async (request, response) => {
      response.set('Cache-Control', 'no-store');
      try {
        const feed = await dependencies.publicFeed.read(
          request.params.publicationSlug,
        );
        if (feed === undefined) {
          response.status(404).json({ error: 'not_found' });
          return;
        }
        response.status(200).json({
          publication: feed.publication,
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
    },
  );

  return app;
}
