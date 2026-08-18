/* eslint-disable @typescript-eslint/no-unused-vars */
/* global document, HTMLElement, HTMLButtonElement, HTMLInputElement, HTMLSelectElement */
import {
  api,
  mutate,
  AdminRequestError,
  messageForError,
  required,
  requiredWithin,
  input,
  radio,
  setGlobalStatus,
  setListState,
  showMessage,
  hideMessage,
  humanize,
  dateTime,
  duration,
  actionButton,
  actionLabel,
  statePill,
  stateLine,
  operationLabel,
} from './core.js';
import { catalog } from './catalog.js';

const state = {
  relevanceRules: [],
  selectedCategory: null,
  selectedRule: null,
  categoryMode: 'none',
  ruleMode: 'none',
};
const elements = {
  status: required('[data-admin-status]'),
  workspaceTabs: Array.from(document.querySelectorAll('[data-workspace]')),
  workspacePanels: Array.from(
    document.querySelectorAll('[data-workspace-panel]'),
  ),
  operationsState: required('[data-operations-state]'),
  operationsContent: required('[data-operations-content]'),
  operationsSummary: required('[data-operations-summary]'),
  operationsHealthCounts: required('[data-operations-health-counts]'),
  operationsQueue: required('[data-operations-queue]'),
  operationsEndpoints: required('[data-operations-endpoints]'),
  operationsAlerts: required('[data-operations-alerts]'),
  operationsPolicy: required('[data-operations-policy]'),
  publicationState: required('[data-publication-state]'),
  publicationForm: required('[data-publication-form]'),
  publicationFormError: required('[data-publication-form-error]'),
  publicationSubmit: required('[data-publication-submit]'),
  timezoneHint: required('[data-timezone-hint]'),
  sourceList: required('[data-source-list]'),
  sourceListState: required('[data-source-list-state]'),
  sourceEditorHeading: required('[data-source-editor-heading]'),
  sourceEditorHelp: required('[data-source-editor-help]'),
  sourceForm: required('[data-source-form]'),
  sourceFormError: required('[data-source-form-error]'),
  sourceCreateState: required('[data-source-create-state]'),
  sourceStateSummary: required('[data-source-state-summary]'),
  sourceStateActions: required('[data-source-state-actions]'),
  sourceApprovalActions: required('[data-source-approval-actions]'),
  sourceOperationalActions: required('[data-source-operational-actions]'),
  sourceLifecycleActions: required('[data-source-lifecycle-actions]'),
  sourceDomains: required('[data-source-domains]'),
  admissionPhrases: required('[data-admission-phrases]'),
  endpointSection: required('[data-endpoint-section]'),
  endpointList: required('[data-endpoint-list]'),
  endpointListState: required('[data-endpoint-list-state]'),
  endpointEditorHeading: required('[data-endpoint-editor-heading]'),
  endpointEditorHelp: required('[data-endpoint-editor-help]'),
  endpointForm: required('[data-endpoint-form]'),
  endpointFormError: required('[data-endpoint-form-error]'),
  endpointCreateState: required('[data-endpoint-create-state]'),
  endpointStateSummary: required('[data-endpoint-state-summary]'),
  endpointStateActions: required('[data-endpoint-state-actions]'),
  endpointApprovalActions: required('[data-endpoint-approval-actions]'),
  endpointOperationalActions: required('[data-endpoint-operational-actions]'),
  endpointLifecycleActions: required('[data-endpoint-lifecycle-actions]'),
  endpointDomains: required('[data-endpoint-domains]'),
  endpointDomainEditor: required('[data-endpoint-domain-editor]'),
  htmlProfile: required('[data-html-profile]'),
  htmlPreviewPanel: required('[data-html-preview-panel]'),
  htmlPreviewSample: required('[data-html-preview-sample]'),
  htmlPreview: required('[data-html-preview]'),
  htmlPreviewStatus: required('[data-html-preview-status]'),
  htmlPreviewResults: required('[data-html-preview-results]'),
  endpointProfileRevision: required('[data-endpoint-profile-revision]'),
  operationalPanel: required('[data-operational-panel]'),
  operationalState: required('[data-operational-state]'),
  healthGrid: required('[data-health-grid]'),
  runsList: required('[data-runs-list]'),
  checkNowResult: required('[data-check-now-result]'),
  checkNow: required('[data-check-now]'),
  newEndpoint: required('[data-new-endpoint]'),
  categoryList: required('[data-category-list]'),
  categoryListState: required('[data-category-list-state]'),
  categoryForm: required('[data-category-form]'),
  categoryFormError: required('[data-category-form-error]'),
  categoryHeading: required('[data-category-editor-heading]'),
  categoryHelp: required('[data-category-editor-help]'),
  categoryDelete: required('[data-category-delete]'),
  ruleList: required('[data-rule-list]'),
  ruleListState: required('[data-rule-list-state]'),
  ruleForm: required('[data-rule-form]'),
  ruleFormError: required('[data-rule-form-error]'),
  ruleHeading: required('[data-rule-editor-heading]'),
  ruleHelp: required('[data-rule-editor-help]'),
  ruleEnabled: required('[data-rule-enabled]'),
  ruleDelete: required('[data-rule-delete]'),
  ruleSourceField: required('[data-rule-source-field]'),
  ruleCategoryField: required('[data-rule-category-field]'),
  articleFilterForm: required('[data-article-filter-form]'),
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
  reviewDismiss: required('[data-review-dismiss]'),
  reviewMerge: required('[data-review-merge]'),
  reviewGroupSelect: required('[data-review-group-select]'),
  reviewMergePrimary: required('[data-review-merge-primary]'),
  reviewSplitMembers: required('[data-review-split-members]'),
  reviewSplit: required('[data-review-split]'),
  reviewPrimary: required('[data-review-primary]'),
};

