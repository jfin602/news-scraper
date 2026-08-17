/* global document, fetch, HTMLElement, HTMLButtonElement, HTMLInputElement, HTMLSelectElement, HTMLTextAreaElement, URLSearchParams */

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
    previewInFlight: false,
    endpointSelectionSequence: 0,
    previewSequence: 0,
    activeWorkspace: 'sources',
    publication: null,
    relevanceRules: [],
    selectedCategory: null,
    selectedRule: null,
    categoryMode: 'none',
    ruleMode: 'none',
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

  wireEvents();
  void loadAdministration();

  function wireEvents() {
    for (const tab of elements.workspaceTabs) {
      tab.addEventListener('click', () => {
        const workspace = tab.dataset.workspace;
        if (
          workspace === 'publication' ||
          workspace === 'operations' ||
          workspace === 'sources' ||
          workspace === 'editorial' ||
          workspace === 'articles'
        ) {
          void selectWorkspace(workspace);
        }
      });
    }
    required('[data-refresh-all]').addEventListener('click', () => {
      void loadAdministration(state.selectedSource?.configKey);
      if (state.activeWorkspace === 'operations') void loadOperations();
      if (state.activeWorkspace === 'publication') void loadPublication();
      if (state.activeWorkspace === 'editorial') void loadEditorial();
      if (state.activeWorkspace === 'articles') void loadArticlesWorkspace();
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
      if (button instanceof HTMLButtonElement) {
        void selectEndpoint(button.dataset.endpointKey);
      }
    });
    required('[data-refresh-operational]').addEventListener('click', () => {
      void loadOperationalData();
    });
    required('[data-refresh-operations]').addEventListener('click', () => {
      void loadOperations();
    });
    elements.operationsEndpoints.addEventListener('click', (event) => {
      const button = event.target.closest('[data-operations-source-key]');
      if (button instanceof HTMLButtonElement) {
        void navigateToOperationsEndpoint(
          button.dataset.operationsSourceKey,
          button.dataset.operationsEndpointKey,
        );
      }
    });
    elements.operationsAlerts.addEventListener('click', (event) => {
      const button = event.target.closest('[data-operations-source-key]');
      if (button instanceof HTMLButtonElement) {
        void navigateToOperationsEndpoint(
          button.dataset.operationsSourceKey,
          button.dataset.operationsEndpointKey,
        );
      }
    });
    elements.checkNow.addEventListener('click', () => {
      void checkNow();
    });
    elements.htmlPreview.addEventListener('click', () => {
      void previewHtmlSample();
    });
    elements.publicationForm.addEventListener('submit', (event) => {
      event.preventDefault();
      void submitPublication(event);
    });
    required('[data-new-category]').addEventListener(
      'click',
      beginCategoryCreate,
    );
    required('[data-category-cancel]').addEventListener('click', () =>
      renderCategoryEditor(),
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
    required('[data-rule-cancel]').addEventListener('click', () =>
      renderRuleEditor(),
    );
    elements.ruleList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-rule-key]');
      if (button instanceof HTMLButtonElement)
        void selectRule(button.dataset.ruleKey);
    });
    elements.ruleForm.addEventListener('submit', (event) => {
      event.preventDefault();
      void submitRule(event);
    });
    elements.ruleForm.addEventListener('change', () =>
      renderRuleConditionals(),
    );
    elements.ruleEnabled.addEventListener(
      'click',
      () => void toggleRuleEnabled(),
    );
    elements.ruleDelete.addEventListener('click', () => void deleteRule());
    elements.articleFilterForm.addEventListener('submit', (event) => {
      event.preventDefault();
      void applyArticleFilters();
    });
    required('[data-article-filter-reset]').addEventListener('click', () => {
      resetArticleFilters();
      void loadArticleList();
    });
    elements.articleLoadMore.addEventListener('click', () => {
      void loadArticleList({ append: true });
    });
    elements.articleList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-article-id]');
      if (button instanceof HTMLButtonElement) {
        void selectArticle(button.dataset.articleId);
      }
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
    elements.reviewLoadMore.addEventListener('click', () => {
      void loadReviewQueue({ append: true });
    });
    elements.reviewList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-review-id]');
      if (button instanceof HTMLButtonElement) {
        void selectReview(button.dataset.reviewId);
      }
    });
    elements.reviewDismiss.addEventListener(
      'click',
      () => void dismissReview(),
    );
    elements.reviewMerge.addEventListener('click', () => void mergeReview());
    elements.reviewSplit.addEventListener('click', () => void splitReview());
    elements.reviewPrimary.addEventListener(
      'click',
      () => void chooseReviewPrimary(),
    );
    elements.reviewGroupSelect.addEventListener('change', () =>
      renderReviewGroupActions(),
    );
  }

  async function selectWorkspace(workspace) {
    if (
      workspace !== 'publication' &&
      workspace !== 'operations' &&
      workspace !== 'sources' &&
      workspace !== 'editorial' &&
      workspace !== 'articles'
    )
      return;
    state.activeWorkspace = workspace;
    for (const tab of elements.workspaceTabs) {
      const selected = tab.dataset.workspace === workspace;
      tab.setAttribute('aria-selected', selected ? 'true' : 'false');
    }
    for (const panel of elements.workspacePanels) {
      panel.hidden = panel.dataset.workspacePanel !== workspace;
    }
    const selectedTab = elements.workspaceTabs.find(
      (tab) => tab.dataset.workspace === workspace,
    );
    selectedTab?.focus();
    if (workspace === 'publication') await loadPublication();
    if (workspace === 'operations') await loadOperations();
    if (workspace === 'editorial') await loadEditorial();
    if (workspace === 'articles') await loadArticlesWorkspace();
  }

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
      [
        'Oldest ready delay',
        duration(snapshot.jobs.oldestReadyAgeMilliseconds),
      ],
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
    await selectWorkspace('sources');
    if (state.selectedSource?.configKey !== sourceKey)
      await selectSource(sourceKey);
    await selectEndpoint(endpointKey);
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

  async function loadPublication() {
    setGlobalStatus('loading', 'Loading Publication configuration…');
    setPublicationState('loading', 'Loading Publication configuration…');
    elements.publicationForm.hidden = true;
    hideMessage(elements.publicationFormError);
    try {
      const result = await api('/admin/api/publication');
      state.publication = result.publication;
      renderPublication();
      setPublicationState('ready', 'Publication configuration is ready.');
      setGlobalStatus('ready', 'Publication configuration is ready.');
    } catch (error) {
      setPublicationState('error', messageForError(error));
      setGlobalStatus('error', messageForError(error));
    }
  }

  function setPublicationState(kind, message) {
    elements.publicationState.dataset.publicationState = kind;
    elements.publicationState.textContent = message;
    elements.publicationState.hidden = false;
  }

  function renderPublication() {
    const publication = state.publication;
    if (publication === null) return;
    const form = elements.publicationForm;
    input(form, 'name').value = publication.name;
    input(form, 'activeForCollection').checked =
      publication.activeForCollection;
    input(form, 'publicStatus').value = publication.publicStatus;
    input(form, 'description').value = publication.description ?? '';
    input(form, 'logoPath').value = publication.logoPath ?? '';
    input(form, 'accentColor').value = publication.accentColor ?? '';
    input(form, 'presentationTimezone').value =
      publication.presentationTimezone ?? '';
    elements.timezoneHint.textContent =
      publication.presentationTimezone === null
        ? 'No timezone configured; calendar dates use UTC. This changes presentation only, not stored timestamps or feed order.'
        : 'Calendar dates use this IANA timezone. This changes presentation only, not stored timestamps or feed order.';
    form.hidden = false;
  }

  async function submitPublication(event) {
    const submitter = event.submitter;
    const form = elements.publicationForm;
    hideMessage(elements.publicationFormError);
    const body = {
      name: input(form, 'name').value,
      activeForCollection: input(form, 'activeForCollection').checked,
      publicStatus: input(form, 'publicStatus').value,
      description: input(form, 'description').value,
      logoPath: input(form, 'logoPath').value,
      accentColor: input(form, 'accentColor').value,
      presentationTimezone: input(form, 'presentationTimezone').value,
    };
    try {
      const result = await mutate(submitter, () =>
        api('/admin/api/publication/configuration', {
          method: 'PUT',
          body,
        }),
      );
      state.publication = result.publication;
      renderPublication();
      setPublicationState('ready', 'Publication configuration is ready.');
      setGlobalStatus('ready', 'Publication configuration saved.');
    } catch (error) {
      showMessage(
        elements.publicationFormError,
        messageForError(error),
        'error',
      );
      elements.publicationFormError.focus();
      setGlobalStatus('error', 'Publication configuration could not be saved.');
    }
  }

  async function loadAdministration(preferredSourceKey) {
    setGlobalStatus('loading', 'Loading Sources…');
    setListState(elements.sourceListState, 'loading', 'Loading Sources…');
    try {
      const [categoriesResult, sourcesResult] = await Promise.all([
        api('/admin/api/categories'),
        api('/admin/api/sources'),
      ]);
      state.categories = categoriesResult.categories ?? [];
      state.sources = sourcesResult.sources ?? [];
      populateCategorySelects();
      renderSourceList();
      setGlobalStatus('ready', 'Sources workspace is ready.');
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
      ? '/admin/api/sources'
      : `/admin/api/sources/${encodeURIComponent(sourceKey)}/configuration`;
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
    required('[data-endpoint-submit]').textContent = 'Create endpoint';
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
    required('[data-endpoint-submit]').textContent =
      'Save endpoint configuration';
    required('[data-endpoint-submit]').disabled =
      source.lifecycleState === 'archived';
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
            Array.isArray(row.categories)
              ? row.categories.join(', ')
              : undefined,
          ],
        ];
        const details = document.createElement('dl');
        details.className = 'preview-row-details';
        details.replaceChildren(
          ...values.flatMap(([term, value]) => {
            if (value === undefined || value === null || value === '')
              return [];
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
        (!Array.isArray(diagnostics.samples) ||
          diagnostics.samples.length === 0))
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
      state.sources,
      'Any Source',
      'configKey',
      'displayName',
    );
    populateSelect(
      elements.articleCategoryFilter,
      state.categories,
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
        setListState(
          elements.articleListState,
          'error',
          messageForError(error),
        );
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
    elements.articleDisplayClear.disabled =
      article.displayTitleOverride === null;
    renderArticleCategoryOptions(article);
    renderObservations(article.observations ?? []);
    renderHistory(article.history?.events ?? []);
  }

  function renderArticleCategoryOptions(article) {
    elements.articleCategoryOptions.replaceChildren();
    if (state.categories.length === 0) {
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
    for (const category of state.categories) {
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = category.configKey;
      checkbox.checked =
        article.manualCategoryOverride.active &&
        selected.has(category.configKey);
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
      showMessage(
        elements.articleDisplayError,
        messageForError(error),
        'error',
      );
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
      showMessage(
        elements.articleDisplayError,
        messageForError(error),
        'error',
      );
      elements.articleDisplayError.focus();
      setGlobalStatus('error', 'Display-title override could not be cleared.');
    }
  }

  async function saveCategoryOverride(event) {
    const article = state.selectedArticle;
    if (article === null) return;
    hideMessage(elements.articleCategoryError);
    const keys = Array.from(
      elements.articleCategoryOptions.querySelectorAll(
        'input[type="checkbox"]',
      ),
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
      showMessage(
        elements.articleCategoryError,
        messageForError(error),
        'error',
      );
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
      showMessage(
        elements.articleCategoryError,
        messageForError(error),
        'error',
      );
      elements.articleCategoryError.focus();
      setGlobalStatus(
        'error',
        'Manual Category override could not be cleared.',
      );
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
    const value = input(
      required('[data-review-action-form]'),
      'reason',
    ).value.trim();
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
      api(
        `/admin/api/duplicate-groups/${encodeURIComponent(groupId)}/primary`,
        {
          method: 'POST',
          body: { articleId, reason: reviewReason() },
        },
      ),
    );
  }

  async function runReviewCommand(control, label, operation) {
    try {
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

  async function loadEditorial() {
    setGlobalStatus('loading', 'Loading editorial configuration…');
    setListState(elements.categoryListState, 'loading', 'Loading Categories…');
    setListState(elements.ruleListState, 'loading', 'Loading Relevance rules…');
    try {
      const [categories, rules, sources] = await Promise.all([
        api('/admin/api/categories'),
        api('/admin/api/relevance-rules'),
        api('/admin/api/sources'),
      ]);
      state.categories = categories.categories ?? [];
      state.relevanceRules = rules.relevanceRules ?? [];
      state.sources = sources.sources ?? state.sources;
      populateCategorySelects();
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
      state.categories.length ? 'ready' : 'empty',
      state.categories.length ? '' : 'No Categories are configured.',
    );
    for (const category of state.categories) {
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
    input(form, 'scope').value = rule.sourceConfigKey
      ? 'source'
      : 'installation';
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
      ['[data-rule-source-select]', state.sources, 'No Source'],
      ['[data-rule-category-select]', state.categories, 'No Category'],
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
        api(
          `/admin/api/relevance-rules/${encodeURIComponent(rule.configKey)}`,
          { method: 'DELETE', body: {} },
        ),
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

  async function api(path, options = {}) {
    const request = { method: options.method ?? 'GET', headers: {} };
    if (options.body !== undefined) {
      request.headers['Content-Type'] = 'application/json';
      request.headers[mutationHeader] = '1';
      request.body = JSON.stringify(options.body);
    }
    const response = await fetch(path, request);
    if (response.status === 204) return {};
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
      category_config_key_conflict:
        'That Category configuration key is already in use.',
      category_in_use: 'This Category is still in use and cannot be removed.',
      relevance_rule_config_key_conflict:
        'That Relevance rule configuration key is already in use.',
      relevance_rule_in_use:
        'This Relevance rule has retained history and cannot be removed.',
      relevance_rule_source_not_found:
        'Choose a current Source for this scoped rule.',
      relevance_rule_category_not_found:
        'Choose a current Category target for this rule.',
      relevance_rule_action_target_incompatible:
        'Only categorize rules may have a Category target.',
      source_config_key_conflict:
        'That Source configuration key is already in use.',
      endpoint_config_key_conflict:
        'That endpoint configuration key is already in use for this Source.',
      endpoint_url_conflict: 'That endpoint URL is already configured.',
      source_domain_policy_conflict:
        'The Source domain change would invalidate a retained endpoint policy.',
      endpoint_domain_policy_conflict:
        'The endpoint domain rules cannot widen the Source-approved boundary.',
      publication_not_found:
        'The singleton Publication is not configured. Configure it before editing.',
      article_not_found:
        'The selected Article no longer exists. Refresh the moderation workspace.',
      article_visibility_conflict:
        'Archived Articles are read-only; no visibility transition was applied.',
      duplicate_review_not_found:
        'This duplicate review candidate no longer exists. Refresh the review queue.',
      source_archived:
        'Restore the Source before changing its active configuration.',
      endpoint_archived:
        'Restore the endpoint before changing its operational state.',
      request_integrity_required:
        'The request-integrity check failed. Reload the page and try again.',
      internal_error: 'The administration service is temporarily unavailable.',
      service_unavailable:
        'The operational snapshot is temporarily unavailable. Refresh Operations to try again.',
    };
    if (error.code === 'endpoint_not_collectable') {
      return `Check now was not queued because the endpoint is ineligible: ${humanize(error.reason ?? 'unknown state')}.`;
    }
    if (error.status === 409) {
      return 'The stored moderation state changed before this action completed. Refresh the selected evidence and try again.';
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

  function duration(milliseconds) {
    if (milliseconds === null || milliseconds === undefined)
      return 'Not available';
    if (typeof milliseconds !== 'number' || !Number.isFinite(milliseconds))
      return 'Invalid duration';
    if (milliseconds < 1_000) return `${Math.round(milliseconds)} ms`;
    if (milliseconds < 60_000)
      return `${Math.round(milliseconds / 1_000)} seconds`;
    if (milliseconds < 3_600_000)
      return `${Math.round(milliseconds / 60_000)} minutes`;
    return `${Math.round(milliseconds / 3_600_000)} hours`;
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
      !(element instanceof HTMLSelectElement) &&
      !(element instanceof HTMLTextAreaElement)
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
