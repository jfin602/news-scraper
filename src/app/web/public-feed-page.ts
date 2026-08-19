import type { Response } from 'express';

import type { PublicDiscoveryRequest } from '../../public-feed/discovery.ts';
import type {
  PublicDiscoveryChoice,
  PublicFeed,
  PublicFeedItem,
  PublicFeedPublication,
} from '../../public-feed/repository.ts';

export const publicFeedPageContentSecurityPolicy =
  "default-src 'self'; base-uri 'none'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self'; object-src 'none'; script-src 'self'; style-src 'self'";

export type PublicFeedPageError = 'invalid' | 'not_found' | 'unavailable';

interface PublicFeedBootstrap {
  readonly publication: PublicFeedPublication;
  readonly discovery: {
    readonly query: {
      readonly q: string | null;
      readonly source: string | null;
      readonly category: string | null;
    };
    readonly sources: readonly PublicDiscoveryChoice[];
    readonly categories: readonly PublicDiscoveryChoice[];
  };
  readonly items: readonly {
    readonly articleId: string;
    readonly effectiveFeedDate: string;
    readonly feedDateSource: 'published_at' | 'first_seen_at';
    readonly headline: string;
    readonly sourceName: string;
    readonly originalUrl: string;
  }[];
  readonly nextCursor: string | null;
}

/** Renders only already-public canonical-feed data. Throws on unsafe input. */
export function sendPublicFeedPage(
  response: Response,
  feed: PublicFeed,
  discoveryRequest: PublicDiscoveryRequest,
): void {
  const bootstrap = publicBootstrap(feed, discoveryRequest);
  response
    .set(pageHeaders())
    .status(200)
    .type('html')
    .send(successPage(bootstrap));
}

export function sendPublicFeedPageError(
  response: Response,
  error: PublicFeedPageError,
): void {
  const detail = errorPageDetail(error);
  response
    .set(pageHeaders())
    .status(detail.status)
    .type('html')
    .send(errorPage(detail.title, detail.message, error));
}

function pageHeaders(): Record<string, string> {
  return {
    'Cache-Control': 'no-store',
    'Content-Security-Policy': publicFeedPageContentSecurityPolicy,
    'X-Content-Type-Options': 'nosniff',
  };
}

function successPage(bootstrap: PublicFeedBootstrap): string {
  const { publication, discovery, items } = bootstrap;
  const description =
    publication.description === null
      ? '<p class="publication-description" data-publication-description hidden></p>'
      : `<p class="publication-description" data-publication-description>${escapeText(publication.description)}</p>`;
  const logo =
    publication.logoPath === null
      ? '<div class="publication-logo" data-publication-logo hidden></div>'
      : `<div class="publication-logo" data-publication-logo><img class="publication-logo-image" alt="" src="${escapeAttribute(publication.logoPath)}"></div>`;
  const accent =
    publication.accentColor === null
      ? ''
      : ` style="--publication-accent: ${escapeAttribute(publication.accentColor)}"`;
  const itemMarkup = items
    .map((item) => renderItem(item, publication.presentationTimezone ?? 'UTC'))
    .join('');
  const populated = items.length > 0;
  const status = populated
    ? `${items.length} headline${items.length === 1 ? '' : 's'} shown.`
    : 'There are no recent headlines yet.';
  const content = populated
    ? `<div class="feed-column-headings" aria-hidden="true"><span class="feed-column-heading feed-column-heading-date">Date</span><span class="feed-column-heading feed-column-heading-headline">Headline</span><span class="feed-column-heading feed-column-heading-source">Source</span></div><div class="feed-list" data-feed-list role="list">${itemMarkup}</div><div class="feed-pagination" data-feed-pagination hidden></div>`
    : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeText(`${publication.name} | News feed`)}</title>
    <script src="/public-theme.js"></script>
    <link rel="stylesheet" href="/public-feed.css">
    <script src="/public-feed.js" defer></script>
  </head>
  <body>
    <main class="public-feed-shell" data-publication-state="resolved">
      <header class="publication-header">
        <div class="publication-masthead" data-publication-masthead${accent}>
          ${logo}
          <div class="publication-identity">
            <h1 data-publication-name>${escapeText(publication.name)}</h1>
            ${description}
          </div>
        </div>
        ${themeControl()}
      </header>
      ${discoveryForm(discovery)}
      <p class="feed-status" data-feed-status role="status" aria-live="polite"><span class="feed-loading-indicator" data-feed-loading-indicator aria-hidden="true" hidden></span><span data-feed-status-message>${escapeText(status)}</span></p>
      <section data-feed-content data-state="${populated ? 'populated' : 'empty'}" aria-label="Latest headlines">${content}</section>
      <script type="application/json" data-public-feed-bootstrap>${safeJson(bootstrap)}</script>
    </main>
  </body>