async function loadEditorial({ catalogReady = false } = {}) {
  setGlobalStatus('loading', 'Loading editorial configuration…');
  setListState(elements.categoryListState, 'loading', 'Loading Categories…');
  setListState(elements.ruleListState, 'loading', 'Loading Relevance rules…');
  try {
    const [rules] = await Promise.all([
      api('/admin/api/relevance-rules'),
      ...(catalogReady ? [] : [catalog.refresh()]),
    ]);
    state.relevanceRules = rules.relevanceRules ?? [];
    renderCategoryList();
    renderRuleList();
    renderCategoryEditor();
    renderRuleEditor();
    setGlobalStatus('ready', 'Editorial workspace is ready.');
  } catch (error) {
    setGlobalStatus('error', messageForError(error));
    setListState(
      elements.categoryListState,
      'error',
      'Categories could not be loaded.',
    );
    setListState(
      elements.ruleListState,
      'error',
      'Relevance rules could not be loaded.',
    );
  }
}
function renderCategoryList() {
  elements.categoryList.replaceChildren();
  setListState(
    elements.categoryListState,
    catalog.categories.length ? 'ready' : 'empty',
    catalog.categories.length ? '' : 'No Categories are configured.',
  );
  for (const category of catalog.categories) {
    const item = document.createElement('li'),
      button = document.createElement('button'),
      name = document.createElement('span'),
      key = document.createElement('span');
    button.type = 'button';
    button.className = 'selection-button';
    button.dataset.categoryKey = category.configKey;
    button.setAttribute(
      'aria-current',
      state.selectedCategory?.configKey === category.configKey
        ? 'true'
        : 'false',
    );
    name.className = 'selection-title';
    name.textContent = category.displayName;
    key.className = 'selection-key';
    key.textContent = category.configKey;
    button.append(name, key);
    item.append(button);
    elements.categoryList.append(item);
  }
}
async function selectCategory(key) {
  try {
    const result = await api(
      `/admin/api/categories/${encodeURIComponent(key)}`,
    );
    state.selectedCategory = result.category;
    state.categoryMode = 'edit';
    renderCategoryList();
    renderCategoryEditor();
  } catch (error) {
    setGlobalStatus('error', messageForError(error));
  }
}
function beginCategoryCreate() {
  state.categoryMode = 'create';
  state.selectedCategory = null;
  elements.categoryForm.reset();
  input(elements.categoryForm, 'configKey').disabled = false;
  elements.categoryHeading.textContent = 'Create Category';
  elements.categoryHelp.textContent =
    'Configuration keys are immutable after creation.';
  elements.categoryDelete.hidden = true;
  elements.categoryForm.hidden = false;
  hideMessage(elements.categoryFormError);
  input(elements.categoryForm, 'configKey').focus();
}
function renderCategoryEditor() {
  const category = state.selectedCategory;
  if (!category) {
    if (state.categoryMode !== 'create') {
      elements.categoryForm.hidden = true;
      elements.categoryHeading.textContent = 'Select a Category';
    }
    return;
  }
  state.categoryMode = 'edit';
  elements.categoryHeading.textContent = category.displayName;
  elements.categoryHelp.textContent =
    'Only the display name can change after creation.';
  input(elements.categoryForm, 'configKey').value = category.configKey;
  input(elements.categoryForm, 'configKey').disabled = true;
  input(elements.categoryForm, 'displayName').value = category.displayName;
  elements.categoryDelete.hidden = false;
  elements.categoryForm.hidden = false;
  hideMessage(elements.categoryFormError);
}
async function submitCategory(event) {
  const creating = state.categoryMode === 'create',
    form = elements.categoryForm,
    key = input(form, 'configKey').value;
  hideMessage(elements.categoryFormError);
  try {
    const result = await mutate(event.submitter, () =>
      api(
        creating
          ? '/admin/api/categories'
          : `/admin/api/categories/${encodeURIComponent(key)}`,
        {
          method: creating ? 'POST' : 'PUT',
          body: creating
            ? {
                configKey: key,
                displayName: input(form, 'displayName').value,
              }
            : { displayName: input(form, 'displayName').value },
        },
      ),
    );
    state.selectedCategory = result.category;
    state.categoryMode = 'edit';
    await loadEditorial();
    setGlobalStatus(
      'ready',
      creating ? 'Category created.' : 'Category saved.',
    );
  } catch (error) {
    showMessage(elements.categoryFormError, messageForError(error), 'error');
    elements.categoryFormError.focus();
  }
}
async function deleteCategory() {
  const category = state.selectedCategory;
  if (
    !category ||
    !globalThis.confirm(
      `Remove Category “${category.displayName}”? This cannot be undone.`,
    )
  )
    return;
  try {
    await mutate(elements.categoryDelete, () =>
      api(`/admin/api/categories/${encodeURIComponent(category.configKey)}`, {
        method: 'DELETE',
        body: {},
      }),
    );
    state.selectedCategory = null;
    state.categoryMode = 'none';
    await loadEditorial();
    setGlobalStatus('ready', 'Category removed.');
  } catch (error) {
    showMessage(elements.categoryFormError, messageForError(error), 'error');
    elements.categoryFormError.focus();
  }
}
function renderRuleList() {
  elements.ruleList.replaceChildren();
  setListState(
    elements.ruleListState,
    state.relevanceRules.length ? 'ready' : 'empty',
    state.relevanceRules.length ? '' : 'No Relevance rules are configured.',
  );
  for (const rule of state.relevanceRules) {
    const item = document.createElement('li'),
      button = document.createElement('button'),
      name = document.createElement('span'),
      key = document.createElement('span');
    button.type = 'button';
    button.className = 'selection-button';
    button.dataset.ruleKey = rule.configKey;
    button.setAttribute(
      'aria-current',
      state.selectedRule?.configKey === rule.configKey ? 'true' : 'false',
    );
    name.className = 'selection-title';
    name.textContent = `${humanize(rule.action)}: ${rule.reason}`;
    key.className = 'selection-key';
    key.textContent = rule.configKey;
    button.append(name, key);
    item.append(button);
    elements.ruleList.append(item);
  }
}
async function selectRule(key) {
  try {
    const result = await api(
      `/admin/api/relevance-rules/${encodeURIComponent(key)}`,
    );
    state.selectedRule = result.relevanceRule;
    state.ruleMode = 'edit';
    renderRuleList();
    renderRuleEditor();
  } catch (error) {
    setGlobalStatus('error', messageForError(error));
  }
}
function beginRuleCreate() {
  state.ruleMode = 'create';
  state.selectedRule = null;
  elements.ruleForm.reset();
  input(elements.ruleForm, 'configKey').disabled = false;
  input(elements.ruleForm, 'priority').value = '0';
  input(elements.ruleForm, 'scope').value = 'installation';
  input(elements.ruleForm, 'action').value = 'include';
  elements.ruleHeading.textContent = 'Create Relevance rule';
  elements.ruleDelete.hidden = true;
  elements.ruleEnabled.hidden = true;
  elements.ruleForm.hidden = false;
  hideMessage(elements.ruleFormError);
  renderRuleConditionals();
  input(elements.ruleForm, 'configKey').focus();
}
function renderRuleEditor() {
  const rule = state.selectedRule;
  if (!rule) {
    if (state.ruleMode !== 'create') {
      elements.ruleForm.hidden = true;
      elements.ruleHeading.textContent = 'Select a Relevance rule';
    }
    return;
  }
  const form = elements.ruleForm;
  state.ruleMode = 'edit';
  elements.ruleHeading.textContent = rule.configKey;
  input(form, 'configKey').value = rule.configKey;
  input(form, 'configKey').disabled = true;
  input(form, 'predicateType').value = rule.predicateType;
  input(form, 'pattern').value = rule.pattern;
  input(form, 'action').value = rule.action;
  input(form, 'priority').value = String(rule.priority);
  input(form, 'reason').value = rule.reason;
  input(form, 'scope').value = rule.sourceConfigKey ? 'source' : 'installation';
  input(form, 'sourceConfigKey').value = rule.sourceConfigKey ?? '';
  input(form, 'categoryConfigKey').value = rule.categoryConfigKey ?? '';
  elements.ruleEnabled.textContent = rule.enabled
    ? 'Disable rule'
    : 'Enable rule';
  elements.ruleEnabled.hidden = false;
  elements.ruleDelete.hidden = false;
  elements.ruleForm.hidden = false;
  hideMessage(elements.ruleFormError);
  renderRuleConditionals();
}
function renderRuleConditionals() {
  const form = elements.ruleForm,
    source = input(form, 'scope').value === 'source',
    categorize = input(form, 'action').value === 'categorize';
  elements.ruleSourceField.hidden = !source;
  elements.ruleCategoryField.hidden = !categorize;
  if (!source) input(form, 'sourceConfigKey').value = '';
  if (!categorize) input(form, 'categoryConfigKey').value = '';
  populateRuleChoices();
}
function populateRuleChoices() {
  for (const [selector, values, label] of [
    ['[data-rule-source-select]', catalog.sources, 'No Source'],
    ['[data-rule-category-select]', catalog.categories, 'No Category'],
  ]) {
    for (const select of document.querySelectorAll(selector)) {
      const current = select.value;
      select.replaceChildren();
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = label;
      select.append(empty);
      for (const value of values) {
        const option = document.createElement('option');
        option.value = value.configKey;
        option.textContent = value.displayName;
        select.append(option);
      }
      select.value = current;
    }
  }
}
function ruleBody() {
  const form = elements.ruleForm,
    source = input(form, 'scope').value === 'source',
    categorize = input(form, 'action').value === 'categorize';
  return {
    ...(state.ruleMode === 'create'
      ? { configKey: input(form, 'configKey').value }
      : {}),
    predicateType: input(form, 'predicateType').value,
    pattern: input(form, 'pattern').value,
    action: input(form, 'action').value,
    priority: Number(input(form, 'priority').value),
    reason: input(form, 'reason').value,
    sourceConfigKey: source ? input(form, 'sourceConfigKey').value : null,
    categoryConfigKey: categorize
      ? input(form, 'categoryConfigKey').value
      : null,
  };
}
async function submitRule(event) {
  const creating = state.ruleMode === 'create',
    key = input(elements.ruleForm, 'configKey').value;
  hideMessage(elements.ruleFormError);
  try {
    const result = await mutate(event.submitter, () =>
      api(
        creating
          ? '/admin/api/relevance-rules'
          : `/admin/api/relevance-rules/${encodeURIComponent(key)}/configuration`,
        { method: creating ? 'POST' : 'PUT', body: ruleBody() },
      ),
    );
    state.selectedRule = result.relevanceRule;
    state.ruleMode = 'edit';
    await loadEditorial();
    setGlobalStatus(
      'ready',
      creating ? 'Relevance rule created.' : 'Relevance rule saved.',
    );
  } catch (error) {
    showMessage(elements.ruleFormError, messageForError(error), 'error');
    elements.ruleFormError.focus();
  }
}
async function toggleRuleEnabled() {
  const rule = state.selectedRule;
  if (!rule) return;
  try {
    const result = await mutate(elements.ruleEnabled, () =>
      api(
        `/admin/api/relevance-rules/${encodeURIComponent(rule.configKey)}/enabled`,
        { method: 'PUT', body: { enabled: !rule.enabled } },
      ),
    );
    state.selectedRule = result.relevanceRule;
    renderRuleEditor();
    renderRuleList();
  } catch (error) {
    showMessage(elements.ruleFormError, messageForError(error), 'error');
  }
}
async function deleteRule() {
  const rule = state.selectedRule;
  if (
    !rule ||
    !globalThis.confirm(
      `Remove Relevance rule “${rule.configKey}”? This cannot be undone.`,
    )
  )
    return;
  try {
    await mutate(elements.ruleDelete, () =>
      api(`/admin/api/relevance-rules/${encodeURIComponent(rule.configKey)}`, {
        method: 'DELETE',
        body: {},
      }),
    );
    state.selectedRule = null;
    state.ruleMode = 'none';
    await loadEditorial();
    setGlobalStatus('ready', 'Relevance rule removed.');
  } catch (error) {
    showMessage(elements.ruleFormError, messageForError(error), 'error');
    elements.ruleFormError.focus();
  }
}

export function createEditorialWorkspace() {
  required('[data-new-category]').addEventListener(
    'click',
    beginCategoryCreate,
  );
  required('[data-category-cancel]').addEventListener(
    'click',
    renderCategoryEditor,
  );
  elements.categoryList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-category-key]');
    if (button instanceof HTMLButtonElement)
      void selectCategory(button.dataset.categoryKey);
  });
  elements.categoryForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitCategory(event);
  });
  elements.categoryDelete.addEventListener(
    'click',
    () => void deleteCategory(),
  );
  required('[data-new-rule]').addEventListener('click', beginRuleCreate);
  required('[data-rule-cancel]').addEventListener('click', renderRuleEditor);
  elements.ruleList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-rule-key]');
    if (button instanceof HTMLButtonElement)
      void selectRule(button.dataset.ruleKey);
  });
  elements.ruleForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitRule(event);
  });
  elements.ruleForm.addEventListener('change', renderRuleConditionals);
  elements.ruleEnabled.addEventListener(
    'click',
    () => void toggleRuleEnabled(),
  );
  elements.ruleDelete.addEventListener('click', () => void deleteRule());
  return { activate: loadEditorial, refresh: loadEditorial };
}
