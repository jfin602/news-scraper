import type { Request, Response, Router } from 'express';

import {
  EndpointAdministrationError,
  type AdminEndpointReadModel,
  type EndpointAdministrationService,
} from '../../admin/endpoint-administration.ts';
import type { AdminApiRouteRegistrar } from './admin-router.ts';

export function registerEndpointAdministrationRoutes(
  service: EndpointAdministrationService,
): AdminApiRouteRegistrar {
  return (router: Router) => {
    router.get('/sources/:sourceKey/endpoints', async (request, response) => {
      try {
        response.status(200).json({
          endpoints: await service.listEndpoints(sourceKey(request)),
        });
      } catch (error) {
        sendEndpointAdministrationError(error, response);
      }
    });

    router.post('/sources/:sourceKey/endpoints', async (request, response) => {
      try {
        response.status(201).json({
          endpoint: await service.createEndpoint(
            sourceKey(request),
            request.body,
          ),
        });
      } catch (error) {
        sendEndpointAdministrationError(error, response);
      }
    });

    router.get(
      '/sources/:sourceKey/endpoints/:endpointKey',
      async (request, response) => {
        await sendEndpointCommand(response, () =>
          service.getEndpoint(sourceKey(request), endpointKey(request)),
        );
      },
    );

    router.put(
      '/sources/:sourceKey/endpoints/:endpointKey/configuration',
      async (request, response) => {
        await sendEndpointCommand(response, () =>
          service.replaceEndpointConfiguration(
            sourceKey(request),
            endpointKey(request),
            request.body,
          ),
        );
      },
    );

    router.put(
      '/sources/:sourceKey/endpoints/:endpointKey/approval',
      async (request, response) => {
        await sendEndpointCommand(response, () =>
          service.setEndpointApproval(
            sourceKey(request),
            endpointKey(request),
            request.body,
          ),
        );
      },
    );

    router.put(
      '/sources/:sourceKey/endpoints/:endpointKey/operational-state',
      async (request, response) => {
        await sendEndpointCommand(response, () =>
          service.setEndpointOperationalState(
            sourceKey(request),
            endpointKey(request),
            request.body,
          ),
        );
      },
    );

    router.put(
      '/sources/:sourceKey/endpoints/:endpointKey/lifecycle',
      async (request, response) => {
        await sendEndpointCommand(response, () =>
          service.setEndpointLifecycle(
            sourceKey(request),
            endpointKey(request),
            request.body,
          ),
        );
      },
    );
  };
}

async function sendEndpointCommand(
  response: Response,
  command: () => Promise<AdminEndpointReadModel>,
): Promise<void> {
  try {
    response.status(200).json({ endpoint: await command() });
  } catch (error) {
    sendEndpointAdministrationError(error, response);
  }
}

function sendEndpointAdministrationError(
  error: unknown,
  response: Response,
): void {
  if (!(error instanceof EndpointAdministrationError)) throw error;
  const status =
    error.code === 'source_not_found' || error.code === 'endpoint_not_found'
      ? 404
      : error.code === 'endpoint_config_key_conflict' ||
          error.code === 'endpoint_url_conflict' ||
          error.code === 'endpoint_domain_policy_conflict' ||
          error.code === 'source_archived' ||
          error.code === 'endpoint_archived'
        ? 409
        : 400;
  response.status(status).json({ error: error.code });
}

function sourceKey(request: Request): string | undefined {
  return routeParameter(request.params.sourceKey);
}

function endpointKey(request: Request): string | undefined {
  return routeParameter(request.params.endpointKey);
}

function routeParameter(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
