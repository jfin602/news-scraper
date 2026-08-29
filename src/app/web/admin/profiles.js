/* global document, HTMLButtonElement */
import {
  AdminRequestError,
  actionButton,
  api,
  hideMessage,
  humanize,
  input,
  dateTime,
  messageForError,
  mutate,
  required,
  setGlobalStatus,
  setListState,
  showMessage,
  statePill,
} from './core.js';
import { catalog } from './catalog.js';

const state = {
  profiles: [],
  selectedProfile: null,
  mode: 'none',
  editingSourceKey: null,
  aiProfileKey: null,
  ai: null,
  aiError: null,
};

const elements = {
  list: required('[data-profile-list]'),
  listState: required('[data-profile-list-state]'),
  newProfile: required('[data-new-profile]'),
  editorHeading: required('[data-profile-editor-heading]'),
  editorHelp: required('[data-profile-editor-help]'),
  summary: required('[data-profile-state-summary]'),
  createForm: required('[data-profile-create-form]'),
  createError: required('[data-profile-create-error]'),
  createCancel: required('[data-profile-create-cancel]'),
  configurationForm: required('[data-profile-configuration-form]'),
  configurationError: required('[data-profile-configuration-error]'),
  lifecycleActions: required('[data-profile-lifecycle-actions]'),
  associations: required('[data-profile-associations]'),
  associationList: required('[data-profile-association-list]'),
  associationError: required('[data-profile-association-error]'),
  associationForm: required('[data-profile-association-form]'),
  associationHeading: required('[data-profile-association-heading]'),
  associationSubmit: required('[data-profile-association-submit]'),
  associationCancel: required('[data-profile-association-cancel]'),
  sourceSelect: required('[data-profile-source-select]'),
  categoryOptions: required('[data-profile-category-options]'),
  refresh: required('[data-refresh-profiles]'),
  ai: required('[data-profile-ai]'),
  aiState: required('[data-profile-ai-state]'),
  aiConfigurationForm: required('[data-profile-ai-configuration-form]'),
  aiConfigurationError: required('[data-profile-ai-configuration-error]'),
  aiGenerate: required('[data-profile-ai-generate]'),
  aiGenerationResult: required('[data-profile-ai-generation-result]'),
  aiActiveDigest: required('[data-profile-ai-active-digest]'),
  aiLatestAttempt: required('[data-profile-ai-latest-attempt]'),
};

function profileMessage(error) {
  if (error instanceof AdminRequestError) {
    const known = new Set([
      'invalid_request',
      'profile_not_found',
      'profile_config_key_conflict',
      'source_not_found',
      'category_not_found',
      'profile_association_not_found',
      'profile_invalid_lifecycle_transition',
      'profile_requires_usable_source',
      'digest_disabled',
      'digest_no_input',
      'digest_generation_in_progress',
    ]);
    if (known.has(error.code)) return messageForError(error);
    return 'The Profile service could not complete that request. Refresh and try again.';
  }
  return 'The Profile service could not complete that request. Refresh and try again.';
}

function replaceProfile(profile) {
  const index = state.profiles.findIndex(
    (candidate) => candidate.configKey === profile.configKey,
  );
  if (index === -1) state.profiles.push(profile);
  else state.profiles[index] = profile;
  state.profiles.sort((left, right) =>
    left.configKey.localeCompare(right.configKey),
  );
  state.selectedProfile = profile;
}

function renderList() {
  elements.list.replaceChildren();
  if (state.profiles.length === 0) {
    setListState(
      elements.listState,
      'empty',
      'No Distribution Profiles are configured. Create a draft Profile to begin.',
    );
    return;
  }
  setListState(elements.listState, 'ready', '');
  for (const profile of state.profiles) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    const title = document.createElement('span');
    const key = document.createElement('span');
    const lifecycle = document.createElement('span');
    button.type = 'button';
    button.className = 'selection-button';
    button.dataset.profileKey = profile.configKey;
    button.setAttribute(
      'aria-current',
      state.selectedProfile?.configKey === profile.configKey ? 'true' : 'false',
    );
    title.className = 'selection-title';
    title.textContent = profile.displayName;
    key.className = 'selection-key';
    key.textContent = profile.configKey;
    lifecycle.className = 'selection-meta';
    lifecycle.textContent = `Lifecycle: ${humanize(profile.lifecycleState)}`;
    button.append(title, key, lifecycle);
    item.append(button);
    elements.list.append(item);
  }
}

