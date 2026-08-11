/* global document, HTMLElement, window, URL, fetch */

(() => {
  'use strict';

  const publicationName = document.querySelector('[data-publication-name]');
  const status = document.querySelector('[data-feed-status]');
  const content = document.querySelector('[data-feed-content]');

  if (
    !(publicationName instanceof HTMLElement) ||
    !(status instanceof HTMLElement) ||
    !(content instanceof HTMLElement)
  ) {
    return;
  }

  const stateMessages = {
    loading: 'Loading the latest headlines.',
    empty: 'There are no recent headlines yet.',
    unavailable: 'This publication is unavailable.',
    error: 'The feed is temporarily unavailable. Please try again later.',
  };

  function setState(state) {
    content.replaceChildren();
    content.dataset.state = state;
    status.textContent = stateMessages[state] ?? '';
  }

  function publicationSlug() {
    const prefix = '/publications/';
    if (!window.location.pathname.startsWith(prefix)) {
      throw new Error('Unexpected public feed path.');
    }
    const encodedSlug = window.location.pathname.slice(prefix.length);
    if (encodedSlug.length === 0 || encodedSlug.includes('/')) {
      throw new Error('Unexpected public feed path.');
    }
    return decodeURIComponent(encodedSlug);
  }

  function formatUtcDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error('Invalid feed date.');
    const month = [
      'JAN',
      'FEB',
      'MAR',
      'APR',
      'MAY',
      'JUN',
      'JUL',
      'AUG',
      'SEP',
      'OCT',
      'NOV',
      'DEC',
    ][date.getUTCMonth()];
    return `${month} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
  }

  function requiredString(value) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error('Invalid feed data.');
    }
    return value;
  }

  function validOriginalUrl(value) {
    const originalUrl = requiredString(value);
    const url = new URL(originalUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('Invalid feed URL.');
    }
    return originalUrl;
  }

  function validatedFeed(value) {
    if (
      value === null ||
      typeof value !== 'object' ||
      value.publication === null ||
      typeof value.publication !== 'object' ||
      !Array.isArray(value.items)
    ) {
      throw new Error('Invalid feed data.');
    }
    return {
      publication: {
        id: requiredString(value.publication.id),
        slug: requiredString(value.publication.slug),
        name: requiredString(value.publication.name),
      },
      items: value.items.map((item) => {
        if (item === null || typeof item !== 'object') {
          throw new Error('Invalid feed data.');
        }
        return {
          articleId: requiredString(item.articleId),
          effectiveFeedDate: requiredString(item.effectiveFeedDate),
          feedDateSource: requiredString(item.feedDateSource),
          headline: requiredString(item.headline),
          sourceName: requiredString(item.sourceName),
          originalUrl: validOriginalUrl(item.originalUrl),
        };
      }),
    };
  }

  function feedField(label, className, value) {
    const field = document.createElement('div');
    field.className = `feed-${className}`;
    const fieldLabel = document.createElement('span');
    fieldLabel.className = 'feed-field-label';
    fieldLabel.textContent = label;
    field.append(fieldLabel, value);
    return field;
  }

  function renderItems(items) {
    const heading = document.createElement('div');
    heading.className = 'feed-column-headings';
    heading.setAttribute('aria-hidden', 'true');
    for (const label of ['Date', 'Headline', 'Source']) {
      const column = document.createElement('span');
      column.textContent = label;
      heading.append(column);
    }

    const list = document.createElement('div');
    list.className = 'feed-list';
    list.setAttribute('role', 'list');
    for (const item of items) {
      const row = document.createElement('article');
      row.className = 'feed-row';
      row.setAttribute('role', 'listitem');

      const time = document.createElement('time');
      time.dateTime = item.effectiveFeedDate;
      time.textContent = formatUtcDate(item.effectiveFeedDate);

      const link = document.createElement('a');
      link.className = 'feed-headline-link';
      link.setAttribute('href', item.originalUrl);
      link.textContent = item.headline;

      const source = document.createElement('span');
      source.textContent = item.sourceName;

      row.append(
        feedField('Date', 'date', time),
        feedField('Headline', 'headline', link),
        feedField('Source', 'source', source),
      );
      list.append(row);
    }
    content.replaceChildren(heading, list);
    content.dataset.state = 'populated';
    status.textContent = `${items.length} latest headline${items.length === 1 ? '' : 's'}.`;
  }

  async function loadFeed() {
    setState('loading');
    try {
      const slug = publicationSlug();
      const response = await fetch(
        `/api/publications/${encodeURIComponent(slug)}/feed`,
        { headers: { Accept: 'application/json' } },
      );
      if (response.status === 404) {
        setState('unavailable');
        return;
      }
      if (!response.ok) throw new Error('Feed request failed.');
      const feed = validatedFeed(await response.json());
      publicationName.textContent = feed.publication.name;
      document.title = `${feed.publication.name} | News feed`;
      if (feed.items.length === 0) {
        setState('empty');
        return;
      }
      renderItems(feed.items);
    } catch {
      setState('error');
    }
  }

  void loadFeed();
})();
