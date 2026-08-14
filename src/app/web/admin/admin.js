/* global document, fetch, HTMLElement, HTMLButtonElement, HTMLInputElement, HTMLSelectElement */

(() => {
  'use strict';

  const mutationHeader = 'X-News-Scraper-Admin-Request';
  const state = {
    categories: [],
    sources: [],
    selectedSource: null,
    endpoints: [],
    selectedEndpoint: null,
    sourceMode: 'none',
    endpointMode: 'none',
    mutationInFlight: false,
  };

  const elements = {
    status: required('[data-admin-status]'),
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
    operationalPanel: required('[data-operational-panel]'),
    operationalState: required('[data-operational-state]'),
    healthGrid: required('[data-health-grid]'),
    runsList: required('[data-runs-list]'),
    checkNowResult: required('[data-check-now-result]'),
    checkNow: required('[data-check-now]'),
    newEndpoint: required('[data-new-endpoint]'),
  };

  wireEvents();
  void loadAdministration();

  function wireEvents() {
    required('[data-refresh-all]').addEventListener('click', () => {
      void loadAdministration(state.selectedSource?.configKey);
    });
    required('[data-new-source]').addEventListener('click', beginSourceCreate);
    required('[data-source-cancel]').addEventListener(
      'click',
      cancelSourceEdit,
    );
    required('[data-add-source-domain]').addEventListener('click', () => {
      addDomainRow(elements.sourceDomains);
    });
    required('[data-add-admission-phrase]').addEventListener('click', () => {
      addPhraseRow('');
    });
    elements.sourceForm.addEventListener('submit', (event) => {
      event.preventDefault();
      void submitSource(event);
    });
    elements.sourceList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-source-key]');
      if (button instanceof HTMLButtonElement) {
        void selectSource(button.dataset.sourceKey);
      }
    });

    elements.newEndpoint.addEventListener('click', beginEndpointCreate);
    required('[data-endpoint-cancel]').addEventListener(
      'click',
      cancelEndpointEdit,
    );
    required('[data-add-endpoint-domain]').addEventListener('click', () => {
      addDomainRow(elements.endpointDomains);
    });
    elements.endpointForm.addEventListener('change', (event) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement &&
        target.name === 'domainPolicyMode'
      ) {
        renderEndpointDomainMode();
      }
    });
    elements.endpointForm.addEventListener('submit', (event) => {
      event.preventDefault();
      void submitEndpoint(event);
    });
    elements.endpointList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-endpoint-key]');
      if (button instanceof HTMLButtonElement) {
        void selectEndpoint(button.dataset.endpointKey);
      }
    });
    required('[data-refresh-operational]').addEventListener('click', () => {
      void loadOperationalData();
    });
    elements.checkNow.addEventListener('click', () => {
      void checkNow();
    });
  }

  async function loadAdministration(preferredSourceKey) {
    setGlobalStatus('loading', 'Loading Source administration…');
    setListState(elements.sourceListState, 'loading', 'Loading Sources…');
    try {
      const [categoriesResult, sourcesResult] = await Promise.all([
        api('/api/admin/categories'),
        api('/api/admin/sources'),
      ]);
      state.categories = categoriesResult.categories ?? [];
      state.sources = sourcesResult.sources ?? [];
      populateCategorySelects();
      renderSourceList();
      setGlobalStatus('ready', 'Source administration is ready.');
      const key =
        preferredSourceKey ??
        state.selectedSource?.configKey ??
        state.sources[0]?.configKey;
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
    if (state.sources.length === 0) {
      setListState(
        elements.sourceListState,
        'empty',
        'No Sources are configured. Create the first Source to begin.',
      );
      return;
    }
    setListState(elements.sourceListState, 'ready', '');
    for (const source of state.sources) {
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
    setGlobalStatus('loading', `Loading Source ${sourceKey}…`);
    elements.endpointSection.hidden = false;
    setListState(elements.endpointListState, 'loading', 'Loading endpoints…');
    try {
      const [sourceResult, endpointResult] = await Promise.all([
        api(`/api/admin/sources/${encodeURIComponent(sourceKey)}`),
        api(`/api/admin/sources/${encodeURIComponent(sourceKey)}/endpoints`),
      ]);
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
      setGlobalStatus('error', messageForError(error));
      setListState(
        elements.endpointListState,
        'error',
        'Endpoints could not be loaded.',
      );
    }
  }

  function beginSourceCreate() {
    state.sourceMode = 'create';
    state.selectedEndpoint = null;
    state.endpointMode = 'none';
    elements.sourceForm.reset();
    input(elements.sourceForm, 'priority').value = '0';
    input(elements.sourceForm, 'approvalState').value = 'unapproved';
    input(elements.sourceForm, 'operationalState').value = 'disabled';
    elements.sourceDomains.replaceChildren();
    addDomainRow(elements.sourceDomains);
    elements.admissionPhrases.replaceChildren();
    renderPhraseEmptyState();
    elements.sourceEditorHeading.textContent = 'Create Source';
    elements.sourceEditorHelp.textContent =
      'Create an operator-approved publisher record. No endpoint is discovered or created automatically.';
    elements.sourceForm.hidden = false;
    elements.sourceCreateState.hidden = false;
    elements.sourceStateSummary.hidden = true;
    elements.sourceStateActions.hidden = true;
    input(elements.sourceForm, 'configKey').disabled = false;
    required('[data-source-submit]').textContent = 'Create Source';
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
    renderPhraseRows(source.rssAtomAdmissionPhrases);
    required('[data-source-submit]').textContent = 'Save Source configuration';
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
      rssAtomAdmissionPhrases: readPhraseRows(),
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
    const path = creating
      ? '/api/admin/sources'
      : `/api/admin/sources/${encodeURIComponent(sourceKey)}/configuration`;
    try {
      const result = await mutate(submitter, () =>
        api(path, { method: creating ? 'POST' : 'PUT', body }),
      );
      const saved = result.source;
      state.selectedSource = saved;
      state.sourceMode = 'edit';
      mergeSource(saved);
      await loadAdministration(saved.configKey);
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
          `/api/admin/sources/${encodeURIComponent(source.configKey)}/${action}`,
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
      elements.newEndpoint.disabled =
        result.source.lifecycleState === 'archived';
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
    setGlobalStatus('loading', `Loading endpoint ${endpointKey}…`);
    try {
      const result = await api(
        `/api/admin/sources/${encodeURIComponent(source.configKey)}/endpoints/${encodeURIComponent(endpointKey)}`,
      );
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
    state.endpointMode = 'create';
    elements.endpointForm.reset();
    input(elements.endpointForm, 'endpointType').value = 'rss_atom';
    input(elements.endpointForm, 'pollIntervalSeconds').value = '900';
    input(elements.endpointForm, 'approvalState').value = 'unapproved';
    input(elements.endpointForm, 'operationalState').value = 'disabled';
    radio(elements.endpointForm, 'domainPolicyMode', 'inherit').checked = true;
    elements.endpointDomains.replaceChildren();
    elements.endpointEditorHeading.textContent = 'Create endpoint';
    elements.endpointEditorHelp.textContent =
      'Create an RSS/Atom endpoint beneath the selected Source. Saving configuration does not contact the publisher.';
    elements.endpointForm.hidden = false;
    elements.endpointCreateState.hidden = false;
    elements.endpointStateSummary.hidden = true;
    elements.endpointStateActions.hidden = true;
    input(elements.endpointForm, 'configKey').disabled = false;
    required('[data-endpoint-submit]').textContent = 'Create endpoint';
    hideMessage(elements.endpointFormError);
    elements.operationalPanel.hidden = true;
    renderEndpointDomainMode();
    input(elements.endpointForm, 'configKey').focus();
  }

  function cancelEndpointEdit() {
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
    renderEndpointDomainMode();
    required('[data-endpoint-submit]').textContent =
      'Save endpoint configuration';
    required('[data-endpoint-submit]').disabled =
      source.lifecycleState === 'archived';
    hideMessage(elements.endpointFormError);
    renderEndpointStateActions();
    elements.operationalPanel.hidden = false;
  }

  function showNoEndpoint() {
    elements.endpointEditorHeading.textContent = 'Select an endpoint';
    elements.endpointEditorHelp.textContent =
      'Select an endpoint to edit its configuration and operational state.';
    elements.endpointForm.hidden = true;
    elements.endpointStateSummary.hidden = true;
    elements.endpointStateActions.hidden = true;
    elements.operationalPanel.hidden = true;
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
    const base = `/api/admin/sources/${encodeURIComponent(source.configKey)}/endpoints`;
    const path = creating
      ? base
      : `${base}/${encodeURIComponent(state.selectedEndpoint?.configKey ?? '')}/configuration`;
    try {
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
          `/api/admin/sources/${encodeURIComponent(source.configKey)}/endpoints/${encodeURIComponent(endpoint.configKey)}/${action}`,
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
      `/api/admin/sources/${encodeURIComponent(source.configKey)}/endpoints`,
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
      const base = `/api/admin/sources/${encodeURIComponent(source.configKey)}/endpoints/${encodeURIComponent(endpoint.configKey)}`;
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
      elements.runsList.append(article);
    }
  }

  async function checkNow() {
    const source = state.selectedSource;
    const endpoint = state.selectedEndpoint;
    if (source === null || endpoint === null) return;
    hideMessage(elements.checkNowResult);
    try {
      const result = await mutate(elements.checkNow, () =>
        api(
          `/api/admin/sources/${encodeURIComponent(source.configKey)}/endpoints/${encodeURIComponent(endpoint.configKey)}/check-now`,
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

  async function mutate(control, operation) {
    if (state.mutationInFlight) {
      throw new Error('Another administrative change is still in progress.');
    }
    state.mutationInFlight = true;
    const button = control instanceof HTMLButtonElement ? control : null;
    if (button !== null) button.disabled = true;
    try {
      return await operation();
    } finally {
      state.mutationInFlight = false;
      if (button !== null && button.isConnected) button.disabled = false;
    }
  }

  async function api(path, options = {}) {
    const request = { method: options.method ?? 'GET', headers: {} };
    if (options.body !== undefined) {
      request.headers['Content-Type'] = 'application/json';
      request.headers[mutationHeader] = '1';
      request.body = JSON.stringify(options.body);
    }
    const response = await fetch(path, request);
    let payload;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok) {
      throw new AdminRequestError(
        response.status,
        typeof payload?.error === 'string' ? payload.error : undefined,
        typeof payload?.reason === 'string' ? payload.reason : undefined,
      );
    }
    if (payload === null || typeof payload !== 'object') {
      throw new Error('The administration API returned an invalid response.');
    }
    return payload;
  }

  class AdminRequestError extends Error {
    constructor(status, code, reason) {
      super(`Admin request failed with status ${status}`);
      this.status = status;
      this.code = code;
      this.reason = reason;
    }
  }

  function messageForError(error) {
    if (!(error instanceof AdminRequestError)) {
      return error instanceof Error
        ? error.message
        : 'The administrative request could not be completed.';
    }
    const messages = {
      invalid_request:
        'Some values are invalid. Review the form and try again; your unsaved values have been kept.',
      source_not_found:
        'The selected Source no longer exists. Refresh the page.',
      endpoint_not_found:
        'The selected endpoint no longer exists under this Source. Refresh the page.',
      category_not_found:
        'The selected default Category no longer exists. Refresh the available choices.',
      source_config_key_conflict:
        'That Source configuration key is already in use.',
      endpoint_config_key_conflict:
        'That endpoint configuration key is already in use for this Source.',
      endpoint_url_conflict: 'That endpoint URL is already configured.',
      source_domain_policy_conflict:
        'The Source domain change would invalidate a retained endpoint policy.',
      endpoint_domain_policy_conflict:
        'The endpoint domain rules cannot widen the Source-approved boundary.',
      source_archived:
        'Restore the Source before changing its active configuration.',
      endpoint_archived:
        'Restore the endpoint before changing its operational state.',
      request_integrity_required:
        'The request-integrity check failed. Reload the page and try again.',
      internal_error: 'The administration service is temporarily unavailable.',
    };
    if (error.code === 'endpoint_not_collectable') {
      return `Check now was not queued because the endpoint is ineligible: ${humanize(error.reason ?? 'unknown state')}.`;
    }
    return (
      messages[error.code] ??
      `The administrative request failed with status ${error.status}.`
    );
  }

  function populateCategorySelects() {
    for (const select of document.querySelectorAll('[data-category-select]')) {
      const current = select.value;
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = 'No default Category';
      select.replaceChildren(empty);
      for (const category of state.categories) {
        const option = document.createElement('option');
        option.value = category.configKey;
        option.textContent = category.displayName;
        select.append(option);
      }
      if (current !== '') select.value = current;
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
      includeSubdomains: requiredWithin(row, '[data-domain-subdomains]')
        .checked,
    }));
  }

  function renderPhraseRows(phrases) {
    elements.admissionPhrases.replaceChildren();
    for (const phrase of phrases) addPhraseRow(phrase);
    renderPhraseEmptyState();
  }

  function addPhraseRow(value) {
    const empty = elements.admissionPhrases.querySelector(
      '[data-phrase-empty]',
    );
    empty?.remove();
    const row = document.createElement('div');
    row.className = 'repeatable-row phrase-row';
    const label = document.createElement('label');
    label.textContent = 'Include phrase';
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
        renderPhraseEmptyState();
      },
      false,
      'quiet',
    );
    remove.classList.add('compact');
    row.append(label, remove);
    elements.admissionPhrases.append(row);
  }

  function renderPhraseEmptyState() {
    if (elements.admissionPhrases.querySelector('.phrase-row') !== null) return;
    const empty = document.createElement('p');
    empty.className = 'empty-inline';
    empty.dataset.phraseEmpty = '';
    empty.textContent = 'Collect all: no admission phrases are configured.';
    elements.admissionPhrases.append(empty);
  }

  function readPhraseRows() {
    return Array.from(
      elements.admissionPhrases.querySelectorAll('[data-admission-phrase]'),
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

  function stateLine(resource) {
    const line = document.createElement('span');
    line.className = 'state-line';
    line.append(
      statePill('Approval', resource.approvalState),
      statePill('Lifecycle', resource.lifecycleState),
      statePill('Operation', resource.operationalState),
    );
    return line;
  }

  function statePill(label, value) {
    const pill = document.createElement('span');
    pill.className = `state-pill state-${value}`;
    pill.textContent = `${label}: ${humanize(value)}`;
    return pill;
  }

  function actionLabel(text) {
    const label = document.createElement('span');
    label.className = 'action-label';
    label.textContent = text;
    return label;
  }

  function actionButton(text, action, disabled = false, kind = 'secondary') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `button ${kind}`;
    button.textContent = text;
    button.disabled = disabled;
    button.addEventListener('click', action);
    return button;
  }

  function operationLabel(value, resource) {
    if (value === 'enabled') return `Enable ${resource}`;
    if (value === 'paused') return `Pause ${resource}`;
    return `Disable ${resource}`;
  }

  function mergeSource(source) {
    const index = state.sources.findIndex(
      (candidate) => candidate.configKey === source.configKey,
    );
    if (index === -1) state.sources.push(source);
    else state.sources[index] = source;
    state.sources.sort((left, right) =>
      left.configKey.localeCompare(right.configKey),
    );
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
    return state.sources.find((source) => source.configKey === key);
  }

  function setGlobalStatus(kind, message) {
    elements.status.dataset.status = kind;
    elements.status.textContent = message;
  }

  function setListState(element, kind, message) {
    element.dataset.listState = kind;
    element.textContent = message;
    element.hidden = kind === 'ready';
  }

  function showMessage(element, message, kind) {
    element.dataset.messageKind = kind;
    element.textContent = message;
    element.hidden = false;
  }

  function hideMessage(element) {
    element.hidden = true;
    element.textContent = '';
    delete element.dataset.messageKind;
  }

  function humanize(value) {
    if (value === null || value === undefined || value === '')
      return 'Not available';
    return String(value)
      .replaceAll('_', ' ')
      .replace(/^./u, (first) => first.toUpperCase());
  }

  function dateTime(value) {
    if (value === null || value === undefined) return 'Not recorded';
    const date = new Date(value);
    return Number.isNaN(date.valueOf())
      ? 'Invalid timestamp'
      : date.toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        });
  }

  function required(selector) {
    const element = document.querySelector(selector);
    if (!(element instanceof HTMLElement)) {
      throw new Error(`Missing administration element: ${selector}`);
    }
    return element;
  }

  function requiredWithin(container, selector) {
    const element = container.querySelector(selector);
    if (!(element instanceof HTMLInputElement)) {
      throw new Error(`Missing administration input: ${selector}`);
    }
    return element;
  }

  function input(form, name) {
    const element = form.elements.namedItem(name);
    if (
      !(element instanceof HTMLInputElement) &&
      !(element instanceof HTMLSelectElement)
    ) {
      throw new Error(`Missing administration form control: ${name}`);
    }
    return element;
  }

  function radio(form, name, value) {
    const element = form.querySelector(
      `input[type="radio"][name="${name}"][value="${value}"]`,
    );
    if (!(element instanceof HTMLInputElement)) {
      throw new Error(`Missing administration radio: ${name}/${value}`);
    }
    return element;
  }
})();
