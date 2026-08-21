import type { Request, Response, Router } from 'express';

import {
  DistributionProfileAdministrationError,
  type AdminDistributionProfileReadModel,
  type DistributionProfileAdministrationService,
} from '../../admin/distribution-profile-administration.ts';
import type { AdminApiRouteRegistrar } from './admin-router.ts';

export function registerDistributionProfileAdministrationRoutes(
  service: DistributionProfileAdministrationService,
): AdminApiRouteRegistrar {
  return (router: Router) => {
    router.get('/distribution-profiles', async (_request, response) => {
      try {
        response.status(200).json({ profiles: await service.listProfiles() });
      } catch (error) {
        sendDistributionProfileAdministrationError(error, response);
      }
    });

    router.post('/distribution-profiles', async (request, response) => {
      await sendProfileCommand(
        response,
        () => service.createProfile(request.body),
        201,
      );
    });

    router.get(
      '/distribution-profiles/:profileKey',
      async (request, response) => {
        await sendProfileCommand(response, () =>
          service.getProfile(profileKey(request)),
        );
      },
    );

    router.put(
      '/distribution-profiles/:profileKey/configuration',
      async (request, response) => {
        await sendProfileCommand(response, () =>
          service.replaceProfileConfiguration(
            profileKey(request),
            request.body,
          ),
        );
      },
    );

    router.put(
      '/distribution-profiles/:profileKey/lifecycle',
      async (request, response) => {
        await sendProfileCommand(response, () =>
          service.setProfileLifecycle(profileKey(request), request.body),
        );
      },
    );

    router.put(
      '/distribution-profiles/:profileKey/sources/:sourceKey',
      async (request, response) => {
        await sendProfileCommand(response, () =>
          service.replaceSourceAssociation(
            profileKey(request),
            sourceKey(request),
            request.body,
          ),
        );
      },
    );

    router.delete(
      '/distribution-profiles/:profileKey/sources/:sourceKey',
      async (request, response) => {
        await sendProfileCommand(response, () =>
          service.removeSourceAssociation(
            profileKey(request),
            sourceKey(request),
          ),
        );
      },
    );
  };
}

async function sendProfileCommand(
  response: Response,
  command: () => Promise<AdminDistributionProfileReadModel>,
  status = 200,
): Promise<void> {
  try {
    response.status(status).json({ profile: await command() });
  } catch (error) {
    sendDistributionProfileAdministrationError(error, response);
  }
}

function sendDistributionProfileAdministrationError(
  error: unknown,
  response: Response,
): void {
  if (!(error instanceof DistributionProfileAdministrationError)) throw error;
  const status =
    error.code === 'profile_not_found' ||
    error.code === 'source_not_found' ||
    error.code === 'profile_association_not_found'
      ? 404
      : error.code === 'profile_config_key_conflict' ||
          error.code === 'profile_invalid_lifecycle_transition' ||
          error.code === 'profile_requires_usable_source'
        ? 409
        : 400;
  response.status(status).json({ error: error.code });
}

function profileKey(request: Request): string | undefined {
  const value = request.params.profileKey;
  return Array.isArray(value) ? value[0] : value;
}

function sourceKey(request: Request): string | undefined {
  const value = request.params.sourceKey;
  return Array.isArray(value) ? value[0] : value;
}
