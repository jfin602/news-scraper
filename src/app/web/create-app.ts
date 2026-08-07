import express, { type Express } from 'express';

export function createWebApp(): Express {
  const app = express();
  app.disable('x-powered-by');

  app.get('/health/live', (_request, response) => {
    response.set('Cache-Control', 'no-store');
    response.status(200).json({ status: 'ok', role: 'web' });
  });
  app.get('/health/ready', (_request, response) => {
    response.set('Cache-Control', 'no-store');
    response.status(200).json({ status: 'ready', role: 'web' });
  });

  return app;
}
