/* global AbortController, document, HTMLElement, HTMLButtonElement, HTMLFormElement, HTMLInputElement, HTMLSelectElement, URL, URLSearchParams, fetch, history, window */

(() => {
  'use strict';

  const shell = document.querySelector('[data-publication-state]');
  const masthead = document.querySelector('[data-publication-masthead]');
  const publicationLogo = document.querySelector('[data-publication-logo]');
  const publicationName = document.querySelector('[data-publication-name]');
  const publicationDescription = document.querySelector(
    '[data-publication-description]',
  );
  const status = document.querySelector('[data-feed-status]');
  const statusMessage = document.querySelector('[data-feed-status-message]');
  const loadingIndicator = document.querySelector(
    '[data-feed-loading-indicator]',
  );
  const content = document.querySelector('[data-feed-content]');
  const form = document.querySelector('[data-discovery-form]');
  const keyword = document.querySelector('[data-discovery-keyword]');
  const source = document.querySelector('[data-discovery-source]');
  const category = document.querySelector('[data-discovery-category]');
  const reset = document.querySelector('[data-discovery-reset]');

  if (
    !(shell instanceof HTMLElement) ||
    !(masthead instanceof HTMLElement) ||
    !(publicationLogo instanceof HTMLElement) ||
    !(publicationName instanceof HTMLElement) ||
    !(publicationDescription instanceof HTMLElement) ||
    !(status instanceof HTMLElement) ||
    !(statusMessage instanceof HTMLElement) ||
    !(loadingIndicator instanceof HTMLElement) ||
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
    empty: 'There are no recent headlines yet.',
    unavailable: 'This publication is unavailable.',
    invalid: 'This discovery request is invalid. Reset and try again.',
    error: 'The feed is temporarily unavailable. Please try again later.',
  };

  const state = {
    publication: null,
    criteria: null,
    items: [],
    itemIds: new Set(),
    nextCursor: null,
    firstPage: {
      controller: undefined,
      generation: 0,
    },
    continuation: {
      controller: undefined,
      generation: 0,
      loading: false,
      error: null,
    },
  };

  function setState(viewState) {
    content.replaceChildren();
    content.dataset.state = viewState;
    loadingIndicator.hidden = viewState !== 'loading';
    statusMessage.textContent =
      viewState === 'loading'
        ? state.publication === null
          ? 'Loading publication…'
          : 'Loading the latest headlines.'
        : (stateMessages[viewState] ?? '');
  }

  function formatUtcDate(value) {
    return formatCalendarDate(value, 'UTC');
  }

  function formatCalendarDate(value, timeZone) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error('Invalid feed date.');
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
        .filter(
          (part) =>
            part.type === 'month' ||
            part.type === 'day' ||
            part.type === 'year',
        )
        .map((part) => [part.type, part.value]),
    );
    if (
      typeof values.month !== 'string' ||
      typeof values.day !== 'string' ||
      typeof values.year !== 'string'
    ) {
      throw new Error('Invalid feed date.');
    }
    return `${values.month.toUpperCase()} ${values.day}, ${values.year}`;
  }

  function requiredString(value) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error('Invalid feed data.');
    }
    return value;
  }

  function validatedPublication(value) {
    if (value === null || typeof value !== 'object') {
      throw new Error('Invalid feed data.');
    }
    const name = requiredString(value.name);
    if (name.length > 200) throw new Error('Invalid feed data.');
    return {
      name,
      description: validatedDescription(value.description),
      logoPath: validatedLogoPath(value.logoPath),
      accentColor: validatedAccentColor(value.accentColor),
      presentationTimezone: validatedPresentationTimezone(
        value.presentationTimezone,
      ),
    };
  }

  function validatedDescription(value) {
    if (value === null) return null;
    const description = requiredString(value);
    if (Array.from(description).length > 500) {
      throw new Error('Invalid feed data.');
    }
    return description;
  }

  function validatedLogoPath(value) {
    if (value === null) return null;
    const logoPath = requiredString(value);
    if (
      logoPath.length > 1024 ||
      !logoPath.startsWith('/') ||
      logoPath.startsWith('//') ||
      /[?#\\]/u.test(logoPath) ||
      Array.from(logoPath).some((character) => {
        const codePoint = character.codePointAt(0);
        return (
          codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)
        );
      })
    ) {
      throw new Error('Invalid feed data.');
    }
    return logoPath;
  }

  function validatedAccentColor(value) {
    if (value === null) return null;
    const accentColor = requiredString(value);
    if (!/^#[0-9A-F]{6}$/u.test(accentColor)) {
      throw new Error('Invalid feed data.');
    }
    return accentColor;
  }

  function validatedPresentationTimezone(value) {
    if (value === null) return null;
    const timeZone = requiredString(value);
    try {
      new Intl.DateTimeFormat('en-US', { timeZone }).format();
    } catch {
      throw new Error('Invalid feed data.');
    }
    return timeZone;
  }

  function validOriginalUrl(value) {
    const originalUrl = requiredString(value);
    const url = new URL(originalUrl);
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.username !== '' ||
      url.password !== ''
    ) {
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
      publication: validatedPublication(value.publication),
      discovery: {
        query: validatedQuery(value.discovery.query),
        sources: value.discovery.sources.map(validatedChoice),
        categories: value.discovery.categories.map(validatedChoice),
      },
      items: value.items.map(validatedItem),
      nextCursor: validatedNextCursor(value.nextCursor),
    };
  }

  function validatedItem(item) {
    if (item === null || typeof item !== 'object') {
      throw new Error('Invalid feed data.');
    }
    const effectiveFeedDate = requiredString(item.effectiveFeedDate);
    formatUtcDate(effectiveFeedDate);
    const feedDateSource = requiredString(item.feedDateSource);
    if (
      feedDateSource !== 'published_at' &&
      feedDateSource !== 'first_seen_at'
    ) {
      throw new Error('Invalid feed data.');
    }
    return {
      articleId: requiredString(item.articleId),
      effectiveFeedDate,
      feedDateSource,
      headline: requiredString(item.headline),
      sourceName: requiredString(item.sourceName),
      originalUrl: validOriginalUrl(item.originalUrl),
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

  function copiedCriteria(criteria) {
    return Object.freeze({
      q: criteria.q,
      source: criteria.source,
      category: criteria.category,
    });
  }

  function articleIdsFor(items, existingIds = new Set()) {
    const itemIds = new Set(existingIds);
    for (const item of items) {
      if (itemIds.has(item.articleId)) {
        throw new Error('Duplicate feed article.');
      }
      itemIds.add(item.articleId);
    }
    return itemIds;
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

  function createItemRow(item) {
    const row = document.createElement('article');
    row.className = 'feed-row';
    row.setAttribute('role', 'listitem');

    const time = document.createElement('time');
    time.dateTime = item.effectiveFeedDate;
    time.textContent = formatCalendarDate(
      item.effectiveFeedDate,
      state.publication?.presentationTimezone ?? 'UTC',
    );

    const link = document.createElement('a');
    link.className = 'feed-headline-link';
    link.setAttribute('href', item.originalUrl);
    link.textContent = item.headline;

    const sourceName = document.createElement('span');
    sourceName.textContent = item.sourceName;

    row.append(
      feedField('Date', 'date', time),
      feedField('Source', 'source', sourceName),
      feedField('Headline', 'headline', link),
    );
    return row;
  }

  function createItemRows(items) {
    const rows = document.createDocumentFragment();
    for (const item of items) rows.append(createItemRow(item));
    return rows;
  }

  function createColumnHeadings() {
    const heading = document.createElement('div');
    heading.className = 'feed-column-headings';
    heading.setAttribute('aria-hidden', 'true');
    for (const label of ['Date', 'Headline', 'Source']) {
      const column = document.createElement('span');
      column.className = `feed-column-heading feed-column-heading-${label.toLowerCase()}`;
      column.textContent = label;
      heading.append(column);
    }
    return heading;
  }

  function updateDisplayedStatus() {
    const count = state.items.length;
    loadingIndicator.hidden = true;
    statusMessage.textContent = `${count} headline${count === 1 ? '' : 's'} shown.`;
  }

  function renderItems() {
    const list = document.createElement('div');
    list.className = 'feed-list';
    list.dataset.feedList = '';
    list.setAttribute('role', 'list');
    list.append(createItemRows(state.items));

    const pagination = document.createElement('div');
    pagination.className = 'feed-pagination';
    pagination.dataset.feedPagination = '';
    pagination.hidden = true;

    content.replaceChildren(createColumnHeadings(), list, pagination);
    content.dataset.state = 'populated';
    updateDisplayedStatus();
    renderPagination();
  }

  function paginationContainer() {
    const pagination = content.querySelector('[data-feed-pagination]');
    return pagination instanceof HTMLElement ? pagination : undefined;
  }

  function renderPagination() {
    const pagination = paginationContainer();
    if (pagination === undefined) return;

    const canContinue =
      state.items.length > 0 &&
      state.nextCursor !== null &&
      state.criteria !== null;
    pagination.hidden = !canContinue;
    if (!canContinue) {
      pagination.replaceChildren();
      pagination.removeAttribute('aria-busy');
      return;
    }

    let paginationStatus = pagination.querySelector(
      '[data-feed-pagination-status]',
    );
    let paginationError = pagination.querySelector(
      '[data-feed-pagination-error]',
    );
    let loadMore = pagination.querySelector('[data-feed-load-more]');
    if (
      !(paginationStatus instanceof HTMLElement) ||
      !(paginationError instanceof HTMLElement) ||
      !(loadMore instanceof HTMLButtonElement)
    ) {
      paginationStatus = document.createElement('p');
      paginationStatus.dataset.feedPaginationStatus = '';
      paginationStatus.setAttribute('role', 'status');
      paginationStatus.setAttribute('aria-live', 'polite');

      paginationError = document.createElement('p');
      paginationError.dataset.feedPaginationError = '';
      paginationError.setAttribute('role', 'alert');
      paginationError.hidden = true;

      loadMore = document.createElement('button');
      loadMore.type = 'button';
      loadMore.dataset.feedLoadMore = '';
      loadMore.textContent = 'Load more';
      loadMore.addEventListener('click', () => {
        void loadContinuation();
      });
      pagination.replaceChildren(paginationStatus, paginationError, loadMore);
    }

    pagination.setAttribute(
      'aria-busy',
      state.continuation.loading ? 'true' : 'false',
    );
    paginationStatus.textContent = state.continuation.loading
      ? 'Loading more headlines.'
      : '';
    paginationError.hidden = state.continuation.error === null;
    paginationError.textContent =
      state.continuation.error === null
        ? ''
        : 'Unable to load more headlines. Please try again.';
    loadMore.disabled = state.continuation.loading;
    loadMore.textContent = state.continuation.loading
      ? 'Loading\u2026'
      : 'Load more';
    loadMore.setAttribute(
      'aria-disabled',
      state.continuation.loading ? 'true' : 'false',
    );
  }

  function renderPublicationPresentation(publication) {
    state.publication = publication;
    shell.dataset.publicationState = 'resolved';
    publicationName.textContent = publication.name;
    publicationDescription.textContent = publication.description ?? '';
    publicationDescription.hidden = publication.description === null;
    publicationLogo.replaceChildren();
    publicationLogo.hidden = publication.logoPath === null;
    if (publication.logoPath !== null) {
      const image = document.createElement('img');
      image.className = 'publication-logo-image';
      image.alt = '';
      image.addEventListener('error', () => {
        if (!publicationLogo.contains(image)) return;
        image.remove();
        publicationLogo.hidden = true;
      });
      image.src = publication.logoPath;
      publicationLogo.append(image);
    }
    if (publication.accentColor === null) {
      masthead.style.removeProperty('--publication-accent');
    } else {
      masthead.style.setProperty(
        '--publication-accent',
        publication.accentColor,
      );
    }
    masthead.hidden = false;
    document.title = `${publication.name} | News feed`;
  }

  function clearPublicationPresentation(title) {
    state.publication = null;
    shell.dataset.publicationState = 'unresolved';
    publicationName.textContent = '';
    publicationDescription.textContent = '';
    publicationDescription.hidden = true;
    publicationLogo.replaceChildren();
    publicationLogo.hidden = true;
    masthead.style.removeProperty('--publication-accent');
    masthead.hidden = true;
    document.title = title;
  }

  function setUnbrandedDocumentTitle(title) {
    if (state.publication === null) document.title = title;
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
    const rawSearch = window.location.search;
    if (
      /(?:^|[?&])(?:c|%63)(?:u|%75)(?:r|%72)(?:s|%73)(?:o|%6f)(?:r|%72)(?:=|&|$)/iu.test(
        rawSearch,
      )
    ) {
      return '/api/feed?cursor=';
    }
    return `/api/feed${rawSearch}`;
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

  function continuationPath(criteria, cursor) {
    const parameters = new URLSearchParams();
    if (criteria.q !== null) parameters.set('q', criteria.q);
    if (criteria.source !== null) parameters.set('source', criteria.source);
    if (criteria.category !== null)
      parameters.set('category', criteria.category);
    parameters.set('cursor', cursor);
    return `/api/feed?${parameters.toString()}`;
  }

  function invalidateContinuation() {
    state.continuation.generation += 1;
    state.continuation.controller?.abort();
    state.continuation.controller = undefined;
    state.continuation.loading = false;
    state.continuation.error = null;
  }

  function clearRenderedFeedState() {
    state.criteria = null;
    state.items = [];
    state.itemIds = new Set();
    state.nextCursor = null;
  }

  function isCurrentFirstPage(generation, controller) {
    return (
      generation === state.firstPage.generation &&
      state.firstPage.controller === controller
    );
  }

  function isCurrentContinuation(generation, controller) {
    return (
      generation === state.continuation.generation &&
      state.continuation.controller === controller
    );
  }

  function sameCriteria(left, right) {
    return (
      right !== null &&
      left.q === right.q &&
      left.source === right.source &&
      left.category === right.category
    );
  }

  async function loadFirstPage(path) {
    state.firstPage.generation += 1;
    const generation = state.firstPage.generation;
    state.firstPage.controller?.abort();
    invalidateContinuation();
    clearRenderedFeedState();
    const controller = new AbortController();
    state.firstPage.controller = controller;
    clearDiscoveryControls();
    setUnbrandedDocumentTitle('Loading publication…');
    setState('loading');
    try {
      const response = await fetch(path, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!isCurrentFirstPage(generation, controller)) return;
      if (response.status === 400) {
        setUnbrandedDocumentTitle('Invalid discovery request');
        setState('invalid');
        return;
      }
      if (response.status === 404) {
        clearPublicationPresentation('Publication unavailable');
        setState('unavailable');
        return;
      }
      if (!response.ok) throw new Error('Feed request failed.');
      const feed = validatedFeed(await response.json());
      if (!isCurrentFirstPage(generation, controller)) return;
      const itemIds = articleIdsFor(feed.items);
      state.criteria = copiedCriteria(feed.discovery.query);
      state.items = feed.items;
      state.itemIds = itemIds;
      state.nextCursor = feed.nextCursor;
      renderPublicationPresentation(feed.publication);
      renderDiscoveryControls(feed.discovery);
      if (feed.items.length === 0) {
        setState('empty');
        return;
      }
      renderItems();
    } catch {
      if (!isCurrentFirstPage(generation, controller)) return;
      setUnbrandedDocumentTitle('Feed unavailable');
      setState('error');
    } finally {
      if (isCurrentFirstPage(generation, controller)) {
        state.firstPage.controller = undefined;
      }
    }
  }

  async function loadContinuation() {
    if (
      state.criteria === null ||
      state.nextCursor === null ||
      state.items.length === 0 ||
      state.continuation.loading ||
      state.continuation.controller !== undefined
    ) {
      return;
    }

    const criteria = state.criteria;
    const cursor = state.nextCursor;
    state.continuation.generation += 1;
    const generation = state.continuation.generation;
    const controller = new AbortController();
    state.continuation.controller = controller;
    state.continuation.loading = true;
    state.continuation.error = null;
    renderPagination();

    try {
      const response = await fetch(continuationPath(criteria, cursor), {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!isCurrentContinuation(generation, controller)) return;
      if (!response.ok) throw new Error('Continuation request failed.');
      const feed = validatedFeed(await response.json());
      if (!isCurrentContinuation(generation, controller)) return;
      if (!sameCriteria(feed.discovery.query, criteria)) {
        throw new Error('Continuation criteria mismatch.');
      }
      if (feed.items.length === 0 && feed.nextCursor !== null) {
        throw new Error('Invalid empty continuation page.');
      }
      if (feed.nextCursor === cursor) {
        throw new Error('Repeated continuation cursor.');
      }
      const nextItemIds = articleIdsFor(feed.items, state.itemIds);
      const rows = createItemRows(feed.items);
      if (!isCurrentContinuation(generation, controller)) return;
      const list = content.querySelector('[data-feed-list]');
      if (!(list instanceof HTMLElement)) throw new Error('Missing feed list.');
      list.append(rows);
      state.items = [...state.items, ...feed.items];
      state.itemIds = nextItemIds;
      state.nextCursor = feed.nextCursor;
      state.continuation.loading = false;
      state.continuation.controller = undefined;
      state.continuation.error = null;
      updateDisplayedStatus();
      renderPagination();
    } catch {
      if (!isCurrentContinuation(generation, controller)) return;
      state.continuation.loading = false;
      state.continuation.controller = undefined;
      state.continuation.error = 'continuation_failed';
      renderPagination();
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
