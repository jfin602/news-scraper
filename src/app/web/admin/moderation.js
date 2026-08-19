/* global document, HTMLButtonElement, URLSearchParams */
import {
  api,
  mutate,
  AdminRequestError,
  messageForError,
  required,
  input,
  setGlobalStatus,
  setListState,
  showMessage,
  hideMessage,
  humanize,
  dateTime,
  statePill,
} from './core.js';
import { catalog } from './catalog.js';

const state = {
  articles: [],
  articleCriteria: {},
  articleCursor: null,
  selectedArticleId: null,
  selectedArticle: null,
  articleRequestSequence: 0,
  articleListLoading: false,
  reviews: [],
  reviewCriteria: { state: 'pending' },
  reviewCursor: null,
  selectedReviewId: null,
  selectedReview: null,
  reviewRequestSequence: 0,
  reviewListLoading: false,
  mergeNeedsPrimary: false,
};
const elements = {
  articleFilterForm: required('[data-article-filter-form]'),
  articleFilterReset: required('[data-article-filter-reset]'),
  articleSourceFilter: required('[data-article-source-filter]'),
  articleCategoryFilter: required('[data-article-category-filter]'),
  articleList: required('[data-article-list]'),
  articleListState: required('[data-article-list-state]'),
  articleLoadMore: required('[data-article-load-more]'),
  articleDetailHeading: required('[data-article-detail-heading]'),
  articleDetailHelp: required('[data-article-detail-help]'),
  articleDetailState: required('[data-article-detail-state]'),
  articleDetailContent: required('[data-article-detail-content]'),
  articleStateSummary: required('[data-article-state-summary]'),
  articleOverview: required('[data-article-overview]'),
  articleHide: required('[data-article-hide]'),
  articleRestore: required('[data-article-restore]'),
  articleDisplayForm: required('[data-article-display-form]'),
  articleDisplayError: required('[data-article-display-error]'),
  articleDisplayClear: required('[data-article-display-clear]'),
  articleCategoryForm: required('[data-article-category-form]'),
  articleCategoryOptions: required('[data-article-category-options]'),
  articleCategoryError: required('[data-article-category-error]'),
  articleCategoryClear: required('[data-article-category-clear]'),
  articleObservations: required('[data-article-observations]'),
  articleHistory: required('[data-article-history]'),
  reviewFilterForm: required('[data-review-filter-form]'),
  reviewList: required('[data-review-list]'),
  reviewListState: required('[data-review-list-state]'),
  reviewLoadMore: required('[data-review-load-more]'),
  reviewDetailHeading: required('[data-review-detail-heading]'),
  reviewDetailHelp: required('[data-review-detail-help]'),
  reviewDetailState: required('[data-review-detail-state]'),
  reviewDetailContent: required('[data-review-detail-content]'),
  reviewConflictMessage: required('[data-review-conflict-message]'),
  reviewArticles: required('[data-review-articles]'),
  reviewSignals: required('[data-review-signals]'),
  reviewActionForm: required('[data-review-action-form]'),
  reviewDismiss: required('[data-review-dismiss]'),
  reviewMerge: required('[data-review-merge]'),
  reviewGroupSelect: required('[data-review-group-select]'),
  reviewMergePrimary: required('[data-review-merge-primary]'),
  reviewSplitMembers: required('[data-review-split-members]'),
  reviewSplit: required('[data-review-split]'),
  reviewPrimary: required('[data-review-primary]'),
};

async function loadArticlesWorkspace() {
  setGlobalStatus('loading', 'Loading Article moderation workspace…');
  populateArticleFilters();
  await Promise.all([loadArticleList(), loadReviewQueue()]);
  if (state.selectedArticleId !== null)
    await selectArticle(state.selectedArticleId, { focus: false });
  if (state.selectedReviewId !== null)
    await selectReview(state.selectedReviewId, { focus: false });
  setGlobalStatus('ready', 'Article moderation workspace is ready.');
}

function populateArticleFilters() {
  populateSelect(
    elements.articleSourceFilter,
    catalog.sources,
    'Any Source',
    'configKey',
    'displayName',
  );
  populateSelect(
    elements.articleCategoryFilter,
    catalog.categories,
    'Any Category',
    'configKey',
    'displayName',
  );
  const criteria = state.articleCriteria;
  elements.articleSourceFilter.value = criteria.sourceConfigKey ?? '';
  elements.articleCategoryFilter.value = criteria.categoryConfigKey ?? '';
}

