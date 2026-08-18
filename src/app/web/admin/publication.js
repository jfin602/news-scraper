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

const state = { publication: null };
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
  input(form, 'activeForCollection').checked = publication.activeForCollection;
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
    showMessage(elements.publicationFormError, messageForError(error), 'error');
    elements.publicationFormError.focus();
    setGlobalStatus('error', 'Publication configuration could not be saved.');
  }
}

export function createPublicationWorkspace() {
  elements.publicationForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitPublication(event);
  });
  return { activate: loadPublication, refresh: loadPublication };
}
