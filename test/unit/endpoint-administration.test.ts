import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  EndpointAdministrationError,
  normalizeEndpointCreateCommand,
} from '../../src/admin/endpoint-administration.ts';

const sourceDomains = Object.freeze([
  Object.freeze({ hostname: 'example.com', includeSubdomains: true }),
]);

describe('Endpoint administration command normalization', () => {
  it('normalizes the exact canonical create representation', () => {
    const command = normalizeEndpointCreateCommand(
      {
        configKey: 'main_feed',
        endpointUrl: 'https://feeds.example.com/rss.xml',
        endpointType: 'rss_atom',
        approvalState: 'approved',
        operationalState: 'enabled',
        pollIntervalSeconds: 300,
        endpointDomainRules: [{ hostname: 'feeds.example.com' }],
        defaultCategoryConfigKey: 'industry',
      },
      sourceDomains,
    );

    assert.equal(command.endpoint.configKey, 'main_feed');
    assert.equal(command.endpoint.lifecycleState, 'active');
    assert.equal(command.endpoint.endpointType, 'rss_atom');
    assert.equal(command.endpoint.pollIntervalSeconds, 300);
    assert.deepEqual(command.endpoint.endpointDomainRules, [
      { hostname: 'feeds.example.com', includeSubdomains: false },
    ]);
    assert.equal(command.defaultCategoryConfigKey, 'industry');
    assert.ok(Object.isFrozen(command));
    assert.ok(Object.isFrozen(command.endpoint));
  });

  it('uses empty narrowing as inheritance and null as cleared Category', () => {
    const command = normalizeEndpointCreateCommand(
      {
        ...endpointInput(),
        endpointDomainRules: [],
        defaultCategoryConfigKey: null,
      },
      sourceDomains,
    );
    assert.deepEqual(command.endpoint.endpointDomainRules, []);
    assert.equal(command.defaultCategoryConfigKey, undefined);
  });

  it('rejects unknown or missing fields and canonical URL/type/poll failures', () => {
    const invalidInputs: readonly unknown[] = [
      { ...endpointInput(), typo: true },
      omit(endpointInput(), 'endpointUrl'),
      { ...endpointInput(), endpointUrl: '/relative.xml' },
      {
        ...endpointInput(),
        endpointUrl: 'https://feeds.example.com/rss.xml#fragment',
      },
      { ...endpointInput(), endpointType: 'html' },
      { ...endpointInput(), pollIntervalSeconds: 59 },
      { ...endpointInput(), pollIntervalSeconds: 2_592_001 },
    ];

    for (const input of invalidInputs) {
      assert.throws(
        () => normalizeEndpointCreateCommand(input, sourceDomains),
        (error: unknown) =>
          error instanceof EndpointAdministrationError &&
          error.code === 'invalid_request',
      );
    }
  });

  it('rejects widening and approved hosts outside effective policy', () => {
    for (const input of [
      {
        ...endpointInput(),
        endpointDomainRules: [{ hostname: 'outside.example.net' }],
      },
      {
        ...endpointInput(),
        endpointUrl: 'https://other.example.com/rss.xml',
        endpointDomainRules: [{ hostname: 'feeds.example.com' }],
      },
    ]) {
      assert.throws(
        () => normalizeEndpointCreateCommand(input, sourceDomains),
        (error: unknown) =>
          error instanceof EndpointAdministrationError &&
          error.code === 'endpoint_domain_policy_conflict',
      );
    }
  });
});

function endpointInput(): Record<string, unknown> {
  return {
    configKey: 'main_feed',
    endpointUrl: 'https://feeds.example.com/rss.xml',
    endpointType: 'rss_atom',
    approvalState: 'approved',
    operationalState: 'enabled',
    pollIntervalSeconds: 300,
    endpointDomainRules: [],
    defaultCategoryConfigKey: null,
  };
}

function omit(
  input: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const result = { ...input };
  Reflect.deleteProperty(result, key);
  return result;
}
