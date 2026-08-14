import type { Request, Response, Router } from 'express';

import {
  EditorialAdministrationError,
  type AdminCategoryReadModel,
  type AdminRelevanceRuleReadModel,
  type EditorialAdministrationService,
} from '../../admin/editorial-administration.ts';
import type { AdminApiRouteRegistrar } from './admin-router.ts';

export function registerEditorialAdministrationRoutes(
  service: EditorialAdministrationService,
): AdminApiRouteRegistrar {
  return (router: Router) => {
    router.get('/categories', async (_request, response) => {
      try {
        response
          .status(200)
          .json({ categories: await service.listCategories() });
      } catch (error) {
        sendEditorialAdministrationError(error, response);
      }
    });

    router.post('/categories', async (request, response) => {
      await sendCategoryCommand(
        response,
        () => service.createCategory(request.body),
        201,
      );
    });

    router.get('/categories/:categoryKey', async (request, response) => {
      await sendCategoryCommand(response, () =>
        service.getCategory(categoryKey(request)),
      );
    });

    router.put('/categories/:categoryKey', async (request, response) => {
      await sendCategoryCommand(response, () =>
        service.updateCategory(categoryKey(request), request.body),
      );
    });

    router.delete('/categories/:categoryKey', async (request, response) => {
      try {
        await service.deleteCategory(categoryKey(request));
        response.status(204).send();
      } catch (error) {
        sendEditorialAdministrationError(error, response);
      }
    });

    router.get('/relevance-rules', async (_request, response) => {
      try {
        response
          .status(200)
          .json({ relevanceRules: await service.listRelevanceRules() });
      } catch (error) {
        sendEditorialAdministrationError(error, response);
      }
    });

    router.post('/relevance-rules', async (request, response) => {
      await sendRelevanceRuleCommand(
        response,
        () => service.createRelevanceRule(request.body),
        201,
      );
    });

    router.get('/relevance-rules/:ruleKey', async (request, response) => {
      await sendRelevanceRuleCommand(response, () =>
        service.getRelevanceRule(ruleKey(request)),
      );
    });

    router.put(
      '/relevance-rules/:ruleKey/configuration',
      async (request, response) => {
        await sendRelevanceRuleCommand(response, () =>
          service.updateRelevanceRule(ruleKey(request), request.body),
        );
      },
    );

    router.put(
      '/relevance-rules/:ruleKey/enabled',
      async (request, response) => {
        await sendRelevanceRuleCommand(response, () =>
          service.setRelevanceRuleEnabled(ruleKey(request), request.body),
        );
      },
    );

    router.delete('/relevance-rules/:ruleKey', async (request, response) => {
      try {
        await service.deleteRelevanceRule(ruleKey(request));
        response.status(204).send();
      } catch (error) {
        sendEditorialAdministrationError(error, response);
      }
    });
  };
}

async function sendCategoryCommand(
  response: Response,
  command: () => Promise<AdminCategoryReadModel>,
  status = 200,
): Promise<void> {
  try {
    response.status(status).json({ category: await command() });
  } catch (error) {
    sendEditorialAdministrationError(error, response);
  }
}

async function sendRelevanceRuleCommand(
  response: Response,
  command: () => Promise<AdminRelevanceRuleReadModel>,
  status = 200,
): Promise<void> {
  try {
    response.status(status).json({ relevanceRule: await command() });
  } catch (error) {
    sendEditorialAdministrationError(error, response);
  }
}

function sendEditorialAdministrationError(
  error: unknown,
  response: Response,
): void {
  if (!(error instanceof EditorialAdministrationError)) throw error;
  const status =
    error.code === 'category_not_found' ||
    error.code === 'relevance_rule_not_found'
      ? 404
      : error.code === 'category_config_key_conflict' ||
          error.code === 'category_in_use' ||
          error.code === 'relevance_rule_config_key_conflict' ||
          error.code === 'relevance_rule_in_use'
        ? 409
        : 400;
  response.status(status).json({ error: error.code });
}

function categoryKey(request: Request): string | undefined {
  const value = request.params.categoryKey;
  return Array.isArray(value) ? value[0] : value;
}

function ruleKey(request: Request): string | undefined {
  const value = request.params.ruleKey;
  return Array.isArray(value) ? value[0] : value;
}
