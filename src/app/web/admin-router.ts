import express, { type Router } from 'express';

import {
  adminApiErrorHandler,
  enforceAdminMutationIntegrity,
  setAdminSecurityHeaders,
} from './admin-api-security.ts';
import { registerAdminPageRoutes } from './admin-page.ts';

export type AdminApiRouteRegistrar = (router: Router) => void;

export function createAdminPageRouter(): Router {
  const router = express.Router();
  router.use(setAdminSecurityHeaders);
  registerAdminPageRoutes(router);
  return router;
}

export function createAdminApiRouter(
  registerRoutes?: AdminApiRouteRegistrar,
): Router {
  const router = express.Router();
  router.use(setAdminSecurityHeaders);
  router.use(enforceAdminMutationIntegrity);
  registerRoutes?.(router);
  router.use((_request, response) => {
    response.status(404).json({ error: 'not_found' });
  });
  router.use(adminApiErrorHandler);
  return router;
}
