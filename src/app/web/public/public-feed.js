/* global AbortController, document, HTMLElement, HTMLFormElement, HTMLInputElement, HTMLSelectElement, URL, URLSearchParams, fetch, history, window */

(() => {
  'use strict';

  const publicationName = document.querySelector('[data-publication-name]');
  const status = document.querySelector('[data-feed-status]');
  const content = document.querySelector('[data-feed-content]');
  const form = document.querySelector('[data-discovery-form]');
  const keyword = document.querySelector('[data-discovery-keyword]');
  const source = document.querySelector('[data-discovery-source]');
  const category = document.querySelector('[data-discovery-category]');
  const reset = document.querySelector('[data-discovery-reset]');

  if (
    !(publicationName instanceof HTMLElement) ||
    !(status instanceof HTMLElement) ||
    !(content instanceof HTMLElement) ||
    !(form instanceof HTMLFormElement) ||
    !(keyword instanceof HTMLInputElement) ||
    !(source instanceof HTMLSelectElement) ||
    !(category instanceof HTMLSelectElement) ||
    !(reset instanceof HTMLElement)
  ) {
    return;
  }

  const stateMessages = {
    loading: 'Loading the latest headlines.',
    empty: 'There are no recent headlines yet.',
    unavailable: 'This publication is unavailable.',
    invalid: 'This discovery request is invalid. Reset and try again.',
    error: 'The feed is temporarily unavailable. Please try again later.',
  };

  let activeRequest;
  let requestGeneration = 0;
  const firstPageState = { nextCursor: null };

  function setState(state) {
    content.replaceChildren();
    content.dataset.state = state;
    status.textContent = stateMessages[state] ?? '';
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
      !Array.isArray(value.items) ||
      value.discovery === null ||
      typeof value.discovery !== 'object' ||
      value.discovery.query === null ||
      typeof value.discovery.query !== 'object' ||
      !Array.isArray(value.discovery.sources) ||
      !Array.isArray(value.discovery.categories)
    ) {
      throw new Error('Invalid feed data.');
    }
    return {
      publication: {
        name: requiredString(value.publication.name),
      },
      discovery: {
        query: validatedQuery(value.discovery.query),
        sources: value.discovery.sources.map(validatedChoice),
        categories: value.discovery.categories.map(validatedChoice),
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
      nextCursor: validatedNextCursor(value.nextCursor),
    };
  }

  function validatedQuery(query) {
    return {
      q: nullableString(query.q),
      source: nullableString(query.source),
      category: nullableString(query.category),
    };
  }

  function nullableString(value) {
    if (value === null) return null;
    return requiredString(value);
  }

  function validatedChoice(choice) {
    if (choice === null || typeof choice !== 'object') {
      throw new Error('Invalid feed data.');
    }
    return {
      configKey: requiredString(choice.configKey),
      displayName: requiredString(choice.displayName),
    };
  }

  function validatedNextCursor(value) {
    if (value === null) return null;
    return requiredString(value);
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

  function resetPublicationPresentation() {
    publicationName.textContent = 'News feed';
    document.title = 'News feed';
  }

  function replaceChoices(select, choices, emptyLabel) {
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = emptyLabel;
    const options = choices.map((choice) => {
      const option = document.createElement('option');
      option.value = choice.configKey;
      option.textContent = choice.displayName;
      return option;
    });
    select.replaceChildren(emptyOption, ...options);
  }

  function clearDiscoveryControls() {
    keyword.value = '';
    replaceChoices(source, [], 'All sources');
    replaceChoices(category, [], 'All categories');
  }

  function renderDiscoveryControls(discovery) {
    replaceChoices(source, discovery.sources, 'All sources');
    replaceChoices(category, discovery.categories, 'All categories');
    keyword.value = discovery.query.q ?? '';
    source.value = discovery.query.source ?? '';
    category.value = discovery.query.category ?? '';
  }

  function firstPagePathFromLocation() {
    return `/api/feed${window.location.search}`;
  }

  function rootUrlFromControls() {
    const url = new URL(window.location.href);
    const parameters = new URLSearchParams();
    const trimmedKeyword = keyword.value.trim();
    if (trimmedKeyword !== '') parameters.set('q', trimmedKeyword);
    if (source.value !== '') parameters.set('source', source.value);
    if (category.value !== '') parameters.set('category', category.value);
    url.pathname = '/';
    url.search = parameters.toString();
    url.hash = '';
    return `${url.pathname}${url.search}`;
  }

  function isCurrentRequest(generation, controller) {
    return generation === requestGeneration && activeRequest === controller;
  }

  async function loadFirstPage(path) {
    requestGeneration += 1;
    const generation = requestGeneration;
    activeRequest?.abort();
    const controller = new AbortController();
    activeRequest = controller;
    firstPageState.nextCursor = null;
    clearDiscoveryControls();
    resetPublicationPresentation();
    setState('loading');
    try {
      const response = await fetch(path, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!isCurrentRequest(generation, controller)) return;
      if (response.status === 400) {
        setState('invalid');
        return;
      }
      if (response.status === 404) {
        setState('unavailable');
        return;
      }
      if (!response.ok) throw new Error('Feed request failed.');
      const feed = validatedFeed(await response.json());
      if (!isCurrentRequest(generation, controller)) return;
      publicationName.textContent = feed.publication.name;
      document.title = `${feed.publication.name} | News feed`;
      renderDiscoveryControls(feed.discovery);
      firstPageState.nextCursor = feed.nextCursor;
      if (feed.items.length === 0) {
        setState('empty');
        return;
      }
      renderItems(feed.items);
    } catch {
      if (!isCurrentRequest(generation, controller)) return;
      setState('error');
    } finally {
      if (isCurrentRequest(generation, controller)) activeRequest = undefined;
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const url = rootUrlFromControls();
    if (`${window.location.pathname}${window.location.search}` !== url) {
      history.pushState(null, '', url);
    }
    void loadFirstPage(
      '/api/feed' + new URL(url, window.location.origin).search,
    );
  });

  reset.addEventListener('click', () => {
    const url = '/';
    if (`${window.location.pathname}${window.location.search}` !== url) {
      history.pushState(null, '', url);
    }
    void loadFirstPage('/api/feed');
  });

  window.addEventListener('popstate', () => {
    void loadFirstPage(firstPagePathFromLocation());
  });

  void loadFirstPage(firstPagePathFromLocation());
})();
