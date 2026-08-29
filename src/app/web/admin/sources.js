/* global document, HTMLElement, HTMLButtonElement, HTMLInputElement, HTMLSelectElement */
import {
  api,
  mutate,
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
  actionButton,
  actionLabel,
  stateLine,
  operationLabel,
} from './core.js';
import { catalog } from './catalog.js';

const state = {
  selectedSource: null,
  endpoints: [],
  selectedEndpoint: null,
  sourceMode: 'none',
  endpointMode: 'none',
  previewInFlight: false,
  sourceSelectionSequence: 0,
  endpointSelectionSequence: 0,
  previewSequence: 0,
};
const elements = {
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
  admissionIncludePhrases: required('[data-admission-include-phrases]'),
  admissionExcludePhrases: required('[data-admission-exclude-phrases]'),
  sourceSubmit: required('[data-source-submit]'),
  newSource: required('[data-new-source]'),
  sourceCancel: required('[data-source-cancel]'),
  addSourceDomain: required('[data-add-source-domain]'),
  addAdmissionIncludePhrase: required('[data-add-admission-include-phrase]'),
  addAdmissionExcludePhrase: required('[data-add-admission-exclude-phrase]'),
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
  endpointSubmit: required('[data-endpoint-submit]'),
  endpointCancel: required('[data-endpoint-cancel]'),
  addEndpointDomain: required('[data-add-endpoint-domain]'),
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
  refreshOperational: required('[data-refresh-operational]'),
  checkNowResult: required('[data-check-now-result]'),
  checkNow: required('[data-check-now]'),
  newEndpoint: required('[data-new-endpoint]'),
};

function populateCategorySelects() {
  for (const select of document.querySelectorAll('[data-category-select]')) {
    const current = select.value;
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = 'No default Category';
    select.replaceChildren(empty);
    for (const category of catalog.categories) {
      const option = document.createElement('option');
      option.value = category.configKey;
      option.textContent = category.displayName;
      select.append(option);
    }
    if (current !== '') select.value = current;
  }
}
function mergeSource(source) {
  const sources = [...catalog.sources];
  const index = sources.findIndex(
    (candidate) => candidate.configKey === source.configKey,
  );
  if (index === -1) sources.push(source);
  else sources[index] = source;
  sources.sort((left, right) => left.configKey.localeCompare(right.configKey));
  catalog.replace({ sources });
}
function mergeEndpoint(endpoint) {
  const index = state.endpoints.findIndex(
    (candidate) => candidate.configKey === endpoint.configKey,
  );
  if (index === -1) state.endpoints.push(endpoint);
  else state.endpoints[index] = endpoint;
  state.endpoints.sort((left, right) =>
    left.configKey.localeCompare(right.configKey),
  );
}
function sourceByKey(key) {
  return catalog.sources.find((source) => source.configKey === key);
}
async function refreshSources(preferredSourceKey) {
  setGlobalStatus('loading', 'Loading Sources…');
  setListState(elements.sourceListState, 'loading', 'Loading Sources…');
  try {
    const [categoriesResult, sourcesResult] = await Promise.all([
      api('/admin/api/categories'),
      api('/admin/api/sources'),
    ]);
    catalog.replace({
      categories: categoriesResult.categories ?? [],
      sources: sourcesResult.sources ?? [],
    });
    populateCategorySelects();
    renderSourceList();
    setGlobalStatus('ready', 'Sources workspace is ready.');
    const key =
      preferredSourceKey ??
      state.selectedSource?.configKey ??
      catalog.sources[0]?.configKey;
    if (key !== undefined && sourceByKey(key) !== undefined) {
      await selectSource(key);
    } else {
      state.selectedSource = null;
      state.endpoints = [];
      state.selectedEndpoint = null;
      showNoSource();
    }
  } catch (error) {
    setGlobalStatus('error', messageForError(error));
    setListState(
      elements.sourceListState,
      'error',
      'Sources could not be loaded. Use Refresh all to try again.',
    );
    elements.sourceList.replaceChildren();
    showNoSource();
  }
}

function renderSourceList() {
  elements.sourceList.replaceChildren();
  if (catalog.sources.length === 0) {
    setListState(
      elements.sourceListState,
      'empty',
      'No Sources are configured. Create the first Source to begin.',
    );
    return;
  }
  setListState(elements.sourceListState, 'ready', '');
  for (const source of catalog.sources) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'selection-button';
    button.dataset.sourceKey = source.configKey;
    button.setAttribute(
      'aria-current',
      state.selectedSource?.configKey === source.configKey ? 'true' : 'false',
    );
    const name = document.createElement('span');
    name.className = 'selection-title';
    name.textContent = source.displayName;
    const key = document.createElement('span');
    key.className = 'selection-key';
    key.textContent = source.configKey;
    const states = stateLine(source);
    button.append(name, key, states);
    item.append(button);
    elements.sourceList.append(item);
  }
}

async function selectSource(sourceKey) {
  if (typeof sourceKey !== 'string' || sourceKey.length === 0) return;
  const selectionSequence = ++state.sourceSelectionSequence;
  state.endpointSelectionSequence += 1;
  resetHtmlPreview();
  setGlobalStatus('loading', `Loading Source ${sourceKey}…`);
  elements.endpointSection.hidden = false;
  setListState(elements.endpointListState, 'loading', 'Loading endpoints…');
  try {
    const [sourceResult, endpointResult] = await Promise.all([
      api(`/admin/api/sources/${encodeURIComponent(sourceKey)}`),
      api(`/admin/api/sources/${encodeURIComponent(sourceKey)}/endpoints`),
    ]);
    if (selectionSequence !== state.sourceSelectionSequence) return;
    state.selectedSource = sourceResult.source;
    state.endpoints = endpointResult.endpoints ?? [];
    state.sourceMode = 'edit';
    state.selectedEndpoint = null;
    state.endpointMode = 'none';
    mergeSource(state.selectedSource);
    renderSourceList();
    renderSourceEditor();
    renderEndpointList();
    showNoEndpoint();
    setGlobalStatus('ready', `${state.selectedSource.displayName} selected.`);
  } catch (error) {
    if (selectionSequence !== state.sourceSelectionSequence) return;
    setGlobalStatus('error', messageForError(error));
    setListState(
      elements.endpointListState,
      'error',
      'Endpoints could not be loaded.',
    );
  }
}

