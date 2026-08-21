import type { Request, Response, Router } from 'express';

import {
  DistributionCredentialAdministrationError,
  type DistributionCredentialAdministrationService,
} from '../../admin/distribution-credential-administration.ts';
import type { AdminApiRouteRegistrar } from './admin-router.ts';

export function registerDistributionCredentialAdministrationRoutes(
  service: DistributionCredentialAdministrationService,
): AdminApiRouteRegistrar {
  return (router: Router) => {
    router.get('/distribution-credentials', async (_request, response) => {
      try {
        response
          .status(200)
          .json({ credentials: await service.listCredentials() });
      } catch (error) {
        sendCredentialAdministrationError(error, response);
      }
    });
    router.post('/distribution-credentials', async (request, response) => {
      await sendIssued(
        response,
        () => service.createCredential(request.body),
        201,
      );
    });
    router.post(
      '/distribution-credentials/:lookupId/revoke',
      async (request, response) => {
        await sendCredential(response, () =>
          service.revokeCredential(lookupId(request)),
        );
      },
    );
    router.post(
      '/distribution-credentials/:lookupId/rotate',
      async (request, response) => {
        await sendIssued(
          response,
          () => service.rotateCredential(lookupId(request), request.body),
          200,
        );
      },
    );
  };
}

async function sendCredential(
  response: Response,
  command: () => ReturnType<
    DistributionCredentialAdministrationService['revokeCredential']
  >,
): Promise<void> {
  try {
    response.status(200).json({ credential: await command() });
  } catch (error) {
    sendCredentialAdministrationError(error, response);
  }
}
async function sendIssued(
  response: Response,
  command: () => ReturnType<
    DistributionCredentialAdministrationService['createCredential']
  >,
  status: number,
): Promise<void> {
  try {
    response.status(status).json(await command());
  } catch (error) {
    sendCredentialAdministrationError(error, response);
  }
}
function sendCredentialAdministrationError(
  error: unknown,
  response: Response,
): void {
  if (!(error instanceof DistributionCredentialAdministrationError))
    throw error;
  response
    .status(
      error.code === 'credential_not_found'
        ? 404
        : error.code === 'credential_already_rotated'
          ? 409
          : 400,
    )
    .json({ error: error.code });
}
function lookupId(request: Request): string | undefined {
  const value = request.params.lookupId;
  return Array.isArray(value) ? value[0] : value;
}
