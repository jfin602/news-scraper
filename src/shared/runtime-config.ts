export const nodeEnvironments = ['development', 'test', 'production'] as const;

export type NodeEnvironment = (typeof nodeEnvironments)[number];

export interface RuntimeConfig {
  readonly nodeEnv: NodeEnvironment;
}

export const DEFAULT_GEMINI_MODEL = 'gemini-3.6-flash';

/**
 * Deployment-only Gemini configuration. It is intentionally parsed by the
 * optional AI boundary rather than during ordinary Web or Worker startup.
 */
export interface GeminiProviderRuntimeConfig {
  readonly apiKey: string | undefined;
  readonly model: string;
}

export class RuntimeConfigError extends Error {
  readonly variable: string;

  constructor(variable: string, reason: string) {
    super(`${variable}: ${reason}`);
    this.name = 'RuntimeConfigError';
    this.variable = variable;
  }
}

export function parseRuntimeConfig(
  environment: Readonly<Record<string, string | undefined>>,
): Readonly<RuntimeConfig> {
  const nodeEnv = environment.NODE_ENV ?? 'development';

  if (!isNodeEnvironment(nodeEnv)) {
    throw new RuntimeConfigError(
      'NODE_ENV',
      `must be one of ${nodeEnvironments.join(', ')}`,
    );
  }

  return Object.freeze({ nodeEnv });
}

export function parseGeminiProviderRuntimeConfig(
  environment: Readonly<Record<string, string | undefined>>,
): Readonly<GeminiProviderRuntimeConfig> {
  const suppliedModel = environment.NEWS_SCRAPER_GEMINI_MODEL?.trim();
  if (
    suppliedModel !== undefined &&
    (suppliedModel.length === 0 ||
      suppliedModel.length > 100 ||
      !/^[A-Za-z0-9._-]+$/.test(suppliedModel))
  ) {
    throw new RuntimeConfigError(
      'NEWS_SCRAPER_GEMINI_MODEL',
      'must be a bounded Gemini model identifier',
    );
  }

  const suppliedKey = environment.NEWS_SCRAPER_GEMINI_API_KEY?.trim();
  return Object.freeze({
    apiKey: suppliedKey === '' ? undefined : suppliedKey,
    model: suppliedModel ?? DEFAULT_GEMINI_MODEL,
  });
}

function isNodeEnvironment(value: string): value is NodeEnvironment {
  return nodeEnvironments.some((candidate) => candidate === value);
}