function beginSourceCreate() {
  state.sourceSelectionSequence += 1;
  state.sourceMode = 'create';
  state.selectedEndpoint = null;
  state.endpointMode = 'none';
  elements.sourceForm.reset();
  input(elements.sourceForm, 'priority').value = '0';
  input(elements.sourceForm, 'approvalState').value = 'unapproved';
  input(elements.sourceForm, 'operationalState').value = 'disabled';
  elements.sourceDomains.replaceChildren();
  addDomainRow(elements.sourceDomains);
  renderPhraseRows(elements.admissionIncludePhrases, [], 'Include');
  renderPhraseRows(elements.admissionExcludePhrases, [], 'Exclude');
  elements.sourceEditorHeading.textContent = 'Create Source';
  elements.sourceEditorHelp.textContent =
    'Create an operator-approved publisher record. No endpoint is discovered or created automatically.';
  elements.sourceForm.hidden = false;
  elements.sourceCreateState.hidden = false;
  elements.sourceStateSummary.hidden = true;
  elements.sourceStateActions.hidden = true;
  input(elements.sourceForm, 'configKey').disabled = false;
  elements.sourceSubmit.textContent = 'Create Source';
  hideMessage(elements.sourceFormError);
  elements.endpointSection.hidden = true;
  elements.operationalPanel.hidden = true;
  input(elements.sourceForm, 'configKey').focus();
}

function cancelSourceEdit() {
  if (state.selectedSource !== null) {
    state.sourceMode = 'edit';
    renderSourceEditor();
    elements.endpointSection.hidden = false;
  } else {
    state.sourceMode = 'none';
    showNoSource();
  }
}

function renderSourceEditor() {
  const source = state.selectedSource;
  if (source === null) {
    showNoSource();
    return;
  }
  state.sourceMode = 'edit';
  elements.sourceEditorHeading.textContent = source.displayName;
  elements.sourceEditorHelp.textContent =
    'Edit Source-owned configuration below. Approval, lifecycle, and operational state remain separate controls.';
  elements.sourceForm.hidden = false;
  elements.sourceCreateState.hidden = true;
  elements.sourceStateSummary.hidden = false;
  elements.sourceStateActions.hidden = false;
  elements.sourceStateSummary.replaceChildren(stateLine(source));
  const form = elements.sourceForm;
  input(form, 'configKey').value = source.configKey;
  input(form, 'configKey').disabled = true;
  input(form, 'displayName').value = source.displayName;
  input(form, 'siteUrl').value = source.siteUrl;
  input(form, 'priority').value = String(source.priority);
  input(form, 'defaultCategoryConfigKey').value =
    source.defaultCategory?.configKey ?? '';
  renderDomainRows(elements.sourceDomains, source.approvedDomains);
  renderPhraseRows(
    elements.admissionIncludePhrases,
    source.rssAtomAdmissionIncludePhrases,
    'Include',
  );
  renderPhraseRows(
    elements.admissionExcludePhrases,
    source.rssAtomAdmissionExcludePhrases,
    'Exclude',
  );
  elements.sourceSubmit.textContent = 'Save Source configuration';
  hideMessage(elements.sourceFormError);
  renderSourceStateActions();
}

function showNoSource() {
  state.sourceMode = 'none';
  elements.sourceEditorHeading.textContent = 'Select a Source';
  elements.sourceEditorHelp.textContent =
    'Choose a Source from the list or create a new approved publisher configuration.';
  elements.sourceForm.hidden = true;
  elements.sourceStateSummary.hidden = true;
  elements.sourceStateActions.hidden = true;
  elements.endpointSection.hidden = true;
  elements.operationalPanel.hidden = true;
}

async function submitSource(event) {
  const submitter = event.submitter;
  const form = elements.sourceForm;
  hideMessage(elements.sourceFormError);
  const configuration = {
    displayName: input(form, 'displayName').value,
    siteUrl: input(form, 'siteUrl').value,
    approvedDomains: readDomainRows(elements.sourceDomains),
    priority: Number(input(form, 'priority').value),
    defaultCategoryConfigKey:
      input(form, 'defaultCategoryConfigKey').value || null,
    rssAtomAdmissionIncludePhrases: readPhraseRows(
      elements.admissionIncludePhrases,
    ),
    rssAtomAdmissionExcludePhrases: readPhraseRows(
      elements.admissionExcludePhrases,
    ),
  };
  const creating = state.sourceMode === 'create';
  const body = creating
    ? {
        configKey: input(form, 'configKey').value,
        ...configuration,
        approvalState: input(form, 'approvalState').value,
        operationalState: input(form, 'operationalState').value,
      }
    : configuration;
  const sourceKey = creating ? '' : (state.selectedSource?.configKey ?? '');
  const selectionSequence = state.sourceSelectionSequence;
  const path = creating
    ? '/admin/api/sources'
    : `/admin/api/sources/${encodeURIComponent(sourceKey)}/configuration`;
  try {
    const result = await mutate(submitter, () =>
      api(path, { method: creating ? 'POST' : 'PUT', body }),
    );
    const saved = result.source;
    if (!creating && selectionSequence !== state.sourceSelectionSequence)
      return;
    state.selectedSource = saved;
    state.sourceMode = 'edit';
    mergeSource(saved);
    await refreshSources(saved.configKey);
    setGlobalStatus(
      'ready',
      creating ? 'Source created.' : 'Source configuration saved.',
    );
  } catch (error) {
    showMessage(elements.sourceFormError, messageForError(error), 'error');
  }
}

