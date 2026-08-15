import { parse, type Selector } from 'css-what';

export const HTML_LISTING_PROFILE_LIMITS = Object.freeze({
  serializedBytes: 16_384,
  selectorLength: 1_024,
  selectorTokens: 64,
  selectorCombinators: 16,
});

const DATE_ATTRIBUTES = [
  'datetime',
  'data-published-at',
  'data-updated-at',
] as const;

export type HtmlDateAttribute = (typeof DATE_ATTRIBUTES)[number];

export interface HtmlTextFieldDescriptor {
  readonly selector: string;
}

export interface HtmlDateTextFieldDescriptor extends HtmlTextFieldDescriptor {
  readonly mode: 'text';
}

export interface HtmlDateAttributeFieldDescriptor {
  readonly selector: string;
  readonly mode: 'attribute';
  readonly attribute: HtmlDateAttribute;
}

export type HtmlDateFieldDescriptor =
  HtmlDateTextFieldDescriptor | HtmlDateAttributeFieldDescriptor;

export interface NormalizedHtmlListingProfile {
  readonly itemSelector: string;
  readonly title: HtmlTextFieldDescriptor;
  readonly articleLink: HtmlTextFieldDescriptor;
  readonly publishedAt?: HtmlDateFieldDescriptor;
  readonly updatedAt?: HtmlDateFieldDescriptor;
  readonly author?: HtmlTextFieldDescriptor;
  readonly summary?: HtmlTextFieldDescriptor;
  readonly categories?: HtmlTextFieldDescriptor;
}

export class HtmlListingProfileValidationError extends Error {
  readonly code:
    'invalid_profile' | 'profile_limit' | 'invalid_selector' | 'selector_limit';

  constructor(
    code:
      | 'invalid_profile'
      | 'profile_limit'
      | 'invalid_selector'
      | 'selector_limit',
    message: string,
  ) {
    super(message);
    this.name = 'HtmlListingProfileValidationError';
    this.code = code;
  }
}

/**
 * Validates draft JSON and returns the one canonical persistence representation.
 * Selectors intentionally form a small CSS subset: tag, class, id, presence or
 * equality attributes, and descendant/child composition only.
 */
export function normalizeHtmlListingProfile(
  input: unknown,
): NormalizedHtmlListingProfile {
  if (!isRecord(input))
    invalidProfile('HTML listing profile must be an object.');
  enforceSerializedLimit(input);
  exactKeys(input, [
    'itemSelector',
    'title',
    'articleLink',
    'publishedAt',
    'updatedAt',
    'author',
    'summary',
    'categories',
  ]);

  const profile: NormalizedHtmlListingProfile = {
    itemSelector: normalizeSelector(input.itemSelector),
    title: normalizeTextField(input.title),
    articleLink: normalizeTextField(input.articleLink),
    ...(input.publishedAt === undefined
      ? {}
      : { publishedAt: normalizeDateField(input.publishedAt) }),
    ...(input.updatedAt === undefined
      ? {}
      : { updatedAt: normalizeDateField(input.updatedAt) }),
    ...(input.author === undefined
      ? {}
      : { author: normalizeTextField(input.author) }),
    ...(input.summary === undefined
      ? {}
      : { summary: normalizeTextField(input.summary) }),
    ...(input.categories === undefined
      ? {}
      : { categories: normalizeTextField(input.categories) }),
  };
  return freezeProfile(profile);
}

function normalizeTextField(input: unknown): HtmlTextFieldDescriptor {
  if (!isRecord(input))
    invalidProfile('HTML field descriptor must be an object.');
  exactKeys(input, ['selector']);
  return Object.freeze({ selector: normalizeSelector(input.selector) });
}

function normalizeDateField(input: unknown): HtmlDateFieldDescriptor {
  if (!isRecord(input))
    invalidProfile('HTML date descriptor must be an object.');
  if (input.mode === 'text') {
    exactKeys(input, ['selector', 'mode']);
    return Object.freeze({
      selector: normalizeSelector(input.selector),
      mode: 'text',
    });
  }
  if (input.mode === 'attribute') {
    exactKeys(input, ['selector', 'mode', 'attribute']);
    if (!isDateAttribute(input.attribute))
      invalidProfile('HTML date attribute is not allowlisted.');
    return Object.freeze({
      selector: normalizeSelector(input.selector),
      mode: 'attribute',
      attribute: input.attribute,
    });
  }
  invalidProfile('HTML date descriptor mode is invalid.');
}

