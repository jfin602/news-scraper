import type { SpawnSyncOptions, SpawnSyncReturns } from 'node:child_process';

export interface RunTestsOptions {
  readonly arguments_: readonly string[];
  readonly cwd?: string;
  readonly environment?: NodeJS.ProcessEnv;
  readonly glob?: (
    pattern: string,
    options: { readonly cwd: string; readonly exclude: readonly string[] },
  ) => readonly string[];
  readonly spawn?: (
    command: string,
    arguments_: readonly string[],
    options: SpawnSyncOptions,
  ) => Pick<SpawnSyncReturns<Buffer>, 'error' | 'status'>;
  readonly writeError?: (message: string) => void;
}

export function runTests(options: RunTestsOptions): number;