function renderSummary(profile) {
  elements.summary.replaceChildren(
    statePill('Lifecycle', profile.lifecycleState),
  );
  elements.summary.hidden = false;
}

function showNoProfile() {
  state.mode = 'none';
  state.editingSourceKey = null;
  elements.editorHeading.textContent = 'Select a Profile';
  elements.editorHelp.textContent =
    'Choose a Profile to configure its distribution filters and lifecycle.';
  elements.summary.hidden = true;
  elements.createForm.hidden = true;
  elements.configurationForm.hidden = true;
  elements.lifecycleActions.hidden = true;
  elements.associations.hidden = true;
  elements.ai.hidden = true;
  hideMessage(elements.createError);
  hideMessage(elements.configurationError);
  hideMessage(elements.associationError);
}

function definitionList(element, facts) {
  element.replaceChildren();
  for (const [label, value] of facts) {
    const term = document.createElement('dt');
    const definition = document.createElement('dd');
    term.textContent = label;
    definition.textContent = value;
    element.append(term, definition);
  }
  element.hidden = false;
}

function renderAi(profile) {
  elements.ai.hidden = false;
  hideMessage(elements.aiConfigurationError);
  if (state.aiProfileKey !== profile.configKey) {
    elements.aiState.dataset.profileAiState = 'loading';
    elements.aiState.textContent = 'Loading AI digest state…';
    elements.aiConfigurationForm.hidden = true;
    elements.aiActiveDigest.hidden = true;
    elements.aiLatestAttempt.hidden = true;
    hideMessage(elements.aiGenerationResult);
    return;
  }
  if (state.aiError) {
    elements.aiState.dataset.profileAiState = 'error';
    elements.aiState.textContent = state.aiError;
    elements.aiConfigurationForm.hidden = true;
    elements.aiActiveDigest.hidden = true;
    elements.aiLatestAttempt.hidden = true;
    return;
  }
  const ai = state.ai;
  if (!ai) return;
  elements.aiState.dataset.profileAiState = 'ready';
  elements.aiState.textContent = 'AI digest state is ready.';
  input(elements.aiConfigurationForm, 'digestEnabled').checked =
    ai.configuration.digestEnabled;
  input(elements.aiConfigurationForm, 'lookbackDays').value = String(
    ai.configuration.lookbackDays,
  );
  input(elements.aiConfigurationForm, 'maxArticles').value = String(
    ai.configuration.maxArticles,
  );
  input(elements.aiConfigurationForm, 'digestStyleGuidance').value =
    ai.configuration.digestStyleGuidance ?? '';
  elements.aiConfigurationForm.hidden = false;
  if (ai.activeDigest === null) {
    definitionList(elements.aiActiveDigest, [['Active digest', 'No digest']]);
  } else {
    definitionList(elements.aiActiveDigest, [
      ['Active digest', humanize(ai.activeDigest.freshness)],
      ['Generated', dateTime(ai.activeDigest.generatedAt)],
      ['Input Articles', String(ai.activeDigest.inputArticleCount)],
      ['Provider', ai.activeDigest.provider],
      ['Model', ai.activeDigest.model],
    ]);
  }
  if (ai.latestAttempt === null) {
    definitionList(elements.aiLatestAttempt, [
      ['Latest attempt', 'No attempts yet'],
    ]);
  } else {
    definitionList(elements.aiLatestAttempt, [
      [
        'Latest attempt',
        `${humanize(ai.latestAttempt.triggerKind)}: ${humanize(ai.latestAttempt.outcome)}`,
      ],
      ['Started', dateTime(ai.latestAttempt.startedAt)],
      ['Completed', dateTime(ai.latestAttempt.completedAt)],
      ['Failure category', humanize(ai.latestAttempt.failureCategory)],
      [
        'URL Context',
        `${ai.latestAttempt.urlContextSucceededCount} succeeded, ${ai.latestAttempt.urlContextFailedCount} unavailable`,
      ],
    ]);
  }
}

