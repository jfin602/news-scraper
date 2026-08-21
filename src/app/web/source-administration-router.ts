import type { Request, Response, Router } from 'express';

import {
  SourceAdministrationError,
  type AdminSourceReadModel,
  type SourceAdministrationService,
} from '../../admin/source-administration.ts';
import type { AdminApiRouteRegistrar } from './admin-router.ts';

export function registerSourceAdministrationRoutes(
  service: SourceAdministrationService,
): AdminApiRouteRegistrar {
  return (router: Router) => {
    router.get('/sources', async (_request, response) => {
      try {
        response.status(200).json({ sources: await service.listSources() });
      } catch (error) {
        sendSourceAdministrationError(error, response);
      }
    });

    router.post('/sources', async (request, response) => {
      try {
        response
          .status(201)
          .json({ source: await service.createSource(request.body) });
      } catch (error) {
        sendSourceAdministrationError(error, response);
      }
    });

    router.get('/sources/:sourceKey', async (request, response) => {
      await sendSourceCommand(response, () =>
        service.getSource(sourceKey(request)),
      );
    });

    router.put(
      '/sources/:sourceKey/configuration',
      async (request, response) => {
        await sendSourceCommand(response, () =>
          service.replaceSourceConfiguration(sourceKey(request), request.body),
        );
      },
    );

    router.put('/sources/:sourceKey/approval', async (request, response) => {
      await sendSourceCommand(response, () =>
        service.setSourceApproval(sourceKey(request), request.body),
      );
    });

    router.put(
      '/sources/:sourceKey/operational-state',
      async (request, response) => {
        await sendSourceCommand(response, () =>
          service.setSourceOperationalState(sourceKey(request), request.body),
        );
      },
    );

    router.put('/sources/:sourceKey/lifecycle', async (request, response) => {
      await sendSourceCommand(response, () =>
        service.setSourceLifecycle(sourceKey(request), request.body),
      );
    });
  };
}

async function sendSourceCommand(
  response: Response,
  command: () => Promise<AdminSourceReadModel>,
): Promise<void> {
  try {
    response.status(200).json({ source: await command() });
  } catch (error) {
    sendSourceAdministrationError(error, response);
  }
}

function sendSourceAdministrationError(
  error: unknown,
  response: Response,
): void {
  if (!(error instanceof SourceAdministrationError)) throw error;
  const status =
    error.code === 'source_not_found'
      ? 404
      : error.code === 'source_config_key_conflict' ||
          error.code === 'source_domain_policy_conflict' ||
          error.code === 'source_archived' ||
          error.code === 'source_required_by_active_profile'
        ? 409
        : 400;
  response.status(status).json({ error: error.code });
}

function sourceKey(request: Request): string | undefined {
  const value = request.params.sourceKey;
  return Array.isArray(value) ? value[0] : value;
}
