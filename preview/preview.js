const root = document.documentElement;
const settings = document.querySelector('#appearance-view');
const workspace = document.querySelector('#workspace-view');
const viewToggle = document.querySelector('#view-toggle');
const chatNavigation = document.querySelector('#preview-chat-navigation');
const settingsNavigation = document.querySelector('#preview-settings-navigation');
const shell = document.querySelector('[data-app-shell-frame]');
const panel = document.querySelector('.app-shell-left-panel');
const nativeSidebar = document.querySelector('#app-shell-sidebar');
const sidebarToggle = document.querySelector('#toggle-sidebar');
const appearanceShortcut = document.querySelector('#sidebar-settings');
let sidebarOpen = true;
function renderSidebar() {
  // Native Settings temporarily keeps its navigation visible without changing
  // the requested chat-list state, and disables the titlebar command there.
  const effectiveOpen = !settings.hidden || sidebarOpen;
  panel.style.width = effectiveOpen ? '276px' : '48px';
  nativeSidebar.hidden = !effectiveOpen;
  sidebarToggle.disabled = !settings.hidden;
  shell.dataset.appShellSidebarOpen = String(sidebarOpen);
}
function setSidebarOpen(value) {
  sidebarOpen = Boolean(value);
  renderSidebar();
}
window.__neonPreviewSidebar = { get open() { return sidebarOpen; }, setOpen: setSidebarOpen };
document.querySelector('#toggle-sidebar').addEventListener('click', () => {
  let handled = false;
  try { handled = window.__neonCodexRuntime?.cycleSidebar?.({ open: sidebarOpen, setOpen: setSidebarOpen }) === true; } catch { /* Preserve the native fallback. */ }
  if (!handled) setSidebarOpen(!sidebarOpen);
});
function showWorkspace(value) {
  settings.hidden = value;
  workspace.hidden = !value;
  chatNavigation.hidden = !value;
  settingsNavigation.hidden = value;
  const activeNavigation = value ? chatNavigation : settingsNavigation;
  const inactiveNavigation = value ? settingsNavigation : chatNavigation;
  inactiveNavigation.remove();
  if (activeNavigation.parentElement !== nativeSidebar) nativeSidebar.prepend(activeNavigation);
  if (appearanceShortcut.parentElement !== activeNavigation) activeNavigation.append(appearanceShortcut);
  renderSidebar();
  shell.dataset.previewRoute = value ? 'home' : 'settings';
  viewToggle.textContent = value ? 'Show Appearance settings' : 'Show workspace';
}
viewToggle.addEventListener('click', () => showWorkspace(!settings.hidden));
document.querySelector('#sidebar-settings').addEventListener('click', () => showWorkspace(false));
document.querySelector('#profile-settings').addEventListener('click', () => showWorkspace(false));
document.querySelector('#native-home').addEventListener('click', () => showWorkspace(true));
showWorkspace(false);
setSidebarOpen(true);
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
