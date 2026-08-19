/* global document, HTMLButtonElement */
import {
  api,
  messageForError,
  required,
  setGlobalStatus,
  humanize,
  dateTime,
  duration,
  actionButton,
  statePill,
} from './core.js';

const state = {
  operationsSnapshot: null,
  operationsLoading: false,
  operationsRequestSequence: 0,
};
const elements = {
  operationsState: required('[data-operations-state]'),
  operationsContent: required('[data-operations-content]'),
  operationsSummary: required('[data-operations-summary]'),
  operationsHealthCounts: required('[data-operations-health-counts]'),
  operationsQueue: required('[data-operations-queue]'),
  operationsEndpoints: required('[data-operations-endpoints]'),
  operationsAlerts: required('[data-operations-alerts]'),
  operationsPolicy: required('[data-operations-policy]'),
  refreshOperations: required('[data-refresh-operations]'),
};

async function loadOperations() {
  if (state.operationsLoading) return;
  state.operationsLoading = true;
  const sequence = ++state.operationsRequestSequence;
  setOperationsState('loading', 'Loading current operational snapshot…');
  elements.refreshOperations.disabled = true;
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
      elements.refreshOperations.disabled = false;
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
  elements.refreshOperations.addEventListener(
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