async function loadProfileAi(profileKey) {
  state.aiProfileKey = profileKey;
  state.ai = null;
  state.aiError = null;
  const requestProfileKey = profileKey;
  try {
    const result = await api(
      `/admin/api/distribution-profiles/${encodeURIComponent(requestProfileKey)}/ai`,
    );
    if (state.selectedProfile?.configKey !== requestProfileKey) return;
    state.ai = result.ai;
  } catch (error) {
    if (state.selectedProfile?.configKey !== requestProfileKey) return;
    state.aiError = profileMessage(error);
  }
  if (state.selectedProfile?.configKey === requestProfileKey)
    renderSelectedProfile();
}

function aiConfigurationBody() {
  return {
    digestEnabled: input(elements.aiConfigurationForm, 'digestEnabled').checked,
    lookbackDays: Number(
      input(elements.aiConfigurationForm, 'lookbackDays').value,
    ),
    maxArticles: Number(
      input(elements.aiConfigurationForm, 'maxArticles').value,
    ),
    digestStyleGuidance: input(
      elements.aiConfigurationForm,
      'digestStyleGuidance',
    ).value,
  };
}

async function submitAiConfiguration(event) {
  const profile = state.selectedProfile;
  if (!profile) return;
  hideMessage(elements.aiConfigurationError);
  try {
    const result = await mutate(event.submitter, () =>
      api(
        `/admin/api/distribution-profiles/${encodeURIComponent(profile.configKey)}/ai/configuration`,
        { method: 'PUT', body: aiConfigurationBody() },
      ),
    );
    if (state.selectedProfile?.configKey !== profile.configKey) return;
    state.ai = result.ai;
    state.aiProfileKey = profile.configKey;
    state.aiError = null;
    renderSelectedProfile();
    setGlobalStatus(
      'ready',
      'Profile AI settings saved. The next scheduled evaluation uses them.',
    );
  } catch (error) {
    showMessage(elements.aiConfigurationError, profileMessage(error), 'error');
    elements.aiConfigurationError.focus();
  }
}

async function generateAiDigest() {
  const profile = state.selectedProfile;
  if (!profile) return;
  hideMessage(elements.aiGenerationResult);
  try {
    const result = await mutate(elements.aiGenerate, () =>
      api(
        `/admin/api/distribution-profiles/${encodeURIComponent(profile.configKey)}/ai/generate`,
        { method: 'POST', body: {} },
      ),
    );
    if (state.selectedProfile?.configKey !== profile.configKey) return;
    state.ai = result.ai;
    state.aiProfileKey = profile.configKey;
    state.aiError = null;
    renderSelectedProfile();
    showMessage(
      elements.aiGenerationResult,
      result.result === 'generated'
        ? 'Digest generation completed successfully.'
        : 'Digest generation completed without a new active digest. See the latest bounded attempt status below.',
      result.result === 'generated' ? 'success' : 'error',
    );
  } catch (error) {
    showMessage(elements.aiGenerationResult, profileMessage(error), 'error');
    elements.aiGenerationResult.focus();
  }
}

function renderConfiguration(profile) {
  const form = elements.configurationForm;
  input(form, 'configKey').value = profile.configKey;
  input(form, 'displayName').value = profile.displayName;
  input(form, 'resultLimit').value = String(profile.resultLimit);
  form.hidden = false;
  hideMessage(elements.configurationError);
}

function sourceName(sourceKey) {
  const source = catalog.sources.find(
    (candidate) => candidate.configKey === sourceKey,
  );
  return source?.displayName ?? sourceKey;
}

function categoryName(categoryKey) {
  const category = catalog.categories.find(
    (candidate) => candidate.configKey === categoryKey,
  );
  return category?.displayName ?? categoryKey;
}

function filterText(label, values, map = (value) => value) {
  return `${label}: ${values.length ? values.map(map).join(', ') : 'No restriction'}`;
}

