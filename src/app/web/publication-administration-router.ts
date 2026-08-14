import type { Response, Router } from 'express';

import {
  PublicationAdministrationError,
  type AdminPublicationReadModel,
  type PublicationAdministrationService,
} from '../../admin/publication-administration.ts';
import type { AdminApiRouteRegistrar } from './admin-router.ts';

export function registerPublicationAdministrationRoutes(
  service: PublicationAdministrationService,
): AdminApiRouteRegistrar {
  return (router: Router) => {
    router.get('/publication', async (_request, response) => {
      await sendPublicationCommand(response, () => service.getPublication());
    });
    router.put('/publication/configuration', async (request, response) => {
      await sendPublicationCommand(response, () =>
        service.replacePublication(request.body),
      );
    });
  };
}

async function sendPublicationCommand(
  response: Response,
  command: () => Promise<AdminPublicationReadModel>,
): Promise<void> {
  try {
    response.status(200).json({ publication: await command() });
  } catch (error) {
    if (!(error instanceof PublicationAdministrationError)) throw error;
    response
      .status(error.code === 'publication_not_found' ? 404 : 400)
      .json({ error: error.code });
  }
}
