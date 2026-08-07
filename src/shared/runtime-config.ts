export const nodeEnvironments = ['development', 'test', 'production'] as const;

export type NodeEnvironment = (typeof nodeEnvironments)[number];

export interface RuntimeConfig {
  readonly nodeEnv: NodeEnvironment;
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

function isNodeEnvironment(value: string): value is NodeEnvironment {
  return nodeEnvironments.some((candidate) => candidate === value);
}