function renderSourceStateActions() {
  const source = state.selectedSource;
  if (source === null) return;
  elements.sourceApprovalActions.replaceChildren(
    actionLabel('Approval'),
    actionButton(
      source.approvalState === 'approved'
        ? 'Unapprove Source'
        : 'Approve Source',
      () =>
        mutateSourceState('approval', {
          approvalState:
            source.approvalState === 'approved' ? 'unapproved' : 'approved',
        }),
    ),
  );
  elements.sourceOperationalActions.replaceChildren(
    actionLabel('Collection operation'),
    ...['enabled', 'paused', 'disabled'].map((value) =>
      actionButton(
        operationLabel(value, 'Source'),
        () =>
          mutateSourceState('operational-state', { operationalState: value }),
        source.lifecycleState === 'archived' ||
          source.operationalState === value,
      ),
    ),
  );
  elements.sourceLifecycleActions.replaceChildren(
    actionLabel('Lifecycle'),
    actionButton(
      source.lifecycleState === 'archived'
        ? 'Restore Source'
        : 'Archive Source',
      () =>
        mutateSourceState('lifecycle', {
          lifecycleState:
            source.lifecycleState === 'archived' ? 'active' : 'archived',
        }),
      false,
      source.lifecycleState === 'archived' ? 'secondary' : 'danger',
    ),
  );
}

async function mutateSourceState(action, body) {
  const source = state.selectedSource;
  if (source === null) return;
  try {
    const result = await mutate(document.activeElement, () =>
      api(
        `/admin/api/sources/${encodeURIComponent(source.configKey)}/${action}`,
        { method: 'PUT', body },
      ),
    );
    state.selectedSource = result.source;
    mergeSource(result.source);
    renderSourceList();
    renderSourceEditor();
    if (result.source.lifecycleState === 'archived') {
      state.selectedEndpoint = null;
      state.endpointMode = 'none';
      showNoEndpoint();
    } else if (state.selectedEndpoint !== null) {
      await selectEndpoint(state.selectedEndpoint.configKey);
    }
    elements.newEndpoint.disabled = result.source.lifecycleState === 'archived';
    setGlobalStatus(
      'ready',
      result.source.lifecycleState === 'active' &&
        source.lifecycleState === 'archived'
        ? 'Source restored. It remains disabled until explicitly enabled.'
        : 'Source state updated.',
    );
  } catch (error) {
    setGlobalStatus('error', messageForError(error));
  }
}

function renderEndpointList() {
  elements.endpointList.replaceChildren();
  elements.newEndpoint.disabled =
    state.selectedSource?.lifecycleState === 'archived';
  if (state.endpoints.length === 0) {
    setListState(
      elements.endpointListState,
      'empty',
      'No endpoints are configured for this Source.',
    );
    return;
  }
  setListState(elements.endpointListState, 'ready', '');
  for (const endpoint of state.endpoints) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'selection-button endpoint-button';
    button.dataset.endpointKey = endpoint.configKey;
    button.setAttribute(
      'aria-current',
      state.selectedEndpoint?.configKey === endpoint.configKey
        ? 'true'
        : 'false',
    );
    const name = document.createElement('span');
    name.className = 'selection-title';
    name.textContent = endpoint.configKey;
    const url = document.createElement('span');
    url.className = 'selection-key';
    url.textContent = endpoint.endpointUrl;
    button.append(name, url, stateLine(endpoint));
    item.append(button);
    elements.endpointList.append(item);
  }
}

async function selectEndpoint(endpointKey) {
  const source = state.selectedSource;
  if (
    source === null ||
    typeof endpointKey !== 'string' ||
    endpointKey.length === 0
  )
    return;
  const selectionSequence = ++state.endpointSelectionSequence;
  resetHtmlPreview();
  setGlobalStatus('loading', `Loading endpoint ${endpointKey}…`);
  try {
    const result = await api(
      `/admin/api/sources/${encodeURIComponent(source.configKey)}/endpoints/${encodeURIComponent(endpointKey)}`,
    );
    if (selectionSequence !== state.endpointSelectionSequence) return;
    state.selectedEndpoint = result.endpoint;
    state.endpointMode = 'edit';
    mergeEndpoint(result.endpoint);
    renderEndpointList();
    renderEndpointEditor();
    await loadOperationalData();
    setGlobalStatus('ready', `Endpoint ${endpointKey} selected.`);
  } catch (error) {
    setGlobalStatus('error', messageForError(error));
  }
}

function beginEndpointCreate() {
  const source = state.selectedSource;
  if (source === null || source.lifecycleState === 'archived') return;
  state.endpointSelectionSequence += 1;
  resetHtmlPreview();
  state.selectedEndpoint = null;
  state.endpointMode = 'create';
  elements.endpointForm.reset();
  input(elements.endpointForm, 'endpointType').value = 'rss_atom';
  input(elements.endpointForm, 'pollIntervalSeconds').value = '900';
  input(elements.endpointForm, 'approvalState').value = 'unapproved';
  input(elements.endpointForm, 'operationalState').value = 'disabled';
  radio(elements.endpointForm, 'domainPolicyMode', 'inherit').checked = true;
  elements.endpointDomains.replaceChildren();
  clearHtmlProfileFields();
  elements.endpointEditorHeading.textContent = 'Create endpoint';
  elements.endpointEditorHelp.textContent =
    'Create an RSS/Atom endpoint beneath the selected Source. Saving configuration does not contact the publisher.';
  elements.endpointForm.hidden = false;
  elements.endpointCreateState.hidden = false;
  elements.endpointStateSummary.hidden = true;
  elements.endpointStateActions.hidden = true;
  input(elements.endpointForm, 'configKey').disabled = false;
  elements.endpointSubmit.textContent = 'Create endpoint';
  hideMessage(elements.endpointFormError);
  elements.operationalPanel.hidden = true;
  renderEndpointDomainMode();
  renderHtmlProfileVisibility();
  input(elements.endpointForm, 'configKey').focus();
}

function cancelEndpointEdit() {
  state.endpointSelectionSequence += 1;
  resetHtmlPreview();
  if (state.selectedEndpoint !== null) {
    state.endpointMode = 'edit';
    renderEndpointEditor();
    elements.operationalPanel.hidden = false;
  } else {
    state.endpointMode = 'none';
    showNoEndpoint();
  }
}

