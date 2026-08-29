import type { Request, Response, Router } from 'express';

import {
  ProfileAiAdministrationError,
  type ProfileAiAdministrationService,
} from '../../admin/profile-ai-administration.ts';
import type { AdminApiRouteRegistrar } from './admin-router.ts';

export function registerProfileAiAdministrationRoutes(
  service: ProfileAiAdministrationService,
): AdminApiRouteRegistrar {
  return (router: Router) => {
    router.get(
      '/distribution-profiles/:profileKey/ai',
      async (request, response) => {
        await sendAiCommand(response, () =>
          service.getProfileAi(profileKey(request)),
        );
      },
    );
    router.put(
      '/distribution-profiles/:profileKey/ai/configuration',
      async (request, response) => {
        await sendAiCommand(response, () =>
          service.updateProfileAiConfiguration(
            profileKey(request),
            request.body,
          ),
        );
      },
    );
    router.post(
      '/distribution-profiles/:profileKey/ai/generate',
      async (request, response) => {
        try {
          const result = await service.forceGenerateProfileDigest(
            profileKey(request),
          );
          response.status(200).json(result);
        } catch (error) {
          sendProfileAiAdministrationError(error, response);
        }
      },
    );
  };
}

async function sendAiCommand(
  response: Response,
  command: () => Promise<unknown>,
): Promise<void> {
  try {
    response.status(200).json({ ai: await command() });
  } catch (error) {
    sendProfileAiAdministrationError(error, response);
  }
}

function sendProfileAiAdministrationError(
  error: unknown,
  response: Response,
): void {
  if (!(error instanceof ProfileAiAdministrationError)) throw error;
  const status =
    error.code === 'profile_not_found'
      ? 404
      : error.code === 'digest_disabled' ||
          error.code === 'digest_no_input' ||
          error.code === 'digest_generation_in_progress'
        ? 409
        : 400;
  response.status(status).json({ error: error.code });
}

function profileKey(request: Request): string | undefined {
  const value = request.params.profileKey;
  return Array.isArray(value) ? value[0] : value;
}
