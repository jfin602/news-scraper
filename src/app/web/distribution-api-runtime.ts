import type { Database } from '../../database/database.ts';
import {
  createDistributionCredentialAuthenticationRepository,
  createMachineAuthenticator,
} from '../../distribution/credentials/machine-authentication.ts';
import {
  createMachineRequestGuard,
  type MachineRequestGuardPolicy,
} from '../../distribution/credentials/machine-request-guard.ts';
import { createDistributionProfilePageService } from '../../distribution/profile-page.ts';
import {
  createDistributionApiRouter,
  type DistributionApiTelemetryEvent,
} from './distribution-api-router.ts';
import { createDistributionRequestContextResolver } from './distribution-request-context.ts';
import type { WebConfig } from './web-config.ts';

export interface DistributionApiRuntimeOptions {
  readonly telemetry?: (event: DistributionApiTelemetryEvent) => void;
  readonly requestGuardPolicy?: Readonly<MachineRequestGuardPolicy>;
}

/** Constructs the process-lifetime dependencies for the machine API once. */
export function createDistributionApiRuntime(
  database: Database,
  config: Pick<WebConfig, 'trustedProxy' | 'distributionTransport'>,
  options: DistributionApiRuntimeOptions = {},
) {
  const pageService = createDistributionProfilePageService(database);
  const authenticationRepository =
    createDistributionCredentialAuthenticationRepository(database);
  const authenticator = createMachineAuthenticator({
    repository: authenticationRepository,
  });
  const requestGuard = createMachineRequestGuard({
    authenticator,
    ...(options.requestGuardPolicy === undefined
      ? {}
      : { policy: options.requestGuardPolicy }),
  });
  const invalidAuthNetworkKey =
    createDistributionRequestContextResolver(config);

  return Object.freeze({
    router: createDistributionApiRouter({
      pageService,
      requestGuard,
      invalidAuthNetworkKey,
      ...(options.telemetry === undefined
        ? {}
        : { telemetry: options.telemetry }),
    }),
  });
}