function renderEndpointEditor() {
  const endpoint = state.selectedEndpoint;
  const source = state.selectedSource;
  if (endpoint === null || source === null) {
    showNoEndpoint();
    return;
  }
  state.endpointMode = 'edit';
  elements.endpointEditorHeading.textContent = endpoint.configKey;
  elements.endpointEditorHelp.textContent =
    source.lifecycleState === 'archived'
      ? 'This Source is archived. Endpoint configuration remains visible but cannot be treated as active until the Source is restored.'
      : 'Edit endpoint configuration below. State, health, and lifecycle remain separate.';
  elements.endpointForm.hidden = false;
  elements.endpointCreateState.hidden = true;
  elements.endpointStateSummary.hidden = false;
  elements.endpointStateSummary.replaceChildren(stateLine(endpoint));
  elements.endpointStateActions.hidden = false;
  const form = elements.endpointForm;
  input(form, 'configKey').value = endpoint.configKey;
  input(form, 'configKey').disabled = true;
  input(form, 'endpointUrl').value = endpoint.endpointUrl;
  input(form, 'endpointType').value = endpoint.endpointType;
  input(form, 'pollIntervalSeconds').value = String(
    endpoint.pollIntervalSeconds,
  );
  input(form, 'defaultCategoryConfigKey').value =
    endpoint.defaultCategory?.configKey ?? '';
  const policy = endpoint.inheritsSourceDomainPolicy ? 'inherit' : 'narrow';
  radio(form, 'domainPolicyMode', policy).checked = true;
  renderDomainRows(elements.endpointDomains, endpoint.endpointDomainRules);
  renderHtmlProfileFields(endpoint.htmlListingProfile);
  renderHtmlProfileVisibility();
  renderEndpointProfileRevision(endpoint);
  renderEndpointDomainMode();
  elements.endpointSubmit.textContent = 'Save endpoint configuration';
  elements.endpointSubmit.disabled = source.lifecycleState === 'archived';
  hideMessage(elements.endpointFormError);
  renderEndpointStateActions();
  elements.operationalPanel.hidden = false;
}

function showNoEndpoint() {
  state.selectedEndpoint = null;
  resetHtmlPreview();
  elements.endpointEditorHeading.textContent = 'Select an endpoint';
  elements.endpointEditorHelp.textContent =
    'Select an endpoint to edit its configuration and operational state.';
  elements.endpointForm.hidden = true;
  elements.endpointStateSummary.hidden = true;
  elements.endpointStateActions.hidden = true;
  elements.operationalPanel.hidden = true;
  elements.htmlProfile.hidden = true;
  elements.htmlPreviewPanel.hidden = true;
  renderEndpointProfileRevision(null);
}

async function submitEndpoint(event) {
  const source = state.selectedSource;
  if (source === null) return;
  const submitter = event.submitter;
  const form = elements.endpointForm;
  hideMessage(elements.endpointFormError);
  const inherited = radio(form, 'domainPolicyMode', 'inherit').checked;
  const configuration = {
    endpointUrl: input(form, 'endpointUrl').value,
    endpointType: input(form, 'endpointType').value,
    pollIntervalSeconds: Number(input(form, 'pollIntervalSeconds').value),
    endpointDomainRules: inherited
      ? []
      : readDomainRows(elements.endpointDomains),
    defaultCategoryConfigKey:
      input(form, 'defaultCategoryConfigKey').value || null,
    ...(input(form, 'endpointType').value === 'html_listing'
      ? { htmlListingProfile: readHtmlListingProfile() }
      : {}),
  };
  const creating = state.endpointMode === 'create';
  const body = creating
    ? {
        configKey: input(form, 'configKey').value,
        ...configuration,
        approvalState: input(form, 'approvalState').value,
        operationalState: input(form, 'operationalState').value,
      }
    : configuration;
  const base = `/admin/api/sources/${encodeURIComponent(source.configKey)}/endpoints`;
  const path = creating
    ? base
    : `${base}/${encodeURIComponent(state.selectedEndpoint?.configKey ?? '')}/configuration`;
  try {
    setGlobalStatus('loading', 'Saving endpoint configurationâ€¦');
    const result = await mutate(submitter, () =>
      api(path, { method: creating ? 'POST' : 'PUT', body }),
    );
    state.selectedEndpoint = result.endpoint;
    state.endpointMode = 'edit';
    mergeEndpoint(result.endpoint);
    await refreshEndpoints(result.endpoint.configKey);
    setGlobalStatus(
      'ready',
      creating ? 'Endpoint created.' : 'Endpoint configuration saved.',
    );
    renderEndpointProfileRevision(result.endpoint);
    renderHtmlProfileVisibility();
  } catch (error) {
    showMessage(elements.endpointFormError, messageForError(error), 'error');
  }
}

function renderEndpointStateActions() {
  const endpoint = state.selectedEndpoint;
  const source = state.selectedSource;
  if (endpoint === null || source === null) return;
  const sourceArchived = source.lifecycleState === 'archived';
  elements.endpointApprovalActions.replaceChildren(
    actionLabel('Approval'),
    actionButton(
      endpoint.approvalState === 'approved'
        ? 'Unapprove endpoint'
        : 'Approve endpoint',
      () =>
        mutateEndpointState('approval', {
          approvalState:
            endpoint.approvalState === 'approved' ? 'unapproved' : 'approved',
        }),
      sourceArchived,
    ),
  );
  elements.endpointOperationalActions.replaceChildren(
    actionLabel('Collection operation'),
    ...['enabled', 'paused', 'disabled'].map((value) =>
      actionButton(
        operationLabel(value, 'endpoint'),
        () =>
          mutateEndpointState('operational-state', {
            operationalState: value,
          }),
        sourceArchived ||
          endpoint.lifecycleState === 'archived' ||
          endpoint.operationalState === value,
      ),
    ),
  );
  elements.endpointLifecycleActions.replaceChildren(
    actionLabel('Lifecycle'),
    actionButton(
      endpoint.lifecycleState === 'archived'
        ? 'Restore endpoint'
        : 'Archive endpoint',
      () =>
        mutateEndpointState('lifecycle', {
          lifecycleState:
            endpoint.lifecycleState === 'archived' ? 'active' : 'archived',
        }),
      sourceArchived,
      endpoint.lifecycleState === 'archived' ? 'secondary' : 'danger',
    ),
  );
}