function populateSelect(select, values, emptyLabel, valueKey, labelKey) {
  const current = select.value;
  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = emptyLabel;
  select.replaceChildren(empty);
  for (const value of values) {
    const option = document.createElement('option');
    option.value = value[valueKey];
    option.textContent = value[labelKey];
    select.append(option);
  }
  if (current !== '') select.value = current;
}

async function applyArticleFilters() {
  const form = elements.articleFilterForm;
  state.articleCriteria = {
    ...(input(form, 'q').value.trim() === ''
      ? {}
      : { q: input(form, 'q').value.trim() }),
    ...(input(form, 'sourceConfigKey').value === ''
      ? {}
      : { sourceConfigKey: input(form, 'sourceConfigKey').value }),
    ...(input(form, 'visibilityState').value === ''
      ? {}
      : { visibilityState: input(form, 'visibilityState').value }),
    ...(input(form, 'categoryConfigKey').value === ''
      ? {}
      : { categoryConfigKey: input(form, 'categoryConfigKey').value }),
    ...(input(form, 'duplicateRole').value === ''
      ? {}
      : { duplicateRole: input(form, 'duplicateRole').value }),
    ...(input(form, 'duplicateReviewState').value === ''
      ? {}
      : { duplicateReviewState: input(form, 'duplicateReviewState').value }),
    ...(input(form, 'duplicateReviewParticipating').checked
      ? { duplicateReviewParticipating: true }
      : {}),
  };
  state.selectedArticleId = null;
  state.selectedArticle = null;
  renderArticleDetail();
  await loadArticleList();
}

function resetArticleFilters() {
  elements.articleFilterForm.reset();
  state.articleCriteria = {};
  state.articleCursor = null;
  state.articles = [];
  state.selectedArticleId = null;
  state.selectedArticle = null;
  renderArticleDetail();
}

async function loadArticleList({ append = false } = {}) {
  if (state.articleListLoading) return;
  if (append && state.articleCursor === null) return;
  state.articleListLoading = true;
  const sequence = ++state.articleRequestSequence;
  if (!append) {
    state.articleCursor = null;
    state.articles = [];
    setListState(elements.articleListState, 'loading', 'Loading Articles…');
    elements.articleList.replaceChildren();
  }
  try {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(state.articleCriteria))
      query.set(key, String(value));
    query.set('pageSize', '20');
    if (append && state.articleCursor !== null)
      query.set('cursor', state.articleCursor);
    const result = await api(`/admin/api/articles?${query.toString()}`);
    if (sequence !== state.articleRequestSequence) return;
    state.articles = append
      ? [...state.articles, ...(result.articles ?? [])]
      : (result.articles ?? []);
    state.articleCursor = result.nextCursor ?? null;
    renderArticleList();
  } catch (error) {
    if (sequence === state.articleRequestSequence) {
      state.articleCursor = null;
      setListState(elements.articleListState, 'error', messageForError(error));
      elements.articleLoadMore.hidden = true;
      elements.articleListState.focus();
    }
  } finally {
    if (sequence === state.articleRequestSequence)
      state.articleListLoading = false;
  }
}

function renderArticleList() {
  elements.articleList.replaceChildren();
  if (state.articles.length === 0) {
    setListState(
      elements.articleListState,
      'empty',
      'No stored Articles match these filters.',
    );
  } else {
    setListState(elements.articleListState, 'ready', '');
    for (const article of state.articles) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'selection-button';
      button.dataset.articleId = article.articleId;
      button.setAttribute(
        'aria-current',
        state.selectedArticleId === article.articleId ? 'true' : 'false',
      );
      const title = document.createElement('span');
      title.className = 'selection-title';
      title.textContent = article.displayTitle;
      const source = document.createElement('span');
      source.className = 'selection-meta';
      source.textContent = article.source.displayName;
      const states = document.createElement('span');
      states.className = 'state-line';
      states.append(
        statePill('Visibility', article.visibilityState),
        statePill('Duplicate', article.duplicate.role),
      );
      item.append(button);
      button.append(title, source, states);
      elements.articleList.append(item);
    }
  }
  elements.articleLoadMore.hidden = state.articleCursor === null;
}

