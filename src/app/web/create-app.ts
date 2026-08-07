import express, { type Express } from 'express';

export interface ReadinessDependency {
  checkReady(): Promise<boolean>;
}

export function createWebApp(readiness: ReadinessDependency): Express {
  const app = express();
  app.disable('x-powered-by');

  app.get('/health/live', (_request, response) => {
    response.set('Cache-Control', 'no-store');
    response.status(200).json({ status: 'ok', role: 'web' });
  });
  app.get('/health/ready', async (_request, response) => {
    response.set('Cache-Control', 'no-store');
    try {
      if (await readiness.checkReady()) {
        response.status(200).json({ status: 'ready', role: 'web' });
        return;
      }
    } catch {
      // Health responses deliberately hide dependency details.
    }
    response.status(503).json({ status: 'not_ready', role: 'web' });
  });

  return app;
}
