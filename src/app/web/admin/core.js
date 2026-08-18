/* global document, fetch, HTMLElement, HTMLButtonElement, HTMLInputElement, HTMLSelectElement, HTMLTextAreaElement */
export const mutationHeader = 'X-News-Scraper-Admin-Request';
let mutationInFlight = false;
export async function mutate(control, operation) {
  if (mutationInFlight) {
    throw new Error('Another administrative change is still in progress.');
  }
  mutationInFlight = true;
  const button = control instanceof HTMLButtonElement ? control : null;
  if (button !== null) button.disabled = true;
  try {
    return await operation();
  } finally {
    mutationInFlight = false;
    if (button !== null && button.isConnected) button.disabled = false;
  }
}
export async function api(path, options = {}) {
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

export class AdminRequestError extends Error {
  constructor(status, code, reason) {
    super(`Admin request failed with status ${status}`);
    this.status = status;
    this.code = code;
    this.reason = reason;
  }
}

export function messageForError(error) {
  if (!(error instanceof AdminRequestError)) {
    return error instanceof Error
      ? error.message
      : 'The administrative request could not be completed.';
  }
  const messages = {
    invalid_request:
      'Some values are invalid. Review the form and try again; your unsaved values have been kept.',
    source_not_found: 'The selected Source no longer exists. Refresh the page.',
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

export function stateLine(resource) {
  const line = document.createElement('span');
  line.className = 'state-line';
  line.append(
    statePill('Approval', resource.approvalState),
    statePill('Lifecycle', resource.lifecycleState),
    statePill('Operation', resource.operationalState),
  );
  return line;
}

export function statePill(label, value) {
  const pill = document.createElement('span');
  pill.className = `state-pill state-${value}`;
  pill.textContent = `${label}: ${humanize(value)}`;
  return pill;
}

export function actionLabel(text) {
  const label = document.createElement('span');
  label.className = 'action-label';
  label.textContent = text;
  return label;
}

export function actionButton(
  text,
  action,
  disabled = false,
  kind = 'secondary',
) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `button ${kind}`;
  button.textContent = text;
  button.disabled = disabled;
  button.addEventListener('click', action);
  return button;
}

export function operationLabel(value, resource) {
  if (value === 'enabled') return `Enable ${resource}`;
  if (value === 'paused') return `Pause ${resource}`;
  return `Disable ${resource}`;
}

export function setGlobalStatus(kind, message) {
  const element = required('[data-admin-status]');
  element.dataset.status = kind;
  element.textContent = message;
}

export function setListState(element, kind, message) {
  element.dataset.listState = kind;
  element.textContent = message;
  element.hidden = kind === 'ready';
}

export function showMessage(element, message, kind) {
  element.dataset.messageKind = kind;
  element.textContent = message;
  element.hidden = false;
}

export function hideMessage(element) {
  element.hidden = true;
  element.textContent = '';
  delete element.dataset.messageKind;
}

export function humanize(value) {
  if (value === null || value === undefined || value === '')
    return 'Not available';
  return String(value)
    .replaceAll('_', ' ')
    .replace(/^./u, (first) => first.toUpperCase());
}

export function dateTime(value) {
  if (value === null || value === undefined) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? 'Invalid timestamp'
    : date.toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
}

export function duration(milliseconds) {
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

export function required(selector) {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing administration element: ${selector}`);
  }
  return element;
}

export function requiredWithin(container, selector) {
  const element = container.querySelector(selector);
  if (!(element instanceof HTMLInputElement)) {
    throw new Error(`Missing administration input: ${selector}`);
  }
  return element;
}

export function input(form, name) {
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

export function radio(form, name, value) {
  const element = form.querySelector(
    `input[type="radio"][name="${name}"][value="${value}"]`,
  );
  if (!(element instanceof HTMLInputElement)) {
    throw new Error(`Missing administration radio: ${name}/${value}`);
  }
  return element;
}