async function mutateEndpointState(action, body) {
  const source = state.selectedSource;
  const endpoint = state.selectedEndpoint;
  if (source === null || endpoint === null) return;
  try {
    const result = await mutate(document.activeElement, () =>
      api(
        `/admin/api/sources/${encodeURIComponent(source.configKey)}/endpoints/${encodeURIComponent(endpoint.configKey)}/${action}`,
        { method: 'PUT', body },
      ),
    );
    const previousLifecycle = endpoint.lifecycleState;
    state.selectedEndpoint = result.endpoint;
    mergeEndpoint(result.endpoint);
    renderEndpointList();
    renderEndpointEditor();
    await loadOperationalData();
    setGlobalStatus(
      'ready',
      result.endpoint.lifecycleState === 'active' &&
        previousLifecycle === 'archived'
        ? 'Endpoint restored. It remains disabled until explicitly enabled.'
        : 'Endpoint state updated.',
    );
  } catch (error) {
    setGlobalStatus('error', messageForError(error));
  }
}

async function refreshEndpoints(preferredEndpointKey) {
  const source = state.selectedSource;
  if (source === null) return;
  const result = await api(
    `/admin/api/sources/${encodeURIComponent(source.configKey)}/endpoints`,
  );
  state.endpoints = result.endpoints ?? [];
  renderEndpointList();
  if (preferredEndpointKey !== undefined) {
    await selectEndpoint(preferredEndpointKey);
  } else {
    showNoEndpoint();
  }
}

async function loadOperationalData() {
  const source = state.selectedSource;
  const endpoint = state.selectedEndpoint;
  if (source === null || endpoint === null) return;
  elements.operationalPanel.hidden = false;
  elements.operationalState.dataset.operationalState = 'loading';
  elements.operationalState.textContent = 'Loading operational data…';
  elements.healthGrid.replaceChildren();
  elements.runsList.replaceChildren();
  try {
    const base = `/admin/api/sources/${encodeURIComponent(source.configKey)}/endpoints/${encodeURIComponent(endpoint.configKey)}`;
    const [healthResult, runsResult] = await Promise.all([
      api(`${base}/health`),
      api(`${base}/runs`),
    ]);
    renderHealth(healthResult.health);
    renderRuns(runsResult.runs ?? []);
    elements.operationalState.dataset.operationalState = 'ready';
    elements.operationalState.textContent = 'Operational data updated.';
  } catch (error) {
    elements.operationalState.dataset.operationalState = 'error';
    elements.operationalState.textContent = messageForError(error);
  }
}

function renderHealth(health) {
  const values = [
    ['Derived health', humanize(health.derivedHealth)],
    [
      'Publication collection',
      health.publicationActiveForCollection ? 'Active' : 'Inactive',
    ],
    ['Last attempt', dateTime(health.lastAttemptAt)],
    ['Last success', dateTime(health.lastSuccessAt)],
    ['Last failure', dateTime(health.lastFailureAt)],
    ['Next due', dateTime(health.nextDueAt)],
    ['Cooldown until', dateTime(health.cooldownUntil)],
    ['Consecutive failures', String(health.consecutiveFailureCount)],
    ['Poll interval', `${health.pollIntervalSeconds} seconds`],
  ];
  elements.healthGrid.replaceChildren(
    ...values.flatMap(([term, value]) => {
      const dt = document.createElement('dt');
      dt.textContent = term;
      const dd = document.createElement('dd');
      dd.textContent = value;
      return [dt, dd];
    }),
  );
}

function renderRuns(runs) {
  elements.runsList.replaceChildren();
  if (runs.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No Collection runs are recorded for this endpoint.';
    elements.runsList.append(empty);
    return;
  }
  for (const run of runs) {
    const article = document.createElement('article');
    article.className = 'run-card';
    const heading = document.createElement('h4');
    heading.textContent = `${humanize(run.triggerKind)} · ${humanize(run.runStatus)}`;
    const timing = document.createElement('p');
    timing.className = 'run-timing';
    timing.textContent = `${dateTime(run.startedAt)} → ${dateTime(run.finishedAt)}`;
    const stages = document.createElement('dl');
    stages.className = 'run-grid';
    const stageValues = [
      ['Transport', run.transportStatus],
      ['Parser', run.parserStatus],
      ['Normalization', run.normalizationStatus],
      ['Processing', run.processingStatus],
      ['Raw items', run.rawItemCount],
      ['Source-filtered', run.sourceItemFilteredCount],
      ['Normalized', run.normalizedCandidateCount],
      ['Normalization failures', run.normalizationFailureCount],
      ['Link rejections', run.articleLinkRejectionCount],
      ['Created', run.createdCount],
      ['Updated', run.updatedCount],
      ['Unchanged', run.unchangedCount],
      ['Rejected', run.rejectedCount],
      ['Excluded', run.excludedCount],
      ['Failed', run.failedCount],
    ];
    stages.replaceChildren(
      ...stageValues.flatMap(([term, value]) => {
        const dt = document.createElement('dt');
        dt.textContent = term;
        const dd = document.createElement('dd');
        dd.textContent = humanize(String(value));
        return [dt, dd];
      }),
    );
    article.append(heading, timing, stages);
    if (run.outcomeCode !== null || run.retryClassification !== null) {
      const outcome = document.createElement('p');
      outcome.className = 'run-outcome';
      outcome.textContent = `Outcome: ${humanize(run.outcomeCode ?? 'none')} · Retry: ${humanize(run.retryClassification ?? 'none')}`;
      article.append(outcome);
    }
    if (run.errorCode !== null || run.errorDetail !== null) {
      const error = document.createElement('p');
      error.className = 'run-error';
      error.textContent = `Failure: ${run.errorCode ?? 'unspecified'}${run.errorDetail === null ? '' : ` — ${run.errorDetail}`}`;
      article.append(error);
    }
    if (
      run.parserKind !== null ||
      run.parserVersion !== null ||
      run.htmlListingProfileRevision !== null ||
      run.parserItemFailureCount > 0 ||
      run.parserDiagnosticCode !== null ||
      run.parserDiagnosticDetail !== null
    ) {
      const diagnostics = document.createElement('dl');
      diagnostics.className = 'run-parser-diagnostics';
      const values = [
        ['Parser adapter', run.parserKind],
        ['Parser version', run.parserVersion],
        ['Profile revision used', run.htmlListingProfileRevision],
        ['Item/extraction failures', run.parserItemFailureCount],
        ['Parser diagnostic code', run.parserDiagnosticCode],
        ['Parser diagnostic detail', run.parserDiagnosticDetail],
      ];
      diagnostics.replaceChildren(
        ...values.flatMap(([term, value]) => {
          const dt = document.createElement('dt');
          dt.textContent = term;
          const dd = document.createElement('dd');
          dd.textContent = value === null ? 'Not available' : String(value);
          return [dt, dd];
        }),
      );
      article.append(diagnostics);
    }
    elements.runsList.append(article);
  }
}

