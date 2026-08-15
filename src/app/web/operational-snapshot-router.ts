import type { Response, Router } from 'express';

import {
  OperationalSnapshotError,
  type OperationalSnapshotService,
} from '../../observability/operational-snapshot.ts';
import type { AdminApiRouteRegistrar } from './admin-router.ts';

export function registerOperationalSnapshotRoutes(
  service: OperationalSnapshotService,
): AdminApiRouteRegistrar {
  return (router: Router) => {
    router.get('/operations/snapshot', async (_request, response) => {
      try {
        response.status(200).json({ snapshot: await service.readSnapshot() });
      } catch (error) {
        sendOperationalSnapshotError(error, response);
      }
    });
  };
}

function sendOperationalSnapshotError(
  error: unknown,
  response: Response,
): void {
  if (!(error instanceof OperationalSnapshotError)) throw error;
  response.status(503).json({ error: 'service_unavailable' });
}