async function selectArticle(articleId, { focus = true } = {}) {
  if (typeof articleId !== 'string' || articleId.length === 0) return;
  state.selectedArticleId = articleId;
  state.selectedArticle = null;
  renderArticleList();
  elements.articleDetailContent.hidden = true;
  elements.articleDetailState.dataset.articleDetailState = 'loading';
  elements.articleDetailState.textContent = 'Loading Article detail…';
  elements.articleDetailState.hidden = false;
  try {
    const result = await api(
      `/admin/api/articles/${encodeURIComponent(articleId)}`,
    );
    if (state.selectedArticleId !== articleId) return;
    state.selectedArticle = result.article;
    renderArticleDetail();
    if (focus) elements.articleDetailHeading.focus();
  } catch (error) {
    if (state.selectedArticleId === articleId) {
      if (error instanceof AdminRequestError && error.status === 404) {
        state.selectedArticleId = null;
        state.selectedArticle = null;
        renderArticleDetail();
        return;
      }
      elements.articleDetailState.dataset.articleDetailState = 'error';
      elements.articleDetailState.textContent = messageForError(error);
      elements.articleDetailState.focus();
    }
  }
}

function renderArticleDetail() {
  const article = state.selectedArticle;
  elements.articleDetailContent.hidden = article === null;
  if (article === null) {
    elements.articleDetailHeading.textContent = 'Select an Article';
    elements.articleDetailHelp.textContent =
      'Select a stored Article to inspect its Source values, provenance, and moderation state.';
    elements.articleDetailState.dataset.articleDetailState = 'empty';
    elements.articleDetailState.textContent = 'No Article selected.';
    elements.articleDetailState.hidden = false;
    elements.articleStateSummary.hidden = true;
    return;
  }
  elements.articleDetailHeading.textContent = article.displayTitle;
  elements.articleDetailHelp.textContent =
    'Identity, publisher destination, and provenance are read-only. Moderation changes are explicit and reversible.';
  elements.articleDetailState.hidden = true;
  elements.articleStateSummary.replaceChildren(
    statePill('Visibility', article.visibilityState),
    statePill('Duplicate', article.duplicate.role),
    ...(article.manualCategoryOverride.active
      ? [statePill('Categories', 'manual')]
      : []),
  );
  elements.articleStateSummary.hidden = false;
  elements.articleOverview.replaceChildren(
    definition(
      'Source',
      `${article.source.displayName} (${article.source.configKey})`,
    ),
    definition('Article identity', article.articleId),
    definition('Source-derived headline', article.sourceDerivedDisplayTitle),
    definition('Effective headline', article.displayTitle),
    definition(
      'Display override',
      article.displayTitleOverride ?? 'None active',
    ),
    definitionLink(
      'Original publisher URL',
      article.originalUrl,
      article.originalUrl,
    ),
    definition('Canonical identity URL', article.canonicalIdentityUrl),
    definition('Visibility', humanize(article.visibilityState)),
    definition('Duplicate role', duplicateDescription(article.duplicate)),
    definition(
      'Automatic Categories',
      categoryNames(article.automaticCategories),
    ),
    definition(
      'Manual Categories',
      article.manualCategoryOverride.active
        ? categoryNames(article.manualCategoryOverride.categories) ||
            'Intentionally empty'
        : 'No manual override',
    ),
    definition(
      'Effective Categories',
      categoryNames(article.effectiveCategories) || 'None',
    ),
    definition(
      'Published at',
      `${dateTime(article.publishedAt)} (${article.publishedAtStatus})`,
    ),
    definition('First seen', dateTime(article.firstSeenAt)),
    definition('Last seen', dateTime(article.lastSeenAt)),
  );
  input(elements.articleDisplayForm, 'displayTitleOverride').value =
    article.displayTitleOverride ?? '';
  elements.articleHide.disabled = article.visibilityState !== 'visible';
  elements.articleRestore.disabled = article.visibilityState !== 'hidden';
  elements.articleDisplayClear.disabled = article.displayTitleOverride === null;
  renderArticleCategoryOptions(article);
  renderObservations(article.observations ?? []);
  renderHistory(article.history?.events ?? []);
}

function renderArticleCategoryOptions(article) {
  elements.articleCategoryOptions.replaceChildren();
  if (catalog.categories.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-inline';
    empty.textContent = 'No Categories are configured.';
    elements.articleCategoryOptions.append(empty);
    return;
  }
  const selected = new Set(
    article.manualCategoryOverride.categories.map(
      (category) => category.configKey,
    ),
  );
  for (const category of catalog.categories) {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = category.configKey;
    checkbox.checked =
      article.manualCategoryOverride.active && selected.has(category.configKey);
    label.append(checkbox, document.createTextNode(category.displayName));
    elements.articleCategoryOptions.append(label);
  }
}