function renderEndpointProfileRevision(endpoint) {
  const revision = endpoint?.htmlListingProfileRevision;
  const isHtml = endpoint?.endpointType === 'html_listing';
  elements.endpointProfileRevision.hidden =
    !isHtml || !Number.isSafeInteger(revision) || revision < 1;
  elements.endpointProfileRevision.textContent = elements
    .endpointProfileRevision.hidden
    ? ''
    : `Persisted HTML profile revision: ${revision}`;
}

function renderHtmlProfileVisibility() {
  const isHtml =
    input(elements.endpointForm, 'endpointType').value === 'html_listing';
  elements.htmlProfile.hidden = !isHtml;
  elements.htmlPreviewPanel.hidden = !isHtml;
  for (const control of elements.htmlProfile.querySelectorAll(
    '[data-html-required]',
  )) {
    if (control instanceof HTMLInputElement) control.required = isHtml;
  }
  renderHtmlDateAttributeVisibility();
  if (!isHtml) {
    elements.htmlPreviewStatus.hidden = true;
    elements.htmlPreviewResults.replaceChildren();
  }
}

function renderHtmlDateAttributeVisibility() {
  for (const field of ['publishedAt', 'updatedAt']) {
    const mode = input(
      elements.endpointForm,
      `html${field[0].toUpperCase()}${field.slice(1)}Mode`,
    ).value;
    const attribute = elements.htmlProfile.querySelector(
      `[data-html-date-attribute="${field}"]`,
    );
    if (attribute instanceof HTMLElement)
      attribute.hidden = mode !== 'attribute';
  }
}

function clearHtmlProfileFields() {
  const names = [
    'htmlItemSelector',
    'htmlTitleSelector',
    'htmlArticleLinkSelector',
    'htmlPublishedAtSelector',
    'htmlUpdatedAtSelector',
    'htmlAuthorSelector',
    'htmlSummarySelector',
    'htmlCategoriesSelector',
  ];
  for (const name of names) input(elements.endpointForm, name).value = '';
  input(elements.endpointForm, 'htmlPublishedAtMode').value = 'text';
  input(elements.endpointForm, 'htmlUpdatedAtMode').value = 'text';
  input(elements.endpointForm, 'htmlPublishedAtAttribute').value = 'datetime';
  input(elements.endpointForm, 'htmlUpdatedAtAttribute').value = 'datetime';
  renderHtmlDateAttributeVisibility();
  renderEndpointProfileRevision(null);
}

function renderHtmlProfileFields(profile) {
  clearHtmlProfileFields();
  if (profile === null || typeof profile !== 'object') return;
  const value = profile;
  input(elements.endpointForm, 'htmlItemSelector').value =
    value.itemSelector ?? '';
  input(elements.endpointForm, 'htmlTitleSelector').value =
    value.title?.selector ?? '';
  input(elements.endpointForm, 'htmlArticleLinkSelector').value =
    value.articleLink?.selector ?? '';
  for (const field of ['publishedAt', 'updatedAt']) {
    const descriptor = value[field];
    if (descriptor === undefined) continue;
    input(
      elements.endpointForm,
      `html${field[0].toUpperCase()}${field.slice(1)}Selector`,
    ).value = descriptor.selector ?? '';
    input(
      elements.endpointForm,
      `html${field[0].toUpperCase()}${field.slice(1)}Mode`,
    ).value = descriptor.mode ?? 'text';
    if (descriptor.mode === 'attribute') {
      input(
        elements.endpointForm,
        `html${field[0].toUpperCase()}${field.slice(1)}Attribute`,
      ).value = descriptor.attribute ?? 'datetime';
    }
  }
  input(elements.endpointForm, 'htmlAuthorSelector').value =
    profile.author?.selector ?? '';
  input(elements.endpointForm, 'htmlSummarySelector').value =
    profile.summary?.selector ?? '';
  input(elements.endpointForm, 'htmlCategoriesSelector').value =
    profile.categories?.selector ?? '';
  renderHtmlDateAttributeVisibility();
}

function readHtmlListingProfile() {
  const descriptor = (name) => {
    const selector = input(elements.endpointForm, name).value.trim();
    return selector === '' ? undefined : { selector };
  };
  const dateDescriptor = (field) => {
    const prefix = `html${field[0].toUpperCase()}${field.slice(1)}`;
    const selector = input(
      elements.endpointForm,
      `${prefix}Selector`,
    ).value.trim();
    if (selector === '') return undefined;
    const mode = input(elements.endpointForm, `${prefix}Mode`).value;
    return mode === 'attribute'
      ? {
          selector,
          mode,
          attribute: input(elements.endpointForm, `${prefix}Attribute`).value,
        }
      : { selector, mode: 'text' };
  };
  return {
    itemSelector: input(elements.endpointForm, 'htmlItemSelector').value,
    title: descriptor('htmlTitleSelector'),
    articleLink: descriptor('htmlArticleLinkSelector'),
    ...(dateDescriptor('publishedAt') === undefined
      ? {}
      : { publishedAt: dateDescriptor('publishedAt') }),
    ...(dateDescriptor('updatedAt') === undefined
      ? {}
      : { updatedAt: dateDescriptor('updatedAt') }),
    ...(descriptor('htmlAuthorSelector') === undefined
      ? {}
      : { author: descriptor('htmlAuthorSelector') }),
    ...(descriptor('htmlSummarySelector') === undefined
      ? {}
      : { summary: descriptor('htmlSummarySelector') }),
    ...(descriptor('htmlCategoriesSelector') === undefined
      ? {}
      : { categories: descriptor('htmlCategoriesSelector') }),
  };
}

