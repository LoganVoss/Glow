/* Optional third layout for the native Toggle Sidebar command.
   Keep React's original navigation/account nodes and all native handlers. */
export const SIDEBAR_SHELL = '[data-app-shell-frame][data-app-shell-page-surface="true"]';
export const SIDEBAR_STRUCTURE = '[data-app-navigation-rail],.app-shell-left-panel,.sidebar-navigation,#app-shell-sidebar,[data-app-shell-sidebar-trigger],[data-sidebar-destination="builtin:home"],.sidebar-item,[class~="@container/navigation-header"]';
const HOME = '[data-sidebar-destination="builtin:home"]';
const TRIGGER = '[data-app-shell-sidebar-trigger][aria-controls="app-shell-sidebar"]';
// Only reviewed native workspace surfaces participate in the rail transition.
const GEOMETRY = ':scope > [data-app-shell-workspace-row] > :is(._PageSurface_yl8z4_2, ._PageSurface_etoz9_2), [class~="group/panel-resizer"]';
const px = number => `${Math.round(number * 1000) / 1000}px`;
const MOTION_MS = 420;

export function createSidebarCycle(win, { onGeometryChange = () => {} } = {}) {
  const doc = win.document;
  let current = null, hidden = false, destroyed = false, timer = null, home = null, heading = null;
  const saved = new Map();
  function remember(node, name) {
    let attrs = saved.get(node);
    if (!attrs) { attrs = new Map(); saved.set(node, attrs); }
    if (!attrs.has(name)) attrs.set(name, node.getAttribute(name));
  }
  function attr(node, name, value) {
    remember(node, name);
    if (value === null) node.removeAttribute(name);
    else if (node.getAttribute(name) !== value) node.setAttribute(name, value);
  }
  function restoreAttributes(node) {
    for (const [name, value] of saved.get(node) || []) {
      if (value === null) node.removeAttribute(name); else node.setAttribute(name, value);
    }
    saved.delete(node);
  }
  function updateTriggers() {
    const expanded = hidden && doc.documentElement.getAttribute('data-codex-window-type') === 'electron';
    for (const trigger of doc.querySelectorAll(TRIGGER)) {
      if (expanded) {
        attr(trigger, 'data-neon-sidebar-layout', 'expanded');
        attr(trigger, 'aria-description', 'Sidebar icons hidden');
      } else if (saved.has(trigger)) restoreAttributes(trigger);
    }
  }
  function style(node, name, value) {
    // Preserve native inline styles and any existing custom properties on dispose.
    current.styles ??= new Map();
    let styles = current.styles.get(node);
    if (!styles) { styles = new Map(); current.styles.set(node, styles); }
    if (!styles.has(name)) styles.set(name, [node.style.getPropertyValue(name), node.style.getPropertyPriority(name)]);
    if (node.style.getPropertyValue(name) !== value) node.style.setProperty(name, value);
  }
  function endMotion() {
    if (timer !== null) win.clearTimeout(timer);
    timer = null;
    current?.shell.removeAttribute('data-neon-sidebar-moving');
  }
  function removeHome() {
    home?.remove(); home = null;
    if (heading) {
      const previous = saved.get(heading)?.get('data-neon-settings-title');
      if (previous == null) heading.removeAttribute('data-neon-settings-title');
      else heading.setAttribute('data-neon-settings-title', previous);
      saved.get(heading)?.delete('data-neon-settings-title');
      if (!saved.get(heading)?.size) saved.delete(heading);
    }
    heading = null;
  }
  function restore() {
    endMotion(); removeHome();
    current?.resize.disconnect(); current?.widthObserver.disconnect();
    for (const [node, attrs] of saved) for (const [name, value] of attrs) {
      if (value === null) node.removeAttribute(name); else node.setAttribute(name, value);
    }
    for (const [node, styles] of current?.styles || []) for (const [name, [value, priority]] of styles) {
      if (value) node.style.setProperty(name, value, priority); else node.style.removeProperty(name);
    }
    saved.clear(); current = null;
  }
  function anchors() {
    // Native startup sets its window type late. Missing must be null, not false.
    if (doc.documentElement.getAttribute('data-codex-window-type') !== 'electron') return null;
    const shell = doc.querySelector(SIDEBAR_SHELL);
    if (!shell || shell.closest('dialog,[role="dialog"],[popover]')) return null;
    const rail = shell.querySelector('[data-app-navigation-rail]');
    const panel = rail?.closest('aside.app-shell-left-panel[data-app-shell-left-panel-appearance]');
    const clip = panel?.firstElementChild, content = clip?.firstElementChild;
    const profile = rail?.lastElementChild;
    const account = profile?.querySelector('.sidebar-item button');
    const nativeHome = rail?.querySelector(HOME);
    // Known modern footer: retain its update/usage controls as well as account.
    if (!panel || !content?.contains(rail) || !profile?.classList.contains('w-9') ||
        !profile.querySelector(':scope > .flex.flex-col') || !account || !nativeHome ||
        !content.style.width || content.style.width !== content.style.minWidth) return null;
    const icons = [...rail.children].filter(node => node !== profile);
    if (!icons.length || !icons.some(node => node.contains(nativeHome))) return null;
    return { shell, rail, panel, clip, content, profile, account, nativeHome, icons };
  }
  function mountHome() {
    const nav = [...current.shell.querySelectorAll('.sidebar-navigation')].find(node =>
      !node.closest('[hidden]') && node.querySelector('#settings-search,[data-settings-panel-slug]'));
    const next = nav?.querySelector('[class~="@container/navigation-header"] > h1') || null;
    if (next !== heading || (home && !home.isConnected)) removeHome();
    if (next && !home) {
      heading = next;
      attr(heading, 'data-neon-settings-title', 'v1');
      home = doc.createElement('button');
      home.type = 'button'; home.className = 'neon-settings-home'; home.dataset.neonSettingsHome = 'v1';
      home.setAttribute('aria-label', 'Home'); home.title = 'Home';
      home.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 10 8-7 8 7v10a1 1 0 0 1-1 1h-5v-7h-4v7H5a1 1 0 0 1-1-1Z"/></svg>';
      home.addEventListener('click', () => {
        // This is the real guarded native Home action, never history/URL surgery.
        if (current?.nativeHome.isConnected && !current.nativeHome.disabled) current.nativeHome.click();
      });
      heading.after(home);
    }
    if (home && home.hidden === hidden) home.hidden = !hidden;
  }
  function synchronizeWidth() {
    if (!current) return;
    const { content } = current;
    // Read the native MotionValue's inline target, never our overridden box size.
    if (content.style.width === content.style.minWidth && content.style.width) {
      style(content, '--neon-panel-width', content.style.width);
    }
  }
  function hasPanelRoom(content, railWidth) {
    const width = /^([\d.]+)px$/.exec(content.style.width);
    return Boolean(width && Number(width[1]) > railWidth + 56);
  }
  function measureAccount() {
    if (!current) return;
    const width = current.rail.offsetWidth;
    if (width >= 28 && width <= 100 && width !== current.width) {
      current.width = width;
      style(current.shell, '--neon-rail-expanded-space', px(width));
      style(current.shell, '--neon-rail-space', px(current.applied ? 0 : width));
    }
    const scale = current.rail.getBoundingClientRect().width / current.width || 1;
    style(current.shell, '--neon-account-space', px(current.profile.getBoundingClientRect().height / scale + 16));
  }
  function reconcile() {
    if (destroyed || !doc.body) return;
    const next = anchors();
    if (current && (!next || ['shell', 'rail', 'panel', 'clip', 'content', 'profile'].some(key => current[key] !== next[key]))) restore();
    if (next && !current) {
      // Hide new route-owned groups before the first geometry read can establish
      // a visible frame. Only a deliberate toggle should animate these icons.
      attr(next.shell, 'data-neon-sidebar-icons-hidden', String(hidden));
      attr(next.rail, 'data-neon-rail', 'v1');
      attr(next.profile, 'data-neon-rail-profile', 'v1');
      const width = next.rail.offsetWidth;
      if (width < 28 || width > 100 || next.rail.getBoundingClientRect().height < 1) { restore(); return; }
      const applied = hidden && hasPanelRoom(next.content, width);
      current = { ...next, width, applied, styles: new Map() };
      attr(next.shell, 'data-neon-sidebar-ready', 'true');
      attr(next.panel, 'data-neon-rail-panel', 'v1');
      attr(next.clip, 'data-neon-rail-panel-clip', 'v1');
      attr(next.content, 'data-neon-rail-panel-content', 'v1');
      for (const icon of next.icons) attr(icon, 'data-neon-rail-icons', 'v1');
      for (const node of [next.rail, next.panel, next.clip, next.content,
        ...next.shell.querySelectorAll(GEOMETRY)]) {
        attr(node, 'data-neon-sidebar-geometry', 'v1');
      }
      style(next.shell, '--neon-rail-expanded-space', px(width));
      style(next.shell, '--neon-rail-space', px(applied ? 0 : width));
      attr(next.shell, 'data-neon-sidebar-hidden', String(applied));
      current.resize = new win.ResizeObserver(measureAccount);
      current.resize.observe(next.profile);
      current.resize.observe(next.rail);
      current.widthObserver = new win.MutationObserver(() => {
        const previous = current?.content.style.getPropertyValue('--neon-panel-width');
        synchronizeWidth();
        if (current && previous !== current.content.style.width) reconcile();
      });
      current.widthObserver.observe(next.content, { attributes: true, attributeFilter: ['style'] });
      synchronizeWidth(); measureAccount();
    }
    updateTriggers();
    if (!current) return;
    // React replaces the destination group while switching Settings/Home.
    // Retain the shell's hidden state and adopt just the replacement children.
    for (const icon of current.icons) if (!next.icons.includes(icon)) restoreAttributes(icon);
    current.icons = next.icons;
    for (const icon of current.icons) attr(icon, 'data-neon-rail-icons', 'v1');
    current.nativeHome = next.nativeHome; current.account = next.account;
    for (const node of current.shell.querySelectorAll(GEOMETRY)) {
      attr(node, 'data-neon-sidebar-geometry', 'v1');
    }
    // Some native destinations have only the rail, with no chat/settings list.
    // Keep its account corner visible there; resume the requested layout when
    // the native panel is wide enough again. A loading Settings panel stays wide.
    const applied = hidden && hasPanelRoom(current.content, current.width);
    if (current.applied !== applied) {
      endMotion(); attr(current.shell, 'data-neon-sidebar-moving', 'true');
      timer = win.setTimeout(endMotion, MOTION_MS + 50);
    }
    const focusWasHidden = hidden && current.icons.some(node => node.contains(doc.activeElement));
    attr(current.shell, 'data-neon-sidebar-hidden', String(applied));
    attr(current.shell, 'data-neon-sidebar-icons-hidden', String(hidden));
    style(current.shell, '--neon-rail-space', px(applied ? 0 : current.width));
    for (const icon of current.icons) {
      attr(icon, 'inert', hidden ? '' : saved.get(icon)?.get('inert') ?? null);
      attr(icon, 'aria-hidden', hidden ? 'true' : saved.get(icon)?.get('aria-hidden') ?? null);
    }
    current.applied = applied;
    mountHome();
    if (focusWasHidden) (home && !home.hidden ? home : current.shell.querySelector(TRIGGER))?.focus({ preventScroll: true });
    onGeometryChange();
  }
  function cycle({ open, setOpen } = {}) {
    if (destroyed || typeof open !== 'boolean' || typeof setOpen !== 'function') return false;
    reconcile();
    if (!current) return false;
    if (hidden) {
      hidden = false; reconcile();
      // Another native action may have closed the chat list in the meantime.
      if (!open) { try { setOpen(true); } catch { return false; } }
      return true;
    }
    // First click is completely native, including its animation and peek rules.
    if (open) return false;
    hidden = true;
    try { setOpen(true); reconcile(); }
    catch { hidden = false; reconcile(); return false; }
    return true;
  }
  return { cycle, reconcile, getHidden() { return hidden; }, destroy() {
    if (destroyed) return;
    destroyed = true; hidden = false; restore(); onGeometryChange();
  } };
}
