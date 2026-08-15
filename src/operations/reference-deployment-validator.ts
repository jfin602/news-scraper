export type ValidationCheck =
  | 'public_root'
  | 'public_api'
  | 'readiness'
  | 'admin_perimeter'
  | 'direct_origin';

export interface ReferenceDeploymentConfig {
  readonly publicBaseUrl: string;
  readonly directOriginBaseUrl: string;
  readonly timeoutMilliseconds?: number;
}

export interface ValidationObservation {
  readonly check: ValidationCheck;
  readonly outcome: 'pass' | 'fail' | 'network_error' | 'redirect_observed';
  readonly status?: number;
  readonly locationOrigin?: string;
  readonly detail: string;
}

export interface ReferenceValidationResult {
  readonly ok: boolean;
  readonly observations: readonly ValidationObservation[];
}

export class ReferenceDeploymentConfigError extends Error {
  constructor(message: string) {
    super(`Reference deployment configuration is invalid: ${message}`);
    this.name = 'ReferenceDeploymentConfigError';
  }
}

export function parseReferenceDeploymentConfig(
  value: unknown,
): Readonly<Required<ReferenceDeploymentConfig>> {
  if (typeof value !== 'object' || value === null)
    throw new ReferenceDeploymentConfigError('an object is required');
  const candidate = value as Record<string, unknown>;
  const publicBaseUrl = safeBaseUrl(candidate.publicBaseUrl, 'publicBaseUrl');
  const directOriginBaseUrl = safeBaseUrl(
    candidate.directOriginBaseUrl,
    'directOriginBaseUrl',
  );
  if (publicBaseUrl.origin === directOriginBaseUrl.origin)
    throw new ReferenceDeploymentConfigError(
      'public and direct-origin targets must differ',
    );
  const timeout = candidate.timeoutMilliseconds ?? 5_000;
  if (
    !Number.isInteger(timeout) ||
    Number(timeout) < 100 ||
    Number(timeout) > 30_000
  )
    throw new ReferenceDeploymentConfigError(
      'timeoutMilliseconds must be an integer from 100 through 30000',
    );
  return Object.freeze({
    publicBaseUrl: publicBaseUrl.href,
    directOriginBaseUrl: directOriginBaseUrl.href,
    timeoutMilliseconds: Number(timeout),
  });
}

export async function validateReferenceDeployment(
  input: unknown,
  fetcher: typeof fetch = fetch,
): Promise<ReferenceValidationResult> {
  const config = parseReferenceDeploymentConfig(input);
  const observations = await Promise.all([
    observe(fetcher, config, 'public_root', config.publicBaseUrl, '/', [200]),
    observe(
      fetcher,
      config,
      'public_api',
      config.publicBaseUrl,
      '/api/feed',
      [200, 404],
    ),
    observe(
      fetcher,
      config,
      'readiness',
      config.publicBaseUrl,
      '/health/ready',
      [200],
    ),
    observeAdmin(fetcher, config, config.publicBaseUrl, 'admin_perimeter'),
    observeAdmin(fetcher, config, config.directOriginBaseUrl, 'direct_origin'),
  ]);
  return Object.freeze({
    ok: observations.every((observation) => observation.outcome === 'pass'),
    observations: Object.freeze(observations),
  });
}

async function observe(
  fetcher: typeof fetch,
  config: Readonly<Required<ReferenceDeploymentConfig>>,
  check: ValidationCheck,
  base: string,
  route: string,
  accepted: readonly number[],
): Promise<ValidationObservation> {
  const result = await request(fetcher, config, base, route);
  if (result.kind === 'network_error')
    return {
      check,
      outcome: 'network_error',
      detail: 'request failed before an HTTP response',
    };
  if (isRedirect(result.status)) return redirectObservation(check, result);
  return {
    check,
    outcome: accepted.includes(result.status) ? 'pass' : 'fail',
    status: result.status,
    detail: accepted.includes(result.status)
      ? 'observed an accepted bounded HTTP status'
      : 'observed an unexpected HTTP status',
  };
}

async function observeAdmin(
  fetcher: typeof fetch,
  config: Readonly<Required<ReferenceDeploymentConfig>>,
  base: string,
  check: 'admin_perimeter' | 'direct_origin',
): Promise<ValidationObservation> {
  const result = await request(fetcher, config, base, '/admin');
  if (result.kind === 'network_error') {
    return check === 'direct_origin'
      ? {
          check,
          outcome: 'pass',
          detail: 'direct origin was not reachable over the supplied route',
        }
      : {
          check,
          outcome: 'network_error',
          detail: 'request failed before an HTTP response',
        };
  }
  if (isRedirect(result.status)) return redirectObservation(check, result);
  const denied = [401, 403, 404].includes(result.status);
  return {
    check,
    outcome: denied ? 'pass' : 'fail',
    status: result.status,
    detail: denied
      ? 'unauthenticated admin request was denied'
      : check === 'direct_origin'
        ? 'direct origin returned a successful or unprotected admin response'
        : 'public admin route was not challenged or denied',
  };
}

async function request(
  fetcher: typeof fetch,
  config: Readonly<Required<ReferenceDeploymentConfig>>,
  base: string,
  route: string,
): Promise<
  | { kind: 'http'; status: number; location?: string }
  | { kind: 'network_error' }
> {
  try {
    const response = await fetcher(new URL(route, base), {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(config.timeoutMilliseconds),
    });
    return {
      kind: 'http',
      status: response.status,
      ...(response.headers.get('location') === null
        ? {}
        : { location: response.headers.get('location') as string }),
    };
  } catch {
    return { kind: 'network_error' };
  }
}

function redirectObservation(
  check: ValidationCheck,
  result: { status: number; location?: string },
): ValidationObservation {
  let locationOrigin: string | undefined;
  try {
    if (result.location !== undefined)
      locationOrigin = new URL(result.location).origin;
  } catch {
    // A malformed location remains an observed redirect without echoing it.
  }
  const protectedCheck = check === 'admin_perimeter';
  return {
    check,
    outcome: protectedCheck ? 'pass' : 'redirect_observed',
    status: result.status,
    ...(locationOrigin === undefined ? {} : { locationOrigin }),
    detail: protectedCheck
      ? 'unauthenticated admin request was redirected'
      : 'redirect observed; operator review is required',
  };
}

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400;
}

function safeBaseUrl(value: unknown, name: string): URL {
  if (typeof value !== 'string' || value.trim() === '')
    throw new ReferenceDeploymentConfigError(`${name} is required`);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ReferenceDeploymentConfigError(`${name} must be an absolute URL`);
  }
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.search !== '' ||
    parsed.hash !== ''
  )
    throw new ReferenceDeploymentConfigError(
      `${name} must be a credential-free HTTP(S) origin URL`,
    );
  parsed.pathname = '/';
  return parsed;
}