async function changeArticleVisibility(action) {
  const article = state.selectedArticle;
  if (article === null) return;
  try {
    const result = await mutate(
      action === 'hide' ? elements.articleHide : elements.articleRestore,
      () =>
        api(
          `/admin/api/articles/${encodeURIComponent(article.articleId)}/visibility`,
          {
            method: 'PUT',
            body: { action, reason: null },
          },
        ),
    );
    await refreshAfterArticleMutation(article.articleId);
    setGlobalStatus(
      'ready',
      result.changed
        ? `Article ${action === 'hide' ? 'hidden' : 'restored'}.`
        : 'Article was already in that visibility state.',
    );
  } catch (error) {
    setGlobalStatus('error', messageForError(error));
  }
}

async function saveDisplayTitleOverride(event) {
  const article = state.selectedArticle;
  if (article === null) return;
  hideMessage(elements.articleDisplayError);
  const value = input(
    elements.articleDisplayForm,
    'displayTitleOverride',
  ).value;
  try {
    const result = await mutate(event.submitter, () =>
      api(
        `/admin/api/articles/${encodeURIComponent(article.articleId)}/display-title`,
        {
          method: 'PUT',
          body: { displayTitleOverride: value, reason: null },
        },
      ),
    );
    await refreshAfterArticleMutation(article.articleId);
    setGlobalStatus(
      'ready',
      result.changed
        ? 'Display-title override saved.'
        : 'Display-title override was unchanged.',
    );
  } catch (error) {
    showMessage(elements.articleDisplayError, messageForError(error), 'error');
    elements.articleDisplayError.focus();
    setGlobalStatus('error', 'Display-title override could not be saved.');
  }
}

async function clearDisplayTitleOverride() {
  const article = state.selectedArticle;
  if (article === null) return;
  hideMessage(elements.articleDisplayError);
  try {
    const result = await mutate(elements.articleDisplayClear, () =>
      api(
        `/admin/api/articles/${encodeURIComponent(article.articleId)}/display-title`,
        {
          method: 'DELETE',
          body: { reason: null },
        },
      ),
    );
    await refreshAfterArticleMutation(article.articleId);
    setGlobalStatus(
      'ready',
      result.changed
        ? 'Display-title override cleared; latest Source headline is active.'
        : 'No display-title override was active.',
    );
  } catch (error) {
    showMessage(elements.articleDisplayError, messageForError(error), 'error');
    elements.articleDisplayError.focus();
    setGlobalStatus('error', 'Display-title override could not be cleared.');
  }
}

async function saveCategoryOverride(event) {
  const article = state.selectedArticle;
  if (article === null) return;
  hideMessage(elements.articleCategoryError);
  const keys = Array.from(
    elements.articleCategoryOptions.querySelectorAll('input[type="checkbox"]'),
  )
    .filter((checkbox) => checkbox.checked)
    .map((checkbox) => checkbox.value);
  try {
    const result = await mutate(event.submitter, () =>
      api(
        `/admin/api/articles/${encodeURIComponent(article.articleId)}/categories`,
        {
          method: 'PUT',
          body: { categoryConfigKeys: keys, reason: null },
        },
      ),
    );
    await refreshAfterArticleMutation(article.articleId);
    setGlobalStatus(
      'ready',
      result.changed
        ? keys.length === 0
          ? 'Active empty manual Category set saved.'
          : 'Manual Category override saved.'
        : 'Manual Category override was unchanged.',
    );
  } catch (error) {
    showMessage(elements.articleCategoryError, messageForError(error), 'error');
    elements.articleCategoryError.focus();
    setGlobalStatus('error', 'Manual Category override could not be saved.');
  }
}

async function clearCategoryOverride() {
  const article = state.selectedArticle;
  if (article === null) return;
  hideMessage(elements.articleCategoryError);
  try {
    const result = await mutate(elements.articleCategoryClear, () =>
      api(
        `/admin/api/articles/${encodeURIComponent(article.articleId)}/categories`,
        {
          method: 'DELETE',
          body: { reason: null },
        },
      ),
    );
    await refreshAfterArticleMutation(article.articleId);
    setGlobalStatus(
      'ready',
      result.changed
        ? 'Manual Category override cleared; automatic Categories are active.'
        : 'No manual Category override was active.',
    );
  } catch (error) {
    showMessage(elements.articleCategoryError, messageForError(error), 'error');
    elements.articleCategoryError.focus();
    setGlobalStatus('error', 'Manual Category override could not be cleared.');
  }
}

async function refreshAfterArticleMutation(articleId) {
  await selectArticle(articleId, { focus: false });
  await loadArticleList();
}

