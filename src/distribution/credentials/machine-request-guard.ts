import type {
  MachineAuthenticationPrincipal,
  MachineAuthenticationResult,
} from './machine-authentication.ts';
import {
  BoundedMachineRateLimiter,
  type MachineRateLimitClock,
  type MachineRateLimitPolicy,
} from './rate-limiter.ts';

export const MAXIMUM_INVALID_AUTH_NETWORK_KEY_LENGTH = 128;

export const DEFAULT_MACHINE_REQUEST_GUARD_POLICY = Object.freeze({
  authenticated: Object.freeze({
    maximumRequests: 120,
    windowMilliseconds: 60_000,
    maximumEntries: 10_000,
  }),
  invalidAuthentication: Object.freeze({
    maximumRequests: 20,
    windowMilliseconds: 60_000,
    maximumEntries: 10_000,
  }),
});

export interface MachineAuthenticator {
  authenticate(
    authorizationHeader: string | undefined,
  ): Promise<MachineAuthenticationResult>;
}

export interface MachineRequestGuardPolicy {
  readonly authenticated: Readonly<MachineRateLimitPolicy>;
  readonly invalidAuthentication: Readonly<MachineRateLimitPolicy>;
}

export interface MachineRequestGuardDependencies {
  readonly authenticator: MachineAuthenticator;
  readonly policy?: Readonly<MachineRequestGuardPolicy>;
  readonly clock?: MachineRateLimitClock;
}

export interface MachineRequestGuardInput {
  readonly authorizationHeader: string | undefined;
  readonly invalidAuthNetworkKey: string;
}

export type MachineRequestGuardResult =
  | {
      readonly outcome: 'authenticated';
      readonly principal: MachineAuthenticationPrincipal;
    }
  | { readonly outcome: 'unauthenticated' }
  | {
      readonly outcome: 'rate_limited';
      readonly classification:
        'authenticated_credential' | 'invalid_authentication';
      readonly retryAfterSeconds: number;
    };

export class MachineRequestGuardInputError extends Error {}

export function createMachineRequestGuard(
  dependencies: MachineRequestGuardDependencies,
): {
  guard(input: MachineRequestGuardInput): Promise<MachineRequestGuardResult>;
} {
  const policy = dependencies.policy ?? DEFAULT_MACHINE_REQUEST_GUARD_POLICY;
  const authenticatedLimiter = new BoundedMachineRateLimiter(
    policy.authenticated,
    dependencies.clock,
  );
  const invalidAuthenticationLimiter = new BoundedMachineRateLimiter(
    policy.invalidAuthentication,
    dependencies.clock,
  );

  return Object.freeze({
    async guard(input) {
      const invalidAuthNetworkKey = normalizeInvalidAuthNetworkKey(
        input.invalidAuthNetworkKey,
      );
      const preflight = invalidAuthenticationLimiter.peek(
        invalidAuthNetworkKey,
      );
      if (preflight.outcome === 'rate_limited') {
        return rateLimited(
          'invalid_authentication',
          preflight.retryAfterSeconds,
        );
      }

      const authentication = await dependencies.authenticator.authenticate(
        input.authorizationHeader,
      );
      if (authentication.outcome === 'unauthenticated') {
        const limited = invalidAuthenticationLimiter.consume(
          invalidAuthNetworkKey,
        );
        return limited.outcome === 'rate_limited'
          ? rateLimited('invalid_authentication', limited.retryAfterSeconds)
          : Object.freeze({ outcome: 'unauthenticated' });
      }

      const limited = authenticatedLimiter.consume(
        authentication.principal.credentialId,
      );
      return limited.outcome === 'rate_limited'
        ? rateLimited('authenticated_credential', limited.retryAfterSeconds)
        : Object.freeze({
            outcome: 'authenticated',
            principal: authentication.principal,
          });
    },
  });
}

export function normalizeInvalidAuthNetworkKey(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAXIMUM_INVALID_AUTH_NETWORK_KEY_LENGTH ||
    !/^[A-Za-z0-9._:-]+$/u.test(value)
  ) {
    throw new MachineRequestGuardInputError(
      'Invalid authentication network key.',
    );
  }
  return value;
}

function rateLimited(
  classification: 'authenticated_credential' | 'invalid_authentication',
  retryAfterSeconds: number | undefined,
): Readonly<
  Extract<MachineRequestGuardResult, { readonly outcome: 'rate_limited' }>
> {
  if (retryAfterSeconds === undefined || retryAfterSeconds < 1) {
    throw new Error('Machine limiter returned an invalid retry interval.');
  }
  return Object.freeze({
    outcome: 'rate_limited',
    classification,
    retryAfterSeconds,
  });
}