</html>`;
}

function errorPage(
  title: string,
  message: string,
  state: PublicFeedPageError,
): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeText(title)}</title>
    <script src="/public-theme.js"></script>
    <link rel="stylesheet" href="/public-feed.css">
    <script src="/public-feed.js" defer></script>
  </head>
  <body>
    <main class="public-feed-shell" data-publication-state="unresolved">
      <header class="publication-header"><div class="publication-identity"><h1>Public feed</h1></div>${themeControl()}</header>
      <p class="feed-status" data-feed-status role="status" aria-live="polite"><span class="feed-loading-indicator" data-feed-loading-indicator aria-hidden="true" hidden></span><span data-feed-status-message>${escapeText(message)}</span></p>
      <section data-feed-content data-state="${state}" aria-label="Latest headlines"></section>
      <p><a href="/">Return to the public feed</a></p>
    </main>
  </body>
</html>`;
}

function errorPageDetail(
  error: PublicFeedPageError,
): Readonly<{ status: number; title: string; message: string }> {
  switch (error) {
    case 'invalid':
      return {
        status: 400,
        title: 'Invalid discovery request',
        message: 'This discovery request is invalid. Reset and try again.',
      };
    case 'not_found':
      return {
        status: 404,
        title: 'Publication unavailable',
        message: 'This publication is unavailable.',
      };
    case 'unavailable':
      return {
        status: 503,
        title: 'Feed unavailable',
        message: 'The feed is temporarily unavailable. Please try again later.',
      };
  }
}

function themeControl(): string {
  return `<fieldset class="theme-control" data-theme-control><legend>Theme</legend><div class="theme-options"><label><input type="radio" name="reader-theme" value="system" data-theme-option checked><span>System</span></label><label><input type="radio" name="reader-theme" value="light" data-theme-option><span>Light</span></label><label><input type="radio" name="reader-theme" value="dark" data-theme-option><span>Dark</span></label></div></fieldset>`;
}

function discoveryForm(discovery: PublicFeedBootstrap['discovery']): string {
  return `<form method="get" action="/" data-discovery-form aria-label="Discover headlines">
    <div class="discovery-field"><label for="discovery-keyword">Keyword</label><input id="discovery-keyword" name="q" type="search" data-discovery-keyword value="${escapeAttribute(discovery.query.q ?? '')}"></div>
    <div class="discovery-field"><label for="discovery-source">Source</label><select id="discovery-source" name="source" data-discovery-source>${renderChoices('All sources', discovery.sources, discovery.query.source)}</select></div>
    <div class="discovery-field"><label for="discovery-category">Category</label><select id="discovery-category" name="category" data-discovery-category>${renderChoices('All categories', discovery.categories, discovery.query.category)}</select></div>
    <div class="discovery-actions"><button type="submit">Search</button><a href="/" data-discovery-reset>Reset</a></div>
  </form>`;
}

function renderChoices(
  emptyLabel: string,
  choices: readonly PublicDiscoveryChoice[],
  selected: string | null,
): string {
  return `<option value=""${selected === null ? ' selected' : ''}>${escapeText(emptyLabel)}</option>${choices.map((choice) => `<option value="${escapeAttribute(choice.configKey)}"${choice.configKey === selected ? ' selected' : ''}>${escapeText(choice.displayName)}</option>`).join('')}`;
}

function renderItem(
  item: PublicFeedBootstrap['items'][number],
  timeZone: string,
): string {
  return `<article class="feed-row" data-feed-item-id="${escapeAttribute(item.articleId)}" role="listitem"><div class="feed-date"><span class="feed-field-label">Date</span><time datetime="${escapeAttribute(item.effectiveFeedDate)}">${escapeText(formatFeedDate(item.effectiveFeedDate, timeZone))}</time></div><div class="feed-source"><span class="feed-field-label">Source</span><span>${escapeText(item.sourceName)}</span></div><div class="feed-headline"><span class="feed-field-label">Headline</span><a class="feed-headline-link" href="${escapeAttribute(item.originalUrl)}">${escapeText(item.headline)}</a></div></article>`;
}

function publicBootstrap(
  feed: PublicFeed,
  request: PublicDiscoveryRequest,
): PublicFeedBootstrap {
  if (feed === null || typeof feed !== 'object')
    throw new Error('Unsafe public feed.');
  const publication = validatePublication(feed.publication);
  const sourceChoices = validateChoices(feed.sourceChoices ?? []);
  const categoryChoices = validateChoices(feed.categoryChoices ?? []);
  const query = {
    q: request.keywordQuery ?? null,
    source: request.sourceConfigKey ?? null,
    category: request.categoryConfigKey ?? null,
  };
  const items = feed.items.map(validateItem);
  const nextCursor = feed.nextCursor ?? null;
  if (nextCursor !== null) requiredString(nextCursor, 2048);
  return Object.freeze({
    publication,
    discovery: Object.freeze({
      query: Object.freeze(query),
      sources: sourceChoices,
      categories: categoryChoices,
    }),
    items: Object.freeze(items),
    nextCursor,
  });
}