function renderObservations(observations) {
  elements.articleObservations.replaceChildren();
  if (observations.length === 0) {
    elements.articleObservations.append(
      emptyItem('No retained observations were returned.'),
    );
    return;
  }
  for (const observation of observations) {
    const item = document.createElement('article');
    item.className = 'bounded-list-item';
    item.append(
      textParagraph(
        `${humanize(observation.processingOutcome)} · ${dateTime(observation.observedAt)}`,
        'evidence-meta',
      ),
      textParagraph(
        `Endpoint: ${observation.endpoint.configKey} · Run: ${observation.collectionRun.id}`,
      ),
      textParagraph(
        `Run status: ${humanize(observation.collectionRun.status)} · Relevance: ${observation.relevance.reasonCode ?? 'default include'}`,
      ),
      textParagraph(
        `Categories: ${categoryReasonSummary(observation.categoryReasons)}`,
      ),
    );
    elements.articleObservations.append(item);
  }
}

function renderHistory(events) {
  elements.articleHistory.replaceChildren();
  if (events.length === 0) {
    elements.articleHistory.append(
      emptyItem('No moderation changes recorded for this Article.'),
    );
    return;
  }
  for (const event of events) {
    const item = document.createElement('article');
    item.className = 'bounded-list-item';
    item.append(
      textParagraph(
        `${humanize(event.action)} · ${dateTime(event.occurredAt)}`,
        'evidence-meta',
      ),
      textParagraph(`Target: ${humanize(event.targetType)}`),
      ...(event.reason === null
        ? []
        : [textParagraph(`Reason: ${event.reason}`)]),
      ...(event.priorState === null
        ? []
        : [textParagraph(`Before: ${summarizeState(event.priorState)}`)]),
      ...(event.newState === null
        ? []
        : [textParagraph(`After: ${summarizeState(event.newState)}`)]),
    );
    elements.articleHistory.append(item);
  }
}

async function applyReviewFilters() {
  const form = elements.reviewFilterForm;
  state.reviewCriteria = {
    ...(input(form, 'state').value === ''
      ? {}
      : { state: input(form, 'state').value }),
    ...(input(form, 'confidence').value === ''
      ? {}
      : { confidence: input(form, 'confidence').value }),
  };
  state.selectedReviewId = null;
  state.selectedReview = null;
  renderReviewDetail();
  await loadReviewQueue();
}

async function loadReviewQueue({ append = false } = {}) {
  if (state.reviewListLoading) return;
  if (append && state.reviewCursor === null) return;
  state.reviewListLoading = true;
  const sequence = ++state.reviewRequestSequence;
  if (!append) {
    state.reviewCursor = null;
    state.reviews = [];
    setListState(
      elements.reviewListState,
      'loading',
      'Loading duplicate review queue…',
    );
    elements.reviewList.replaceChildren();
  }
  try {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(state.reviewCriteria))
      query.set(key, String(value));
    query.set('pageSize', '20');
    if (append && state.reviewCursor !== null)
      query.set('cursor', state.reviewCursor);
    const result = await api(
      `/admin/api/duplicate-reviews?${query.toString()}`,
    );
    if (sequence !== state.reviewRequestSequence) return;
    state.reviews = append
      ? [...state.reviews, ...(result.items ?? [])]
      : (result.items ?? []);
    state.reviewCursor = result.nextCursor ?? null;
    renderReviewQueue();
  } catch (error) {
    if (sequence === state.reviewRequestSequence) {
      state.reviewCursor = null;
      setListState(elements.reviewListState, 'error', messageForError(error));
      elements.reviewLoadMore.hidden = true;
      elements.reviewListState.focus();
    }
  } finally {
    if (sequence === state.reviewRequestSequence)
      state.reviewListLoading = false;
  }
}

function renderReviewQueue() {
  elements.reviewList.replaceChildren();
  if (state.reviews.length === 0) {
    setListState(
      elements.reviewListState,
      'empty',
      'No duplicate review candidates match this queue filter.',
    );
  } else {
    setListState(elements.reviewListState, 'ready', '');
    for (const review of state.reviews) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'selection-button';
      button.dataset.reviewId = review.candidateId;
      button.setAttribute(
        'aria-current',
        state.selectedReviewId === review.candidateId ? 'true' : 'false',
      );
      const title = document.createElement('span');
      title.className = 'selection-title';
      title.textContent = `${review.articleSummaries[0] ?? 'Article'} ↔ ${review.articleSummaries[1] ?? 'Article'}`;
      const meta = document.createElement('span');
      meta.className = 'review-meta';
      meta.textContent = `${humanize(review.state)} · confidence ${String(review.confidence)}${review.manuallySeparated ? ' · manually separated' : ''}`;
      button.append(title, meta);
      item.append(button);
      elements.reviewList.append(item);
    }
  }
  elements.reviewLoadMore.hidden = state.reviewCursor === null;
}