function renderAssociations(profile) {
  elements.associationList.replaceChildren();
  if (profile.sources.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-inline';
    empty.textContent = 'No Sources are associated with this Profile.';
    elements.associationList.append(empty);
  }
  for (const association of profile.sources) {
    const card = document.createElement('article');
    const heading = document.createElement('h3');
    const key = document.createElement('p');
    const sourceState = document.createElement('p');
    const filters = document.createElement('div');
    const actions = document.createElement('div');
    card.className = 'bounded-list-item profile-association-card';
    heading.textContent = association.displayName;
    key.className = 'selection-key';
    key.textContent = association.configKey;
    sourceState.className = 'selection-meta';
    sourceState.textContent = `Source: ${humanize(association.approvalState)}, ${humanize(association.lifecycleState)}`;
    filters.className = 'profile-association-filters';
    for (const text of [
      filterText('Include', association.includeAnyPhrases),
      filterText('Exclude', association.excludeAnyPhrases),
      filterText('Categories', association.categoryConfigKeys, categoryName),
    ]) {
      const line = document.createElement('p');
      line.textContent = text;
      filters.append(line);
    }
    actions.className = 'panel-actions';
    const edit = actionButton('Edit association', () =>
      beginAssociationEdit(association.configKey),
    );
    edit.dataset.profileAssociationEdit = association.configKey;
    const remove = actionButton(
      'Remove association',
      () => void removeAssociation(association.configKey),
      false,
      'danger',
    );
    remove.dataset.profileAssociationRemove = association.configKey;
    actions.append(edit, remove);
    card.append(heading, key, sourceState, filters, actions);
    elements.associationList.append(card);
  }
}

function populateAssociationChoices(profile) {
  const selected = state.editingSourceKey;
  elements.sourceSelect.replaceChildren();
  const available = selected
    ? profile.sources.filter((source) => source.configKey === selected)
    : catalog.sources.filter(
        (source) =>
          !profile.sources.some(
            (association) => association.configKey === source.configKey,
          ),
      );
  if (available.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = selected
      ? sourceName(selected)
      : 'No unassociated Sources are available';
    elements.sourceSelect.append(option);
    elements.sourceSelect.disabled = true;
  } else {
    for (const source of available) {
      const option = document.createElement('option');
      option.value = source.configKey;
      option.textContent = `${source.displayName} (${source.configKey})`;
      elements.sourceSelect.append(option);
    }
    elements.sourceSelect.disabled = selected !== null;
    if (selected) elements.sourceSelect.value = selected;
  }
  elements.categoryOptions.replaceChildren();
  const categoryKeys = new Set(
    state.editingSourceKey
      ? profile.sources.find(
          (source) => source.configKey === state.editingSourceKey,
        )?.categoryConfigKeys
      : [],
  );
  for (const category of catalog.categories) {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    const text = document.createElement('span');
    checkbox.type = 'checkbox';
    checkbox.name = 'categoryConfigKeys';
    checkbox.value = category.configKey;
    checkbox.checked = categoryKeys.has(category.configKey);
    text.textContent = `${category.displayName} (${category.configKey})`;
    label.append(checkbox, text);
    elements.categoryOptions.append(label);
  }
}

function renderAssociationForm(profile) {
  const association = state.editingSourceKey
    ? profile.sources.find(
        (source) => source.configKey === state.editingSourceKey,
      )
    : undefined;
  elements.associationHeading.textContent = association
    ? `Edit Source association: ${association.configKey}`
    : 'Add Source association';
  elements.associationSubmit.textContent = association
    ? 'Save Source association'
    : 'Add Source association';
  elements.associationCancel.hidden = association === undefined;
  input(elements.associationForm, 'includeAnyPhrases').value = association
    ? association.includeAnyPhrases.join('\n')
    : '';
  input(elements.associationForm, 'excludeAnyPhrases').value = association
    ? association.excludeAnyPhrases.join('\n')
    : '';
  populateAssociationChoices(profile);
}

function renderLifecycleActions(profile) {
  elements.lifecycleActions.replaceChildren();
  const requested =
    profile.lifecycleState === 'draft'
      ? ['Activate', 'active']
      : profile.lifecycleState === 'active'
        ? ['Disable', 'disabled']
        : ['Reactivate', 'active'];
  const action = actionButton(
    requested[0],
    () => void changeLifecycle(requested[1]),
    false,
    requested[0] === 'Disable' ? 'danger' : 'secondary',
  );
  action.dataset.profileLifecycle = requested[1];
  elements.lifecycleActions.append(action);
  elements.lifecycleActions.hidden = false;
}

