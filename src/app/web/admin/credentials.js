/* global document, navigator, window */
import {
  AdminRequestError,
  actionButton,
  api,
  dateTime,
  hideMessage,
  humanize,
  input,
  messageForError,
  mutate,
  required,
  setGlobalStatus,
  setListState,
  showMessage,
} from './core.js';

const state = { credentials: [], token: null };
const elements = {
  state: required('[data-credentials-state]'),
  list: required('[data-credentials-list]'),
  error: required('[data-credentials-error]'),
  form: required('[data-credential-create-form]'),
  refresh: required('[data-refresh-credentials]'),
  secret: required('[data-credential-secret]'),
  token: required('[data-credential-token]'),
  copy: required('[data-copy-credential-token]'),
  dismiss: required('[data-dismiss-credential-token]'),
  copyResult: required('[data-credential-copy-result]'),
};

function credentialMessage(error) {
  if (error instanceof AdminRequestError) {
    if (
      [
        'invalid_request',
        'credential_not_found',
        'credential_already_rotated',
      ].includes(error.code)
    )
      return messageForError(error);
    return 'The credential service could not complete that request. Refresh Credentials and try again.';
  }
  return 'The credential service could not complete that request. Refresh Credentials and try again.';
}
function clearSecret() {
  state.token = null;
  elements.token.textContent = '';
  elements.copyResult.textContent = '';
  elements.secret.hidden = true;
}
function showSecret(token) {
  clearSecret();
  state.token = token;
  elements.token.textContent = token;
  elements.secret.hidden = false;
  required('[data-credential-secret-heading]').focus();
}
function replaceCredential(credential) {
  const index = state.credentials.findIndex(
    (item) => item.lookupId === credential.lookupId,
  );
  if (index === -1) state.credentials.push(credential);
  else state.credentials[index] = credential;
  state.credentials.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
function renderList() {
  elements.list.replaceChildren();
  if (state.credentials.length === 0) {
    setListState(
      elements.state,
      'empty',
      'No machine distribution credentials are configured.',
    );
    return;
  }
  setListState(elements.state, 'ready', '');
  for (const credential of state.credentials) {
    const card = document.createElement('article');
    card.className = 'bounded-list-item';
    const title = document.createElement('h4');
    title.textContent = credential.label;
    const details = document.createElement('p');
    details.textContent = `Lookup identity: ${credential.lookupId} · Capability: ${credential.capability} · Status: ${humanize(credential.lifecycleState)}`;
    const dates = document.createElement('p');
    dates.className = 'selection-meta';
    dates.textContent = `Created: ${dateTime(credential.createdAt)} · Expires: ${dateTime(credential.expiresAt)}`;
    card.append(title, details, dates);
    if (credential.rotationSuccessorLookupId) {
      const lineage = document.createElement('p');
      lineage.className = 'selection-meta';
      lineage.textContent = `Rotation successor: ${credential.rotationSuccessorLookupId}`;
      card.append(lineage);
    }
    if (credential.lifecycleState !== 'revoked') {
      const actions = document.createElement('div');
      actions.className = 'credential-record-actions';
      const rotate = actionButton(
        'Rotate credential',
        () => void rotateCredential(credential),
        credential.lifecycleState === 'rotated',
      );
      rotate.dataset.credentialRotate = credential.lookupId;
      const revoke = actionButton(
        'Revoke credential',
        () => void revokeCredential(credential),
        false,
        'danger',
      );
      revoke.dataset.credentialRevoke = credential.lookupId;
      actions.append(rotate, revoke);
      card.append(actions);
    }
    elements.list.append(card);
  }
}
async function loadCredentials() {
  hideMessage(elements.error);
  setGlobalStatus('loading', 'Loading Credentials…');
  setListState(elements.state, 'loading', 'Loading Credentials…');
  try {
    const result = await api('/admin/api/distribution-credentials');
    state.credentials = result.credentials ?? [];
    renderList();
    setGlobalStatus('ready', 'Credentials workspace is ready.');
  } catch (error) {
    setListState(
      elements.state,
      'error',
      'Credentials could not be loaded. Use Refresh Credentials to try again.',
    );
    showMessage(elements.error, credentialMessage(error), 'error');
  }
}
function issueBody(form) {
  const expiresAt = input(form, 'expiresAt').value;
  return {
    label: input(form, 'label').value,
    ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
  };
}
async function createCredential(event) {
  hideMessage(elements.error);
  try {
    const result = await mutate(event.submitter, () =>
      api('/admin/api/distribution-credentials', {
        method: 'POST',
        body: issueBody(elements.form),
      }),
    );
    replaceCredential(result.credential);
    renderList();
    elements.form.reset();
    showSecret(result.plaintextToken);
    setGlobalStatus(
      'ready',
      'Credential created. Copy the one-time token now.',
    );
  } catch (error) {
    showMessage(elements.error, credentialMessage(error), 'error');
    elements.error.focus();
  }
}
async function rotateCredential(credential) {
  hideMessage(elements.error);
  try {
    const result = await mutate(document.activeElement, () =>
      api(
        `/admin/api/distribution-credentials/${encodeURIComponent(credential.lookupId)}/rotate`,
        {
          method: 'POST',
          body: {
            label: credential.label,
            ...(credential.expiresAt
              ? { expiresAt: credential.expiresAt }
              : {}),
          },
        },
      ),
    );
    replaceCredential(result.credential);
    replaceCredential({
      ...credential,
      lifecycleState: 'rotated',
      rotationSuccessorLookupId: result.credential.lookupId,
    });
    renderList();
    showSecret(result.plaintextToken);
    setGlobalStatus(
      'ready',
      'Credential rotated. The predecessor remains usable until revoked or expired.',
    );
  } catch (error) {
    showMessage(elements.error, credentialMessage(error), 'error');
    elements.error.focus();
  }
}
async function revokeCredential(credential) {
  if (
    !window.confirm(
      `Revoke ${credential.label}? Future machine authentication will be disabled; the record is retained.`,
    )
  )
    return;
  hideMessage(elements.error);
  try {
    const result = await mutate(document.activeElement, () =>
      api(
        `/admin/api/distribution-credentials/${encodeURIComponent(credential.lookupId)}/revoke`,
        { method: 'POST', body: {} },
      ),
    );
    replaceCredential(result.credential);
    renderList();
    setGlobalStatus(
      'ready',
      'Credential revoked; its retained record remains available for audit history.',
    );
  } catch (error) {
    showMessage(elements.error, credentialMessage(error), 'error');
    elements.error.focus();
  }
}
function wire() {
  elements.form.addEventListener('submit', (event) => {
    event.preventDefault();
    void createCredential(event);
  });
  elements.refresh.addEventListener('click', () => void loadCredentials());
  elements.dismiss.addEventListener('click', clearSecret);
  elements.copy.addEventListener('click', async () => {
    if (!state.token) return;
    try {
      await navigator.clipboard.writeText(state.token);
      elements.copyResult.textContent =
        'Token copied. Clear it from this page when finished.';
    } catch {
      elements.copyResult.textContent =
        'Copy was unavailable. Select the token text and copy it manually, then clear it.';
    }
  });
}
export function createCredentialsWorkspace() {
  wire();
  return {
    activate: loadCredentials,
    refresh: loadCredentials,
    deactivate: clearSecret,
  };
}
