/** Validates admin command shape without selecting a caller error vocabulary. */
export function validateAdminInputRecord(
  input: unknown,
  requiredKeys: readonly string[] = [],
  optionalKeys: readonly string[] = [],
): Record<string, unknown> | undefined {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return undefined;
  }

  const record = input as Record<string, unknown>;
  const allowedKeys = new Set([...requiredKeys, ...optionalKeys]);
  if (
    requiredKeys.some((key) => !Object.hasOwn(record, key)) ||
    Object.keys(record).some((key) => !allowedKeys.has(key))
  ) {
    return undefined;
  }
  return record;
}
