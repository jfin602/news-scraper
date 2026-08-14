import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createEditorialAdministrationService } from '../../src/admin/editorial-administration.ts';
import type { Database } from '../../src/database/database.ts';

describe('Editorial administration stale relationships', () => {
  for (const testCase of [
    {
      constraint: 'relevance_rules_source_id_fkey',
      expected: 'relevance_rule_source_not_found',
    },
    {
      constraint: 'relevance_rules_category_id_fkey',
      expected: 'relevance_rule_category_not_found',
    },
  ] as const) {
    it(`maps a concurrent ${testCase.constraint} failure to the missing reference`, async () => {
      const database = {
        transaction: async () => {
          throw Object.assign(new Error('database detail'), {
            code: '23503',
            constraint: testCase.constraint,
          });
        },
      } as unknown as Database;
      const service = createEditorialAdministrationService(database);

      await assert.rejects(
        service.createRelevanceRule({
          configKey: 'stale_reference',
          predicateType: 'title_contains',
          pattern: 'topic',
          action: 'include',
          priority: 10,
          enabled: true,
          reason: 'Stale reference test',
        }),
        (error: unknown) =>
          typeof error === 'object' &&
          error !== null &&
          Reflect.get(error, 'code') === testCase.expected &&
          !String(error).includes('database detail'),
      );
    });
  }
});
