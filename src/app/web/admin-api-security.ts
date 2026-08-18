import express, {
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type Response,
} from 'express';

export const ADMIN_REQUEST_HEADER = 'X-News-Scraper-Admin-Request';
export const ADMIN_REQUEST_HEADER_VALUE = '1';
export const ADMIN_API_JSON_BODY_LIMIT_BYTES = 64 * 1024;
export const adminContentSecurityPolicy =
  "default-src 'self'; base-uri 'none'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self'; object-src 'none'; script-src 'self'; style-src 'self'";

const unsafeAdminMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const adminJsonParser = express.json({
  limit: ADMIN_API_JSON_BODY_LIMIT_BYTES,
  strict: true,
  type: 'application/json',
  verify: (_request, _response, buffer) => {
    if (hasDuplicateJsonObjectKeys(buffer.toString('utf8'))) {
      const error = new Error('Duplicate JSON object key.');
      Reflect.set(error, 'type', 'entity.verify.failed');
      throw error;
    }
  },
});

export function setAdminSecurityHeaders(
  _request: Request,
  response: Response,
  next: NextFunction,
): void {
  response.set({
    'Cache-Control': 'no-store',
    'Content-Security-Policy': adminContentSecurityPolicy,
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  });
  next();
}

export function enforceAdminMutationIntegrity(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  if (!unsafeAdminMethods.has(request.method)) {
    next();
    return;
  }

  if (request.get(ADMIN_REQUEST_HEADER) !== ADMIN_REQUEST_HEADER_VALUE) {
    response.status(403).json({ error: 'request_integrity_required' });
    return;
  }
  if (request.is('application/json') !== 'application/json') {
    response.status(415).json({ error: 'json_content_type_required' });
    return;
  }
  adminJsonParser(request, response, next);
}

export const adminApiErrorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  next,
) => {
  void next;
  const errorType = reflectedString(error, 'type');
  if (errorType === 'entity.too.large') {
    response.status(413).json({ error: 'request_too_large' });
    return;
  }
  if (
    errorType === 'entity.parse.failed' ||
    errorType === 'entity.verify.failed'
  ) {
    response.status(400).json({ error: 'invalid_json' });
    return;
  }
  response.status(500).json({ error: 'internal_error' });
};

function reflectedString(value: unknown, property: string): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const reflected = Reflect.get(value, property);
  return typeof reflected === 'string' ? reflected : undefined;
}

/** Rejects duplicate keys at every JSON object depth before JSON.parse loses them. */
function hasDuplicateJsonObjectKeys(json: string): boolean {
  let index = 0;
  const whitespace = /\s/u;

  const skipWhitespace = (): void => {
    while (whitespace.test(json[index] ?? '')) index += 1;
  };
  const parseString = (): string => {
    const start = index;
    if (json[index] !== '"') throw new Error();
    index += 1;
    while (index < json.length) {
      const character = json[index];
      if (character === '\\') {
        index += 2;
        continue;
      }
      index += 1;
      if (character === '"') return JSON.parse(json.slice(start, index));
    }
    throw new Error();
  };
  const parseValue = (): boolean => {
    skipWhitespace();
    const character = json[index];
    if (character === '{') return parseObject();
    if (character === '[') return parseArray();
    if (character === '"') {
      parseString();
      return false;
    }
    const start = index;
    while (index < json.length && !/[\s,\]}]/u.test(json[index] ?? '')) {
      index += 1;
    }
    if (start === index) throw new Error();
    return false;
  };
  const parseObject = (): boolean => {
    index += 1;
    skipWhitespace();
    const keys = new Set<string>();
    if (json[index] === '}') {
      index += 1;
      return false;
    }
    while (true) {
      skipWhitespace();
      const key = parseString();
      if (keys.has(key)) return true;
      keys.add(key);
      skipWhitespace();
      if (json[index] !== ':') throw new Error();
      index += 1;
      if (parseValue()) return true;
      skipWhitespace();
      if (json[index] === '}') {
        index += 1;
        return false;
      }
      if (json[index] !== ',') throw new Error();
      index += 1;
    }
  };
  const parseArray = (): boolean => {
    index += 1;
    skipWhitespace();
    if (json[index] === ']') {
      index += 1;
      return false;
    }
    while (true) {
      if (parseValue()) return true;
      skipWhitespace();
      if (json[index] === ']') {
        index += 1;
        return false;
      }
      if (json[index] !== ',') throw new Error();
      index += 1;
    }
  };

  try {
    const duplicate = parseValue();
    skipWhitespace();
    return duplicate || index !== json.length;
  } catch {
    return false;
  }
}