async function selectReview(candidateId, { focus = true } = {}) {
  if (typeof candidateId !== 'string' || candidateId.length === 0) return;
  state.selectedReviewId = candidateId;
  state.selectedReview = null;
  renderReviewQueue();
  elements.reviewDetailContent.hidden = true;
  elements.reviewDetailState.dataset.reviewDetailState = 'loading';
  elements.reviewDetailState.textContent = 'Loading review evidence…';
  elements.reviewDetailState.hidden = false;
  try {
    const result = await api(
      `/admin/api/duplicate-reviews/${encodeURIComponent(candidateId)}`,
    );
    if (state.selectedReviewId !== candidateId) return;
    state.selectedReview = result.review;
    state.mergeNeedsPrimary = false;
    renderReviewDetail();
    if (focus) elements.reviewDetailHeading.focus();
  } catch (error) {
    if (state.selectedReviewId === candidateId) {
      elements.reviewDetailState.dataset.reviewDetailState = 'error';
      elements.reviewDetailState.textContent = messageForError(error);
      elements.reviewDetailState.focus();
    }
  }
}

function renderReviewDetail() {
  const review = state.selectedReview;
  elements.reviewDetailContent.hidden = review === null;
  if (review === null) {
    elements.reviewDetailHeading.textContent = 'Select a review candidate';
    elements.reviewDetailHelp.textContent =
      'Select a candidate to compare both stored Articles and make an explicit decision.';
    elements.reviewDetailState.dataset.reviewDetailState = 'empty';
    elements.reviewDetailState.textContent = 'No review candidate selected.';
    elements.reviewDetailState.hidden = false;
    return;
  }
  elements.reviewDetailHeading.textContent = `Duplicate review · confidence ${String(review.confidence)}`;
  elements.reviewDetailHelp.textContent =
    review.state === 'pending'
      ? 'The evidence below is server-owned. Choose an explicit moderation action.'
      : `This candidate is ${humanize(review.state)}; evidence remains available for inspection.`;
  elements.reviewDetailState.hidden = true;
  hideMessage(elements.reviewConflictMessage);
  if (review.automaticMergeBlockedByManualPrimaryConflict) {
    showMessage(
      elements.reviewConflictMessage,
      'Two manually selected Primaries conflict. Choose an explicit Primary before merging these groups.',
      'error',
    );
  } else if (review.automaticGroupingBlockedByManualSeparation) {
    showMessage(
      elements.reviewConflictMessage,
      'A manual separation blocks automatic grouping. Merge is available only as an intentional operator decision.',
      'error',
    );
  }
  elements.reviewArticles.replaceChildren(
    ...review.articles.map((article) => renderDuplicateArticle(article)),
  );
  elements.reviewSignals.replaceChildren();
  if (review.signals.length === 0)
    elements.reviewSignals.append(emptyItem('No evidence signals returned.'));
  for (const signal of review.signals) {
    elements.reviewSignals.append(
      textParagraph(
        `#${String(signal.order)} · ${signal.reasonCode} · ${humanize(signal.strength)}`,
      ),
    );
  }
  renderReviewGroupActions();
  const actionable = review.state === 'pending';
  elements.reviewDismiss.disabled = !actionable;
  elements.reviewMerge.disabled = !actionable;
  elements.reviewSplit.disabled = false;
  elements.reviewPrimary.disabled = false;
}

function renderDuplicateArticle(article) {
  const card = document.createElement('article');
  card.className = 'duplicate-evidence-card';
  const heading = document.createElement('h3');
  heading.className = 'evidence-headline';
  heading.textContent = article.displayTitle;
  card.append(
    heading,
    textParagraph(
      `Source: ${article.source.displayName} (${article.source.configKey})`,
    ),
    definitionLink('Original URL', article.originalUrl, article.originalUrl),
    textParagraph(
      `Published: ${dateTime(article.publishedAt)} · First seen: ${dateTime(article.firstSeenAt)}`,
    ),
    textParagraph(
      `Visibility: ${humanize(article.visibilityState)} · Duplicate: ${duplicateDescription(article.duplicate)}`,
    ),
    textParagraph(`Article ID: ${article.articleId}`, 'evidence-meta'),
  );
  return card;
}

