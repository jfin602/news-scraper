/* global document */
import { createPublicationWorkspace } from './publication.js';
import { createOperationsWorkspace } from './operations.js';
import { createSourcesWorkspace } from './sources.js';
import { createEditorialWorkspace } from './editorial.js';
import { createModerationWorkspace } from './moderation.js';
import { createProfilesWorkspace } from './profiles.js';
import { required } from './core.js';

const sources = createSourcesWorkspace();
const workspaces = {
  publication: createPublicationWorkspace(),
  operations: createOperationsWorkspace({
    navigate: (sourceKey, endpointKey) =>
      navigateToSourceEndpoint(sourceKey, endpointKey),
  }),
  sources,
  editorial: createEditorialWorkspace(),
  profiles: createProfilesWorkspace(),
  articles: createModerationWorkspace(),
};
let activeWorkspace = 'sources';
const tabs = Array.from(document.querySelectorAll('[data-workspace]'));
const panels = Array.from(document.querySelectorAll('[data-workspace-panel]'));
async function selectWorkspace(workspace) {
  if (!(workspace in workspaces)) return;
  activeWorkspace = workspace;
  for (const tab of tabs)
    tab.setAttribute(
      'aria-selected',
      tab.dataset.workspace === workspace ? 'true' : 'false',
    );
  for (const panel of panels)
    panel.hidden = panel.dataset.workspacePanel !== workspace;
  const selected = tabs.find((tab) => tab.dataset.workspace === workspace);
  selected?.focus();
  await workspaces[workspace].activate();
}
async function navigateToSourceEndpoint(sourceKey, endpointKey) {
  await selectWorkspace('sources');
  await sources.navigate(sourceKey, endpointKey);
}
for (const tab of tabs)
  tab.addEventListener(
    'click',
    () => void selectWorkspace(tab.dataset.workspace),
  );
required('[data-refresh-all]').addEventListener('click', async () => {
  if (activeWorkspace === 'sources') {
    await sources.refresh();
    return;
  }
  await sources.refresh();
  await workspaces[activeWorkspace].refresh({ catalogReady: true });
});
void sources.refresh();
