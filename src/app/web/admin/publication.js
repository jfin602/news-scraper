import {
  api,
  mutate,
  messageForError,
  required,
  input,
  setGlobalStatus,
  showMessage,
  hideMessage,
} from './core.js';

const state = { publication: null };
const elements = {
  publicationState: required('[data-publication-state]'),
  publicationForm: required('[data-publication-form]'),
  publicationFormError: required('[data-publication-form-error]'),
  timezoneHint: required('[data-timezone-hint]'),
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