function renderSelectedProfile() {
  const profile = state.selectedProfile;
  if (!profile) {
    showNoProfile();
    return;
  }
  state.mode = 'edit';
  elements.editorHeading.textContent = profile.displayName;
  elements.editorHelp.textContent =
    'Profile filters only narrow governed distribution output; they do not alter collection admission.';
  renderSummary(profile);
  elements.createForm.hidden = true;
  renderConfiguration(profile);
  renderAi(profile);
  if (state.aiProfileKey !== profile.configKey)
    void loadProfileAi(profile.configKey);
  renderLifecycleActions(profile);
  elements.associations.hidden = false;
  renderAssociations(profile);
  renderAssociationForm(profile);
  hideMessage(elements.associationError);
}

function beginCreate() {
  state.mode = 'create';
  state.selectedProfile = null;
  state.editingSourceKey = null;
  elements.createForm.reset();
  input(elements.createForm, 'resultLimit').value = '100';
  elements.editorHeading.textContent = 'Create Profile';
  elements.editorHelp.textContent =
    'New Profiles begin as drafts. Configuration keys are immutable after creation.';
  elements.summary.hidden = true;
  elements.createForm.hidden = false;
  elements.configurationForm.hidden = true;
  elements.lifecycleActions.hidden = true;
  elements.associations.hidden = true;
  elements.ai.hidden = true;
  hideMessage(elements.createError);
  input(elements.createForm, 'configKey').focus();
  renderList();
}

function cancelCreate() {
  if (state.selectedProfile) renderSelectedProfile();
  else showNoProfile();
}

function selectProfile(key) {
  const profile = state.profiles.find(
    (candidate) => candidate.configKey === key,
  );
  if (!profile) return;
  state.selectedProfile = profile;
  state.mode = 'edit';
  state.editingSourceKey = null;
  state.aiProfileKey = null;
  state.ai = null;
  state.aiError = null;
  renderList();
  renderSelectedProfile();
}