function renderReviewGroupActions() {
  const review = state.selectedReview;
  if (review === null) return;
  const groups = review.groups ?? [];
  elements.reviewGroupSelect.replaceChildren();
  if (groups.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No existing group';
    elements.reviewGroupSelect.append(option);
  } else {
    for (const group of groups) {
      const option = document.createElement('option');
      option.value = group.groupId;
      option.textContent = `${group.groupId} · ${String(group.memberCount)} members`;
      elements.reviewGroupSelect.append(option);
    }
  }
  const group =
    groups.find(
      (candidate) => candidate.groupId === elements.reviewGroupSelect.value,
    ) ?? groups[0];
  elements.reviewMergePrimary.replaceChildren();
  const none = document.createElement('option');
  none.value = '';
  none.textContent = 'Automatic / retain valid manual Primary';
  elements.reviewMergePrimary.append(none);
  for (const article of review.articles) {
    const option = document.createElement('option');
    option.value = article.articleId;
    option.textContent = `${article.displayTitle} · ${article.source.displayName}`;
    elements.reviewMergePrimary.append(option);
  }
  elements.reviewSplitMembers.replaceChildren();
  if (group === undefined) {
    elements.reviewSplitMembers.append(
      emptyItem('Select an existing group to split or choose a Primary.'),
    );
    return;
  }
  for (const member of group.members) {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = member.articleId;
    checkbox.dataset.splitMember = '';
    label.append(
      checkbox,
      document.createTextNode(
        `${member.displayTitle} · ${member.source.displayName}`,
      ),
    );
    elements.reviewSplitMembers.append(label);
  }
}

function reviewReason() {
  const value = input(elements.reviewActionForm, 'reason').value.trim();
  return value === '' ? null : value;
}

async function dismissReview() {
  const review = state.selectedReview;
  if (review === null) return;
  await runReviewCommand(
    elements.reviewDismiss,
    'Dismiss review candidate',
    () =>
      api(
        `/admin/api/duplicate-reviews/${encodeURIComponent(review.candidateId)}/dismiss`,
        {
          method: 'POST',
          body: { reason: reviewReason() },
        },
      ),
  );
}

async function mergeReview() {
  const review = state.selectedReview;
  if (review === null) return;
  const primaryArticleId = elements.reviewMergePrimary.value;
  await runReviewCommand(elements.reviewMerge, 'Duplicate merge', () =>
    api('/admin/api/duplicate-groups/merge', {
      method: 'POST',
      body: {
        articleIds: review.articles.map((article) => article.articleId),
        ...(primaryArticleId === '' ? {} : { primaryArticleId }),
        reason: reviewReason(),
      },
    }),
  );
}

async function splitReview() {
  const groupId = elements.reviewGroupSelect.value;
  const articleIds = Array.from(
    elements.reviewSplitMembers.querySelectorAll('[data-split-member]'),
  )
    .filter((checkbox) => checkbox.checked)
    .map((checkbox) => checkbox.value);
  if (groupId === '' || articleIds.length === 0) {
    showMessage(
      elements.reviewConflictMessage,
      'Select at least one current group member to split.',
      'error',
    );
    elements.reviewConflictMessage.focus();
    return;
  }
  await runReviewCommand(elements.reviewSplit, 'Duplicate split', () =>
    api(`/admin/api/duplicate-groups/${encodeURIComponent(groupId)}/split`, {
      method: 'POST',
      body: { articleIds, reason: reviewReason() },
    }),
  );
}

async function chooseReviewPrimary() {
  const groupId = elements.reviewGroupSelect.value;
  const articleId = elements.reviewMergePrimary.value;
  if (groupId === '' || articleId === '') {
    showMessage(
      elements.reviewConflictMessage,
      'Select a group and one of its members as the Primary.',
      'error',
    );
    elements.reviewConflictMessage.focus();
    return;
  }
  await runReviewCommand(elements.reviewPrimary, 'Primary selection', () =>
    api(`/admin/api/duplicate-groups/${encodeURIComponent(groupId)}/primary`, {
      method: 'POST',
      body: { articleId, reason: reviewReason() },
    }),
  );
}

async function runReviewCommand(control, label, operation) {
  try {
    setGlobalStatus('loading', `${label} in progress.`);
    const result = await mutate(control, operation);
    let successMessage = null;
    if (result.outcome === 'conflict') {
      state.mergeNeedsPrimary = true;
      showMessage(
        elements.reviewConflictMessage,
        'The current duplicate topology has a conflict. Choose an explicit Primary and retry the merge.',
        'error',
      );
      elements.reviewConflictMessage.focus();
      return;
    }
    if (result.outcome === 'not_found') {
      showMessage(
        elements.reviewConflictMessage,
        'This review or group changed before the action completed. Refreshing current evidence.',
        'error',
      );
      elements.reviewConflictMessage.focus();
    } else {
      successMessage =
        result.outcome === 'no_op'
          ? `${label} was already applied.`
          : `${label} saved.`;
    }
    await loadReviewQueue();
    if (state.selectedReviewId !== null)
      await selectReview(state.selectedReviewId, { focus: false });
    await loadArticleList();
    if (successMessage !== null) setGlobalStatus('ready', successMessage);
  } catch (error) {
    const message =
      error instanceof AdminRequestError && error.status === 409
        ? 'The duplicate topology changed while you were deciding. Choose an explicit Primary if needed, then retry.'
        : messageForError(error);
    showMessage(elements.reviewConflictMessage, message, 'error');
    elements.reviewConflictMessage.focus();
    setGlobalStatus('error', `${label} could not be completed.`);
    const currentReviewId = state.selectedReviewId;
    await loadReviewQueue();
    if (currentReviewId !== null)
      await selectReview(currentReviewId, { focus: false });
  }
}

