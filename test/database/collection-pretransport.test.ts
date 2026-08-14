import assert from 'node:assert/strict';
import { after, test } from 'node:test';

import {
  createEndpointExecutionLockRunner,
  withEligibleEndpointExecution,
} from '../../src/collection/execution.ts';
import { reachValidatedOutboundBoundary } from '../../src/collection/safety/outbound-boundary.ts';
import type { DestinationResolver } from '../../src/collection/safety/resolver.ts';
import { createDatabase } from '../../src/database/database.ts';
import {
  bootstrapPublicationTree,
  parseBootstrapDocument,
} from '../../src/publication/bootstrap.ts';
import {
  findEndpointConfigurationByKeys,
  type EndpointConfigurationAggregate,
} from '../../src/sources/repository.ts';
import { createDatabaseTestScope } from '../support/database/database-test-scope.ts';

const databaseTestScope = createDatabaseTestScope('migrated');

after(async () => databaseTestScope.dispose());

test('persisted aggregate composes with real endpoint locking and controlled outbound safety', async () => {
  await databaseTestScope.use(async ({ databaseUrl }) => {
    const actorA = createDatabase({ connectionString: databaseUrl });
    const actorB = createDatabase({ connectionString: databaseUrl });
    const releaseOwner = deferred<void>();
    let ownerPromise: ReturnType<typeof executeControlled> | undefined;

    try {
      await bootstrapPublicationTree(actorA, syntheticBootstrap());
      const configuration = await findEndpointConfigurationByKeys(
        actorA,
        'synthetic_source',
        'main_feed',
      );
      assert.ok(configuration);

      const firstDestinations: unknown[] = [];
      const first = await executeControlled(
        configuration,
        createEndpointExecutionLockRunner(actorA),
        async (destination) => {
          firstDestinations.push(destination);
          return 'first-outbound-result';
        },
      );
      assert.deepEqual(first, {
        status: 'acquired',
        value: 'first-outbound-result',
      });
      assert.equal(firstDestinations.length, 1);
      assert.deepEqual(firstDestinations[0], {
        status: 'validated',
        context: 'initial',
        requestUrl: 'https://feeds.synthetic.example/feed.xml',
        protocol: 'https:',
        hostname: 'feeds.synthetic.example',
        port: 443,
        addresses: [
          { address: '1.1.1.1', family: 4 },
          { address: '2606:4700:4700::1111', family: 6 },
        ],
      });

      const ownerEntered = deferred<void>();
      ownerPromise = executeControlled(
        configuration,
        createEndpointExecutionLockRunner(actorA),
        async () => {
          ownerEntered.resolve();
          await releaseOwner.promise;
          return 'owner-result';
        },
      );
      await ownerEntered.promise;

      let contenderResolverCalls = 0;
      let contenderOutboundCalls = 0;
      const contended = await withEligibleEndpointExecution(
        configuration,
        createEndpointExecutionLockRunner(actorB),
        async () =>
          reachValidatedOutboundBoundary(
            configuration,
            initialInput(configuration),
            {
              async resolve() {
                contenderResolverCalls += 1;
                return [{ address: '8.8.8.8', family: 4 }];
              },
            },
            async () => {
              contenderOutboundCalls += 1;
            },
          ),
      );
      assert.deepEqual(contended, {
        status: 'blocked',
        stage: 'lock',
        reason: 'endpoint_locked',
      });
      assert.equal(contenderResolverCalls, 0);
      assert.equal(contenderOutboundCalls, 0);

      releaseOwner.resolve();
      assert.deepEqual(await ownerPromise, {
        status: 'acquired',
        value: 'owner-result',
      });
      ownerPromise = undefined;

      let postReleaseOutboundCalls = 0;
      assert.deepEqual(
        await executeControlled(
          configuration,
          createEndpointExecutionLockRunner(actorB),
          async () => {
            postReleaseOutboundCalls += 1;
            return 'after-release';
          },
        ),
        { status: 'acquired', value: 'after-release' },
      );
      assert.equal(postReleaseOutboundCalls, 1);

      const expectedFailure = new Error('controlled boundary failure');
      await assert.rejects(
        executeControlled(
          configuration,
          createEndpointExecutionLockRunner(actorA),
          async () => {
            throw expectedFailure;
          },
        ),
        expectedFailure,
      );
      assert.equal(
        (
          await executeControlled(
            configuration,
            createEndpointExecutionLockRunner(actorB),
            async () => 'after-failure',
          )
        ).status,
        'acquired',
      );
    } finally {
      releaseOwner.resolve();
      await ownerPromise?.catch(() => undefined);
      await Promise.all([actorA.close(), actorB.close()]);
    }
  });
});

function executeControlled<T>(
  configuration: EndpointConfigurationAggregate,
  lockRunner: ReturnType<typeof createEndpointExecutionLockRunner>,
  outbound: Parameters<typeof reachValidatedOutboundBoundary<T>>[3],
) {
  return withEligibleEndpointExecution(configuration, lockRunner, async () =>
    reachValidatedOutboundBoundary(
      configuration,
      initialInput(configuration),
      safeResolver,
      outbound,
    ),
  );
}

const safeResolver: DestinationResolver = Object.freeze({
  async resolve() {
    return Object.freeze([
      Object.freeze({ address: '1.1.1.1', family: 4 as const }),
      Object.freeze({
        address: '2606:4700:4700::1111',
        family: 6 as const,
      }),
    ]);
  },
});

function initialInput(configuration: EndpointConfigurationAggregate) {
  return {
    context: 'initial',
    destination: configuration.endpoint.endpointUrl.value,
  } as const;
}

function syntheticBootstrap() {
  return parseBootstrapDocument(
    JSON.stringify({
      publication: {
        name: 'Generic pretransport news',
        activeForCollection: true,
        publicStatus: 'private',
      },
      sources: [
        {
          configKey: 'synthetic_source',
          displayName: 'Synthetic Source',
          siteUrl: 'https://synthetic.example/',
          approvalState: 'approved',
          lifecycleState: 'active',
          operationalState: 'enabled',
          domainRules: [
            { hostname: 'synthetic.example', includeSubdomains: true },
          ],
          endpoints: [
            {
              configKey: 'main_feed',
              endpointUrl: 'https://feeds.synthetic.example/feed.xml',
              endpointType: 'rss_atom',
              approvalState: 'approved',
              lifecycleState: 'active',
              operationalState: 'enabled',
              pollIntervalSeconds: 300,
              endpointDomainRules: [{ hostname: 'feeds.synthetic.example' }],
            },
          ],
        },
      ],
    }),
  );
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T | PromiseLike<T>) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