function phrases(value) {
  return value
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function associationBody() {
  return {
    includeAnyPhrases: phrases(
      input(elements.associationForm, 'includeAnyPhrases').value,
    ),
    excludeAnyPhrases: phrases(
      input(elements.associationForm, 'excludeAnyPhrases').value,
    ),
    categoryConfigKeys: Array.from(
      elements.categoryOptions.querySelectorAll('input:checked'),
      (checkbox) => checkbox.value,
    ),
  };
}

async function loadProfiles({ catalogReady = false } = {}) {
  const selection = state.selectedProfile?.configKey;
  setGlobalStatus('loading', 'Loading Distribution Profiles…');
  setListState(elements.listState, 'loading', 'Loading Distribution Profiles…');
  try {
    const [result] = await Promise.all([
      api('/admin/api/distribution-profiles'),
      ...(catalogReady ? [] : [catalog.refresh()]),
    ]);
    state.profiles = result.profiles ?? [];
    state.selectedProfile =
      state.profiles.find((profile) => profile.configKey === selection) ?? null;
    if (state.mode === 'create') state.mode = 'none';
    if (state.editingSourceKey && !state.selectedProfile) {
      state.editingSourceKey = null;
    }
    renderList();
    renderSelectedProfile();
    setGlobalStatus('ready', 'Profiles workspace is ready.');
  } catch (error) {
    setGlobalStatus('error', profileMessage(error));
    setListState(
      elements.listState,
      'error',
      'Profiles could not be loaded. Use Refresh Profiles to try again.',
    );
    elements.list.replaceChildren();
    if (!state.selectedProfile) showNoProfile();
  }
}

async function submitCreate(event) {
  hideMessage(elements.createError);
  try {
    const result = await mutate(event.submitter, () =>
      api('/admin/api/distribution-profiles', {
        method: 'POST',
        body: {
          configKey: input(elements.createForm, 'configKey').value,
          displayName: input(elements.createForm, 'displayName').value,
          resultLimit: Number(input(elements.createForm, 'resultLimit').value),
        },
      }),
    );
    replaceProfile(result.profile);
    state.mode = 'edit';
    state.editingSourceKey = null;
    renderList();
    renderSelectedProfile();
    setGlobalStatus('ready', 'Draft Profile created.');
  } catch (error) {
    showMessage(elements.createError, profileMessage(error), 'error');
    elements.createError.focus();
  }
}

async function submitConfiguration(event) {
  const profile = state.selectedProfile;
  if (!profile) return;
  hideMessage(elements.configurationError);
  try {
    const result = await mutate(event.submitter, () =>
      api(
        `/admin/api/distribution-profiles/${encodeURIComponent(profile.configKey)}/configuration`,
        {
          method: 'PUT',
          body: {
            displayName: input(elements.configurationForm, 'displayName').value,
            resultLimit: Number(
              input(elements.configurationForm, 'resultLimit').value,
            ),
          },
        },
      ),
    );
    replaceProfile(result.profile);
    renderList();
    renderSelectedProfile();
    setGlobalStatus('ready', 'Profile configuration saved.');
  } catch (error) {
    showMessage(elements.configurationError, profileMessage(error), 'error');
    elements.configurationError.focus();
  }
}

function beginAssociationEdit(sourceKey) {
  state.editingSourceKey = sourceKey;
  if (state.selectedProfile) renderSelectedProfile();
}

function cancelAssociationEdit() {
  state.editingSourceKey = null;
  state.aiProfileKey = null;
  state.ai = null;
  state.aiError = null;
  if (state.selectedProfile) renderSelectedProfile();
}

async function submitAssociation(event) {
  const profile = state.selectedProfile;
  const sourceKey = state.editingSourceKey ?? elements.sourceSelect.value;
  if (!profile || !sourceKey) return;
  hideMessage(elements.associationError);
  try {
    const result = await mutate(event.submitter, () =>
      api(
        `/admin/api/distribution-profiles/${encodeURIComponent(profile.configKey)}/sources/${encodeURIComponent(sourceKey)}`,
        { method: 'PUT', body: associationBody() },
      ),
    );
    replaceProfile(result.profile);
    state.editingSourceKey = null;
    renderList();
    renderSelectedProfile();
    setGlobalStatus('ready', 'Profile Source association saved.');
  } catch (error) {
    showMessage(elements.associationError, profileMessage(error), 'error');
    elements.associationError.focus();
  }
}

async function removeAssociation(sourceKey) {
  const profile = state.selectedProfile;
  if (!profile) return;
  hideMessage(elements.associationError);
  try {
    const result = await mutate(document.activeElement, () =>
      api(
        `/admin/api/distribution-profiles/${encodeURIComponent(profile.configKey)}/sources/${encodeURIComponent(sourceKey)}`,
        { method: 'DELETE', body: {} },
      ),
    );
    replaceProfile(result.profile);
    state.editingSourceKey = null;
    renderList();
    renderSelectedProfile();
    setGlobalStatus('ready', 'Profile Source association removed.');
  } catch (error) {
    showMessage(elements.associationError, profileMessage(error), 'error');
    elements.associationError.focus();
  }
}

async function changeLifecycle(lifecycleState) {
  const profile = state.selectedProfile;
  if (!profile) return;
  hideMessage(elements.configurationError);
  try {
    const result = await mutate(document.activeElement, () =>
      api(
        `/admin/api/distribution-profiles/${encodeURIComponent(profile.configKey)}/lifecycle`,
        { method: 'PUT', body: { lifecycleState } },
      ),
    );
    replaceProfile(result.profile);
    renderList();
    renderSelectedProfile();
    setGlobalStatus(
      'ready',
      lifecycleState === 'disabled'
        ? 'Profile disabled.'
        : 'Profile activated.',
    );
  } catch (error) {
    showMessage(elements.configurationError, profileMessage(error), 'error');
    elements.configurationError.focus();
  }
}

function wireProfiles() {
  elements.newProfile.addEventListener('click', beginCreate);
  elements.createCancel.addEventListener('click', cancelCreate);
  elements.list.addEventListener('click', (event) => {
    const button = event.target.closest('[data-profile-key]');
    if (button instanceof HTMLButtonElement)
      selectProfile(button.dataset.profileKey);
  });
  elements.createForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitCreate(event);
  });
  elements.configurationForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitConfiguration(event);
  });
  elements.associationForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitAssociation(event);
  });
  elements.aiConfigurationForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitAiConfiguration(event);
  });
  elements.aiGenerate.addEventListener('click', () => void generateAiDigest());
  elements.associationCancel.addEventListener('click', cancelAssociationEdit);
  elements.refresh.addEventListener('click', () => void loadProfiles());
}

export function createProfilesWorkspace() {
  wireProfiles();
  catalog.subscribe(() => {
    if (state.selectedProfile) renderSelectedProfile();
  });
  return { activate: loadProfiles, refresh: loadProfiles };
}
