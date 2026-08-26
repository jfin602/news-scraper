import type { Request, Response, Router } from 'express';

import {
  PhpIntegrationPackageError,
  type PhpIntegrationPackageProducer,
} from '../../integrations/php-integration-package.ts';
import type { AdminApiRouteRegistrar } from './admin-router.ts';

const DOWNLOAD_PATH = '/php-integration/download';
const DOWNLOAD_ERROR = 'integration_package_unavailable';

export function registerPhpIntegrationDownloadRoutes(
  producer: PhpIntegrationPackageProducer,
): AdminApiRouteRegistrar {
  return (router: Router) => {
    router.get(
      DOWNLOAD_PATH,
      async (request: Request, response: Response, next) => {
        if (Object.keys(request.query).length > 0) {
          response.status(400).json({ error: 'invalid_request' });
          return;
        }

        try {
          const packageResult = await producer.build();
          response
            .status(200)
            .set({
              'Content-Type': packageResult.contentType,
              'Content-Disposition': `attachment; filename="${packageResult.filename}"`,
              'Content-Length': String(packageResult.bytes.length),
            })
            .send(packageResult.bytes);
        } catch (error) {
          if (error instanceof PhpIntegrationPackageError) {
            response.status(503).json({ error: DOWNLOAD_ERROR });
            return;
          }
          next(error);
        }
      },
    );
  };
}