async function previewHtmlSample() {
  if (
    state.previewInFlight ||
    input(elements.endpointForm, 'endpointType').value !== 'html_listing'
  )
    return;
  const requestSequence = ++state.previewSequence;
  const endpointSelectionSequence = state.endpointSelectionSequence;
  state.previewInFlight = true;
  elements.htmlPreview.disabled = true;
  elements.htmlPreviewStatus.setAttribute('role', 'status');
  showMessage(
    elements.htmlPreviewStatus,
    'Parsing the pasted sample…',
    'loading',
  );
  elements.htmlPreviewResults.replaceChildren();
  try {
    const result = await api('/admin/api/html-listing/preview', {
      method: 'POST',
      body: {
        html: elements.htmlPreviewSample.value,
        profile: readHtmlListingProfile(),
      },
    });
    if (
      requestSequence !== state.previewSequence ||
      endpointSelectionSequence !== state.endpointSelectionSequence
    )
      return;
    renderPreviewResult(result.preview);
    showMessage(elements.htmlPreviewStatus, 'Preview completed.', 'success');
  } catch (error) {
    if (
      requestSequence !== state.previewSequence ||
      endpointSelectionSequence !== state.endpointSelectionSequence
    )
      return;
    elements.htmlPreviewStatus.setAttribute('role', 'alert');
    showMessage(
      elements.htmlPreviewStatus,
      `Preview failed: ${messageForError(error)}`,
      'error',
    );
    elements.htmlPreviewResults.replaceChildren();
  } finally {
    if (requestSequence === state.previewSequence) {
      state.previewInFlight = false;
      elements.htmlPreview.disabled = false;
    }
  }
}

function renderPreviewResult(preview) {
  elements.htmlPreviewResults.replaceChildren();
  const rows = Array.isArray(preview?.rows) ? preview.rows : [];
  if (rows.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'The sample produced no preview rows.';
    elements.htmlPreviewResults.append(empty);
  } else {
    for (const row of rows) {
      const card = document.createElement('article');
      card.className = 'html-preview-row';
      const title = document.createElement('h4');
      title.textContent =
        typeof row.title === 'string' ? row.title : 'Untitled row';
      const url = document.createElement('p');
      url.className = 'preview-url';
      url.textContent = `Article link: ${typeof row.url === 'string' ? row.url : 'Not available'}`;
      card.append(title, url);
      const values = [
        ['Published', row.publishedAtRaw],
        ['Updated', row.updatedAtRaw],
        ['Author', row.author],
        ['Summary', row.summary],
        [
          'Categories',
          Array.isArray(row.categories) ? row.categories.join(', ') : undefined,
        ],
      ];
      const details = document.createElement('dl');
      details.className = 'preview-row-details';
      details.replaceChildren(
        ...values.flatMap(([term, value]) => {
          if (value === undefined || value === null || value === '') return [];
          const dt = document.createElement('dt');
          dt.textContent = term;
          const dd = document.createElement('dd');
          dd.textContent = String(value);
          return [dt, dd];
        }),
      );
      if (details.children.length > 0) card.append(details);
      elements.htmlPreviewResults.append(card);
    }
  }
  renderPreviewDiagnostics(preview?.diagnostics);
}

function renderPreviewDiagnostics(diagnostics) {
  if (
    diagnostics === null ||
    typeof diagnostics !== 'object' ||
    ((diagnostics.rejectedItemCount ?? 0) === 0 &&
      (diagnostics.malformedOptionalFieldCount ?? 0) === 0 &&
      (!Array.isArray(diagnostics.samples) || diagnostics.samples.length === 0))
  )
    return;
  const heading = document.createElement('h4');
  heading.textContent = 'Parser diagnostics';
  const list = document.createElement('ul');
  list.className = 'bounded-list';
  const summary = document.createElement('li');
  summary.textContent = `Rejected items: ${Number(diagnostics.rejectedItemCount) || 0}; malformed optional fields: ${Number(diagnostics.malformedOptionalFieldCount) || 0}`;
  list.append(summary);
  for (const sample of Array.isArray(diagnostics.samples)
    ? diagnostics.samples
    : []) {
    if (typeof sample !== 'object' || sample === null) continue;
    const item = document.createElement('li');
    item.textContent = `${String(sample.code ?? 'diagnostic')}: ${String(sample.detail ?? 'No detail')}`;
    list.append(item);
  }
  elements.htmlPreviewResults.append(heading, list);
}

function resetHtmlPreview() {
  state.previewSequence += 1;
  state.previewInFlight = false;
  elements.htmlPreview.disabled = false;
  elements.htmlPreviewSample.value = '';
  hideMessage(elements.htmlPreviewStatus);
  elements.htmlPreviewResults.replaceChildren();
}

async function checkNow() {
  const source = state.selectedSource;
  const endpoint = state.selectedEndpoint;
  if (source === null || endpoint === null) return;
  hideMessage(elements.checkNowResult);
  try {
    const result = await mutate(elements.checkNow, () =>
      api(
        `/admin/api/sources/${encodeURIComponent(source.configKey)}/endpoints/${encodeURIComponent(endpoint.configKey)}/check-now`,
        { method: 'POST', body: {} },
      ),
    );
    const message =
      result.disposition === 'already_outstanding'
        ? `A ${humanize(result.job.triggerKind)} job is already ${humanize(result.job.status)}. No duplicate job was created.`
        : 'Check queued for the Worker. Collection has not necessarily completed; refresh operational data to see later results.';
    showMessage(elements.checkNowResult, message, 'success');
  } catch (error) {
    showMessage(elements.checkNowResult, messageForError(error), 'error');
  }
}