function definition(label, value) {
  const fragment = document.createDocumentFragment();
  const term = document.createElement('dt');
  term.textContent = label;
  const description = document.createElement('dd');
  description.textContent = value;
  fragment.append(term, description);
  return fragment;
}

function definitionLink(label, value, href) {
  const fragment = document.createDocumentFragment();
  const term = document.createElement('dt');
  term.textContent = label;
  const description = document.createElement('dd');
  const link = document.createElement('a');
  link.href = href;
  link.textContent = value;
  link.target = '_blank';
  link.rel = 'noreferrer';
  description.append(link);
  fragment.append(term, description);
  return fragment;
}

function textParagraph(value, className = '') {
  const paragraph = document.createElement('p');
  paragraph.textContent = value;
  if (className !== '') paragraph.className = className;
  return paragraph;
}

function emptyItem(value) {
  const item = document.createElement('p');
  item.className = 'empty-inline';
  item.textContent = value;
  return item;
}

function categoryNames(categories) {
  return categories.map((category) => category.displayName).join(', ');
}

function categoryReasonSummary(reasons) {
  return reasons.length === 0
    ? 'none'
    : reasons
        .map(
          (reason) =>
            `${reason.category.displayName} (${humanize(reason.kind)})`,
        )
        .join(', ');
}

function duplicateDescription(duplicate) {
  if (duplicate.groupId === null) return 'Ungrouped';
  return `${humanize(duplicate.role)} in group ${duplicate.groupId}; Primary: ${duplicate.primaryArticleId ?? 'not available'} (${humanize(duplicate.primarySelectionOrigin ?? 'unknown')})`;
}

function summarizeState(value) {
  return Object.entries(value)
    .map(
      ([key, current]) =>
        `${humanize(key)}=${Array.isArray(current) ? current.join(', ') : String(current)}`,
    )
    .join('; ');
}

export function createModerationWorkspace() {
  elements.articleFilterForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void applyArticleFilters();
  });
  elements.articleFilterReset.addEventListener('click', () => {
    resetArticleFilters();
    void loadArticleList();
  });
  elements.articleLoadMore.addEventListener(
    'click',
    () => void loadArticleList({ append: true }),
  );
  elements.articleList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-article-id]');
    if (button instanceof HTMLButtonElement)
      void selectArticle(button.dataset.articleId);
  });
  elements.articleHide.addEventListener(
    'click',
    () => void changeArticleVisibility('hide'),
  );
  elements.articleRestore.addEventListener(
    'click',
    () => void changeArticleVisibility('restore'),
  );
  elements.articleDisplayForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void saveDisplayTitleOverride(event);
  });
  elements.articleDisplayClear.addEventListener(
    'click',
    () => void clearDisplayTitleOverride(),
  );
  elements.articleCategoryForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void saveCategoryOverride(event);
  });
  elements.articleCategoryClear.addEventListener(
    'click',
    () => void clearCategoryOverride(),
  );
  elements.reviewFilterForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void applyReviewFilters();
  });
  elements.reviewLoadMore.addEventListener(
    'click',
    () => void loadReviewQueue({ append: true }),
  );
  elements.reviewList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-review-id]');
    if (button instanceof HTMLButtonElement)
      void selectReview(button.dataset.reviewId);
  });
  elements.reviewDismiss.addEventListener('click', () => void dismissReview());
  elements.reviewMerge.addEventListener('click', () => void mergeReview());
  elements.reviewSplit.addEventListener('click', () => void splitReview());
  elements.reviewPrimary.addEventListener(
    'click',
    () => void chooseReviewPrimary(),
  );
  elements.reviewGroupSelect.addEventListener(
    'change',
    renderReviewGroupActions,
  );
  return { activate: loadArticlesWorkspace, refresh: loadArticlesWorkspace };
}
