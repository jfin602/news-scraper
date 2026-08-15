import { readFile } from 'node:fs/promises';

import {
  ReferenceDeploymentConfigError,
  validateReferenceDeployment,
} from '../src/operations/reference-deployment-validator.ts';

try {
  const configPath = process.argv[2];
  if (configPath === undefined || configPath.trim() === '')
    throw new ReferenceDeploymentConfigError(
      'configuration file argument is required',
    );
  const config = JSON.parse(await readFile(configPath, 'utf8')) as unknown;
  const result = await validateReferenceDeployment(config);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok) process.exitCode = 1;
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({ ok: false, error: safeError(error) })}\n`,
  );
  process.exitCode = 1;
}

function safeError(error: unknown): string {
  if (error instanceof ReferenceDeploymentConfigError) return error.message;
  if (error instanceof SyntaxError)
    return 'Reference deployment configuration is invalid JSON';
  return 'Reference deployment validation could not start';
}