function renderDomainRows(container, rules) {
  container.replaceChildren();
  for (const rule of rules) addDomainRow(container, rule);
}

function addDomainRow(
  container,
  rule = { hostname: '', includeSubdomains: false },
) {
  const row = document.createElement('div');
  row.className = 'repeatable-row domain-row';
  const label = document.createElement('label');
  label.textContent = 'Hostname';
  const hostname = document.createElement('input');
  hostname.type = 'text';
  hostname.value = rule.hostname;
  hostname.autocomplete = 'off';
  hostname.dataset.domainHostname = '';
  label.append(hostname);
  const subdomainsLabel = document.createElement('label');
  subdomainsLabel.className = 'choice-row compact-choice';
  const subdomains = document.createElement('input');
  subdomains.type = 'checkbox';
  subdomains.checked = rule.includeSubdomains === true;
  subdomains.dataset.domainSubdomains = '';
  subdomainsLabel.append(
    subdomains,
    document.createTextNode('Include subdomains'),
  );
  const remove = actionButton(
    'Remove domain',
    () => row.remove(),
    false,
    'quiet',
  );
  remove.classList.add('compact');
  row.append(label, subdomainsLabel, remove);
  container.append(row);
}

function readDomainRows(container) {
  return Array.from(container.querySelectorAll('.domain-row'), (row) => ({
    hostname: requiredWithin(row, '[data-domain-hostname]').value,
    includeSubdomains: requiredWithin(row, '[data-domain-subdomains]').checked,
  }));
}

function renderPhraseRows(container, phrases, side) {
  container.replaceChildren();
  for (const phrase of phrases) addPhraseRow(container, phrase, side);
  renderPhraseEmptyState(container, side);
}

function addPhraseRow(container, value, side) {
  const empty = container.querySelector('[data-phrase-empty]');
  empty?.remove();
  const row = document.createElement('div');
  row.className = 'repeatable-row phrase-row';
  const label = document.createElement('label');
  label.textContent = `${side} phrase`;
  const phrase = document.createElement('input');
  phrase.type = 'text';
  phrase.value = value;
  phrase.maxLength = 512;
  phrase.autocomplete = 'off';
  phrase.dataset.admissionPhrase = '';
  label.append(phrase);
  const remove = actionButton(
    'Remove phrase',
    () => {
      row.remove();
      renderPhraseEmptyState(container, side);
    },
    false,
    'quiet',
  );
  remove.classList.add('compact');
  row.append(label, remove);
  container.append(row);
}

function renderPhraseEmptyState(container, side) {
  if (container.querySelector('.phrase-row') !== null) return;
  const empty = document.createElement('p');
  empty.className = 'empty-inline';
  empty.dataset.phraseEmpty = '';
  empty.textContent =
    side === 'Include'
      ? 'All RSS/Atom items pass Include: no phrases are configured.'
      : 'No RSS/Atom items are excluded by phrase.';
  container.append(empty);
}

function readPhraseRows(container) {
  return Array.from(
    container.querySelectorAll('[data-admission-phrase]'),
    (entry) => entry.value,
  );
}

function renderEndpointDomainMode() {
  const inherited = radio(
    elements.endpointForm,
    'domainPolicyMode',
    'inherit',
  ).checked;
  elements.endpointDomainEditor.hidden = inherited;
  if (!inherited && elements.endpointDomains.children.length === 0) {
    addDomainRow(elements.endpointDomains);
  }
}

function wireSources() {
  elements.newSource.addEventListener('click', beginSourceCreate);
  elements.sourceCancel.addEventListener('click', cancelSourceEdit);
  elements.addSourceDomain.addEventListener('click', () =>
    addDomainRow(elements.sourceDomains),
  );
  elements.addAdmissionIncludePhrase.addEventListener('click', () =>
    addPhraseRow(elements.admissionIncludePhrases, '', 'Include'),
  );
  elements.addAdmissionExcludePhrase.addEventListener('click', () =>
    addPhraseRow(elements.admissionExcludePhrases, '', 'Exclude'),
  );
  elements.sourceForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitSource(event);
  });
  elements.sourceList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-source-key]');
    if (button instanceof HTMLButtonElement)
      void selectSource(button.dataset.sourceKey);
  });
  elements.newEndpoint.addEventListener('click', beginEndpointCreate);
  elements.endpointCancel.addEventListener('click', cancelEndpointEdit);
  elements.addEndpointDomain.addEventListener('click', () =>
    addDomainRow(elements.endpointDomains),
  );
  elements.endpointForm.addEventListener('change', (event) => {
    const target = event.target;
    if (
      target instanceof HTMLInputElement &&
      target.name === 'domainPolicyMode'
    )
      renderEndpointDomainMode();
    if (
      target instanceof HTMLSelectElement &&
      (target.name === 'endpointType' ||
        target.name === 'htmlPublishedAtMode' ||
        target.name === 'htmlUpdatedAtMode')
    ) {
      if (target.name === 'endpointType') renderHtmlProfileVisibility();
      else renderHtmlDateAttributeVisibility();
    }
  });
  elements.endpointForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitEndpoint(event);
  });
  elements.endpointList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-endpoint-key]');
    if (button instanceof HTMLButtonElement)
      void selectEndpoint(button.dataset.endpointKey);
  });
  elements.refreshOperational.addEventListener(
    'click',
    () => void loadOperationalData(),
  );
  elements.checkNow.addEventListener('click', () => void checkNow());
  elements.htmlPreview.addEventListener(
    'click',
    () => void previewHtmlSample(),
  );
}
export function createSourcesWorkspace() {
  wireSources();
  catalog.subscribe(() => {
    populateCategorySelects();
    renderSourceList();
  });
  return {
    activate: async () => {},
    refresh: refreshSources,
    selectSource,
    selectEndpoint,
    async navigate(sourceKey, endpointKey) {
      await refreshSources(sourceKey);
      if (endpointKey) await selectEndpoint(endpointKey);
    },
  };
}