function normalizeSelector(input: unknown): string {
  if (typeof input !== 'string') invalidSelector('Selector must be a string.');
  const selector = input.trim();
  if (selector === '') invalidSelector('Selector must not be empty.');
  if (
    Buffer.byteLength(selector, 'utf8') >
    HTML_LISTING_PROFILE_LIMITS.selectorLength
  )
    selectorLimit('Selector exceeds the configured length limit.');

  let groups: Selector[][];
  try {
    groups = parse(selector);
  } catch {
    invalidSelector('Selector syntax is invalid.');
  }
  if (groups.length !== 1 || groups[0] === undefined)
    invalidSelector('Selector lists are not supported.');
  validateSelectorTokens(groups[0]);
  return selector;
}

function validateSelectorTokens(tokens: readonly Selector[]): void {
  if (
    tokens.length === 0 ||
    tokens.length > HTML_LISTING_PROFILE_LIMITS.selectorTokens
  )
    selectorLimit('Selector token complexity exceeds the configured limit.');

  let combinators = 0;
  let previousWasCombinator = true;
  for (const token of tokens) {
    if (token.type === 'child' || token.type === 'descendant') {
      combinators += 1;
      if (previousWasCombinator)
        invalidSelector('Selector combinator placement is invalid.');
      previousWasCombinator = true;
      continue;
    }
    if (token.type === 'tag') {
      previousWasCombinator = false;
      continue;
    }
    if (token.type === 'attribute') {
      if (
        token.namespace !== null ||
        !['equals', 'element', 'exists'].includes(token.action) ||
        (token.ignoreCase !== null && token.ignoreCase !== 'quirks')
      ) {
        invalidSelector('Selector attribute matching is not supported.');
      }
      previousWasCombinator = false;
      continue;
    }
    invalidSelector('Selector feature is not supported.');
  }
  if (previousWasCombinator)
    invalidSelector('Selector combinator placement is invalid.');
  if (combinators > HTML_LISTING_PROFILE_LIMITS.selectorCombinators)
    selectorLimit(
      'Selector combinator complexity exceeds the configured limit.',
    );
}

function enforceSerializedLimit(input: Record<string, unknown>): void {
  let serialized: string;
  try {
    serialized = JSON.stringify(input);
  } catch {
    invalidProfile('HTML listing profile must be JSON-serializable.');
  }
  if (
    Buffer.byteLength(serialized, 'utf8') >
    HTML_LISTING_PROFILE_LIMITS.serializedBytes
  )
    profileLimit('HTML listing profile exceeds the configured size limit.');
}

function exactKeys(
  input: Record<string, unknown>,
  keys: readonly string[],
): void {
  if (Object.keys(input).some((key) => !keys.includes(key)))
    invalidProfile('HTML listing profile contains an unknown field.');
}

function freezeProfile(
  profile: NormalizedHtmlListingProfile,
): NormalizedHtmlListingProfile {
  return Object.freeze({
    ...profile,
    title: Object.freeze({ ...profile.title }),
    articleLink: Object.freeze({ ...profile.articleLink }),
    ...(profile.publishedAt === undefined
      ? {}
      : { publishedAt: Object.freeze({ ...profile.publishedAt }) }),
    ...(profile.updatedAt === undefined
      ? {}
      : { updatedAt: Object.freeze({ ...profile.updatedAt }) }),
    ...(profile.author === undefined
      ? {}
      : { author: Object.freeze({ ...profile.author }) }),
    ...(profile.summary === undefined
      ? {}
      : { summary: Object.freeze({ ...profile.summary }) }),
    ...(profile.categories === undefined
      ? {}
      : { categories: Object.freeze({ ...profile.categories }) }),
  });
}

function isDateAttribute(value: unknown): value is HtmlDateAttribute {
  return (
    typeof value === 'string' &&
    DATE_ATTRIBUTES.includes(value as HtmlDateAttribute)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidProfile(message: string): never {
  throw new HtmlListingProfileValidationError('invalid_profile', message);
}

function profileLimit(message: string): never {
  throw new HtmlListingProfileValidationError('profile_limit', message);
}

function invalidSelector(message: string): never {
  throw new HtmlListingProfileValidationError('invalid_selector', message);
}

function selectorLimit(message: string): never {
  throw new HtmlListingProfileValidationError('selector_limit', message);
}