function validatePublication(
  value: PublicFeedPublication,
): PublicFeedPublication {
  if (value === null || typeof value !== 'object')
    throw new Error('Unsafe publication.');
  const presentationTimezone =
    value.presentationTimezone === null
      ? null
      : requiredString(value.presentationTimezone, 100);
  if (presentationTimezone !== null) validTimeZone(presentationTimezone);
  return Object.freeze({
    name: requiredString(value.name, 200),
    description:
      value.description === null
        ? null
        : requiredString(value.description, 500),
    logoPath: value.logoPath === null ? null : validLogoPath(value.logoPath),
    accentColor:
      value.accentColor === null ? null : validAccentColor(value.accentColor),
    presentationTimezone,
  });
}

function validateChoices(
  choices: readonly PublicDiscoveryChoice[],
): readonly PublicDiscoveryChoice[] {
  if (!Array.isArray(choices) || choices.length > 200)
    throw new Error('Unsafe discovery choices.');
  return Object.freeze(
    choices.map((choice) => {
      if (choice === null || typeof choice !== 'object')
        throw new Error('Unsafe choice.');
      const configKey = requiredString(choice.configKey, 100);
      if (!/^[a-z0-9]+(?:_[a-z0-9]+)*$/u.test(configKey))
        throw new Error('Unsafe choice.');
      return Object.freeze({
        configKey,
        displayName: requiredString(choice.displayName, 200),
      });
    }),
  );
}

function validateItem(
  item: PublicFeedItem,
): PublicFeedBootstrap['items'][number] {
  if (item === null || typeof item !== 'object')
    throw new Error('Unsafe article.');
  if (
    !(item.effectiveFeedDate instanceof Date) ||
    Number.isNaN(item.effectiveFeedDate.getTime())
  )
    throw new Error('Unsafe article date.');
  if (
    item.feedDateSource !== 'published_at' &&
    item.feedDateSource !== 'first_seen_at'
  )
    throw new Error('Unsafe article date source.');
  return Object.freeze({
    articleId: requiredString(item.articleId, 100),
    effectiveFeedDate: item.effectiveFeedDate.toISOString(),
    feedDateSource: item.feedDateSource,
    headline: requiredString(item.headline, 1000),
    sourceName: requiredString(item.sourceName, 200),
    originalUrl: validOriginalUrl(item.originalUrl),
  });
}

function requiredString(value: unknown, maximumLength: number): string {
  if (
    typeof value !== 'string' ||
    value.trim() === '' ||
    Array.from(value).length > maximumLength
  )
    throw new Error('Unsafe public value.');
  return value;
}

function validLogoPath(value: unknown): string {
  const path = requiredString(value, 1024);
  if (
    !path.startsWith('/') ||
    path.startsWith('//') ||
    /[?#\\]/u.test(path) ||
    Array.from(path).some(
      (character) =>
        (character.codePointAt(0) ?? 0) <= 0x1f ||
        character.codePointAt(0) === 0x7f,
    )
  )
    throw new Error('Unsafe logo path.');
  return path;
}

function validAccentColor(value: unknown): string {
  const accent = requiredString(value, 7);
  if (!/^#[0-9A-F]{6}$/u.test(accent)) throw new Error('Unsafe accent color.');
  return accent;
}

function validTimeZone(value: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
  } catch {
    throw new Error('Unsafe presentation timezone.');
  }
}

function validOriginalUrl(value: unknown): string {
  const originalUrl = requiredString(value, 2048);
  const url = new URL(originalUrl);
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username !== '' ||
    url.password !== ''
  )
    throw new Error('Unsafe article URL.');
  return originalUrl;
}

function formatFeedDate(value: string, timeZone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Unsafe article date.');
  const parts = new Intl.DateTimeFormat('en-US', {
    calendar: 'gregory',
    day: 'numeric',
    month: 'short',
    numberingSystem: 'latn',
    timeZone,
    year: 'numeric',
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => ['month', 'day', 'year'].includes(part.type))
      .map((part) => [part.type, part.value]),
  );
  if (
    typeof values.month !== 'string' ||
    typeof values.day !== 'string' ||
    typeof values.year !== 'string'
  )
    throw new Error('Unsafe article date.');
  return `${values.month.toUpperCase()} ${values.day}, ${values.year}`;
}

function escapeText(value: string): string {
  return value.replace(
    /[&<>]/gu,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[character] ?? character,
  );
}
function escapeAttribute(value: string): string {
  return value.replace(
    /[&<>"']/gu,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ] ?? character,
  );
}
function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/gu,
    (character) =>
      ({
        '<': '\\u003c',
        '>': '\\u003e',
        '&': '\\u0026',
        '\u2028': '\\u2028',
        '\u2029': '\\u2029',
      })[character] ?? character,
  );
}
