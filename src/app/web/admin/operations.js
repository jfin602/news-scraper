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
  operationsSnapshot: null,
  operationsLoading: false,
  operationsRequestSequence: 0,
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

async function loadOperations() {
  if (state.operationsLoading) return;
  state.operationsLoading = true;
  const sequence = ++state.operationsRequestSequence;
  setOperationsState('loading', 'Loading current operational snapshot…');
  required('[data-refresh-operations]').disabled = true;
  try {
    const result = await api('/admin/api/operations/snapshot');
    if (sequence !== state.operationsRequestSequence) return;
    state.operationsSnapshot = result.snapshot;
    renderOperations();
    setOperationsState('ready', 'Operational snapshot updated.');
    setGlobalStatus('ready', 'Operations workspace is ready.');
  } catch (error) {
    if (sequence !== state.operationsRequestSequence) return;
    state.operationsSnapshot = null;
    elements.operationsContent.hidden = true;
    setOperationsState('error', messageForError(error));
    setGlobalStatus('error', messageForError(error));
  } finally {
    if (sequence === state.operationsRequestSequence) {
      state.operationsLoading = false;
      required('[data-refresh-operations]').disabled = false;
    }
  }
}

function setOperationsState(kind, message) {
  elements.operationsState.dataset.operationsState = kind;
  elements.operationsState.textContent = message;
  elements.operationsState.hidden = false;
}

function renderOperations() {
  const snapshot = state.operationsSnapshot;
  if (snapshot === null) return;
  elements.operationsContent.hidden = false;
  elements.operationsSummary.replaceChildren(
    statePill('Overall status', snapshot.status),
    textDetail(`Observed ${dateTime(snapshot.observedAt)}`),
  );
  renderFacts(elements.operationsHealthCounts, [
    ['Healthy', snapshot.endpointHealthCounts.healthy],
    ['Delayed', snapshot.endpointHealthCounts.delayed],
    ['Degraded', snapshot.endpointHealthCounts.degraded],
    ['Unhealthy', snapshot.endpointHealthCounts.unhealthy],
    ['Unknown', snapshot.endpointHealthCounts.unknown],
  ]);
  renderFacts(elements.operationsQueue, [
    ['Queued', snapshot.jobs.queuedCount],
    ['Ready now', snapshot.jobs.readyQueuedCount],
    ['Future scheduled', snapshot.jobs.futureQueuedCount],
    ['Running', snapshot.jobs.runningCount],
    ['Oldest ready delay', duration(snapshot.jobs.oldestReadyAgeMilliseconds)],
    ['Oldest ready queued', dateTime(snapshot.jobs.oldestReadyQueuedAt)],
    ['Expired running', snapshot.jobs.expiredRunningCount],
  ]);
  renderOperationsEndpoints(snapshot.actionableEndpoints ?? []);
  renderOperationsAlerts(snapshot.alerts ?? []);
  renderFacts(elements.operationsPolicy, [
    ['Global concurrency', snapshot.capacity.global],
    ['Per Source concurrency', snapshot.capacity.source],
    ['Per host concurrency', snapshot.capacity.host],
    [
      'Scheduler pass',
      duration(snapshot.workerTiming.schedulerPassIntervalMilliseconds),
    ],
    [
      'Idle queue poll',
      duration(snapshot.workerTiming.idleJobPollIntervalMilliseconds),
    ],
    [
      'Job lease duration',
      duration(snapshot.workerTiming.jobLeaseDurationMilliseconds),
    ],
    [
      'Lease renewal',
      duration(snapshot.workerTiming.leaseRenewalIntervalMilliseconds),
    ],
    [
      'Stale recovery pass',
      duration(snapshot.workerTiming.staleRecoveryPassIntervalMilliseconds),
    ],
    ['Stale recovery batch', snapshot.workerTiming.staleRecoveryBatchLimit],
    ['Local execution limit', snapshot.workerTiming.localExecutionLimit],
  ]);
}

