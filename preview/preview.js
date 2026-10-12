const root = document.documentElement;
const settings = document.querySelector('#appearance-view');
const workspace = document.querySelector('#workspace-view');
const viewToggle = document.querySelector('#view-toggle');
function showWorkspace(value) {
  settings.hidden = value;
  workspace.hidden = !value;
  viewToggle.textContent = value ? 'Show Appearance settings' : 'Show workspace';
}
viewToggle.addEventListener('click', () => showWorkspace(!settings.hidden));
document.querySelector('#sidebar-settings').addEventListener('click', () => showWorkspace(false));
function setTheme(theme) {
  root.dataset.theme = theme;
  root.classList.toggle('dark', theme === 'dark');
  for (const mode of ['light', 'dark']) document.querySelector(`#${mode}-theme`).setAttribute('aria-pressed', String(mode === theme));
}
window.addEventListener('neon-codex:theme-request', event => {
  if (['light', 'dark'].includes(event.detail?.theme)) setTheme(event.detail.theme);
});
for (const theme of ['light', 'dark']) document.querySelector(`#${theme}-theme`).addEventListener('click', () => setTheme(theme));
document.querySelector('#reduce-motion').addEventListener('click', event => {
  const reduced = root.dataset.reducedMotion !== 'true';
  root.dataset.reducedMotion = String(reduced);
  event.currentTarget.setAttribute('aria-pressed', String(reduced));
});
const dialog = document.querySelector('#test-modal');
document.querySelector('#test-dialog').addEventListener('click', () => dialog.showModal());
document.querySelector('#close-dialog').addEventListener('click', () => dialog.close());