function renderOperationsEndpoints(endpoints) {
  elements.operationsEndpoints.replaceChildren();
  if (endpoints.length === 0) {
    elements.operationsEndpoints.append(
      emptyInline('No delayed, degraded, or unhealthy eligible endpoints.'),
    );
    return;
  }
  for (const endpoint of endpoints) {
    const item = document.createElement('article');
    item.className = 'bounded-list-item';
    const heading = document.createElement('h4');
    heading.textContent = `${endpoint.sourceDisplayName} · ${endpoint.endpointConfigKey}`;
    const facts = document.createElement('dl');
    facts.className = 'operations-facts';
    renderFacts(facts, [
      ['Health', humanize(endpoint.health)],
      ['Last success', dateTime(endpoint.lastSuccessAt)],
      ['Last failure', dateTime(endpoint.lastFailureAt)],
      ['Next due', dateTime(endpoint.nextDueAt)],
      ['Cooldown', dateTime(endpoint.cooldownUntil)],
      ['Consecutive failures', endpoint.consecutiveFailureCount],
    ]);
    item.append(heading, facts, operationsEndpointButton(endpoint));
    elements.operationsEndpoints.append(item);
  }
}

function renderOperationsAlerts(alerts) {
  elements.operationsAlerts.replaceChildren();
  if (alerts.length === 0) {
    elements.operationsAlerts.append(
      emptyInline('No current operational alerts.'),
    );
    return;
  }
  for (const alert of alerts) {
    const item = document.createElement('article');
    item.className = 'bounded-list-item';
    const heading = document.createElement('p');
    heading.textContent = `${humanize(alert.severity)}: ${humanize(alert.code)}`;
    item.append(heading);
    if (alert.sourceConfigKey && alert.endpointConfigKey) {
      const target = document.createElement('p');
      target.className = 'selection-meta';
      target.textContent = `${alert.sourceConfigKey} · ${alert.endpointConfigKey}`;
      item.append(target, operationsEndpointButton(alert));
    }
    if (alert.jobId) {
      const job = document.createElement('p');
      job.className = 'selection-meta';
      job.textContent = `Job ${alert.jobId}`;
      item.append(job);
    }
    elements.operationsAlerts.append(item);
  }
}

function operationsEndpointButton(target) {
  const button = actionButton(
    'Open endpoint administration',
    () => {},
    false,
    'secondary',
  );
  button.dataset.operationsSourceKey = target.sourceConfigKey;
  button.dataset.operationsEndpointKey = target.endpointConfigKey;
  return button;
}

async function navigateToOperationsEndpoint(sourceKey, endpointKey) {
  if (
    typeof sourceKey !== 'string' ||
    sourceKey.length === 0 ||
    typeof endpointKey !== 'string' ||
    endpointKey.length === 0
  )
    return;
  await onNavigate(sourceKey, endpointKey);
}

function renderFacts(container, values) {
  container.replaceChildren(
    ...values.flatMap(([term, value]) => {
      const dt = document.createElement('dt');
      dt.textContent = term;
      const dd = document.createElement('dd');
      dd.textContent = String(value);
      return [dt, dd];
    }),
  );
}

function textDetail(text) {
  const detail = document.createElement('span');
  detail.className = 'selection-meta';
  detail.textContent = text;
  return detail;
}

function emptyInline(message) {
  const empty = document.createElement('p');
  empty.className = 'empty-inline';
  empty.textContent = message;
  return empty;
}

let onNavigate = async () => {};
export function createOperationsWorkspace({ navigate }) {
  onNavigate = navigate;
  required('[data-refresh-operations]').addEventListener(
    'click',
    () => void loadOperations(),
  );
  for (const container of [
    elements.operationsEndpoints,
    elements.operationsAlerts,
  ])
    container.addEventListener('click', (event) => {
      const button = event.target.closest('[data-operations-source-key]');
      if (button instanceof HTMLButtonElement)
        void navigateToOperationsEndpoint(
          button.dataset.operationsSourceKey,
          button.dataset.operationsEndpointKey,
        );
    });
  return { activate: loadOperations, refresh: loadOperations };
}
