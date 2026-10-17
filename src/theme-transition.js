/* A short color dissolve for the existing native surfaces. No replacement UI. */
export const THEME_TRANSITION_MS = 160;
const ACTIVE = 'data-neon-theme-transition';
const COLORS = 'data-neon-theme-colors';
const BASE = '--neon-theme-base-transition';
const SURFACES = [
  'html', 'body', '[data-app-shell-frame]', '.sidebar-navigation', '[data-app-shell-main-surface]',
  '[data-app-navigation-rail]', '[data-app-shell-left-panel-appearance]', '[class*="_PageSurface_"]',
  '[data-app-shell-frame] .page-surface', '[data-app-shell-frame] .sidebar',
  '[data-neon-settings-root]', '.neon-settings-preview', '.neon-preview-window',
  '[data-app-shell-frame] button', '[data-app-shell-frame] input', '[data-app-shell-frame] select',
  '[data-app-shell-frame] h1', '[data-app-shell-frame] h2', '[data-app-shell-frame] h3',
  '[role="dialog"]', '[role="menu"]',
].join(',');

export function createThemeTransition(win = window) {
  const doc = win.document, root = doc.documentElement;
  const colorMedia = win.matchMedia('(prefers-color-scheme: dark)');
  const motionMedia = win.matchMedia('(prefers-reduced-motion: reduce)');
  const surfaces = new Map(), pendingRoots = new Set([doc]);
  let destroyed = false, armed = false, frame = null, timer = null;
  const originalActive = root.getAttribute(ACTIVE);

  function theme() {
    // Read attributes without flushing layout. The transition must be armed
    // before the browser computes the new palette, including native switches.
    for (const node of [root, doc.body]) {
      if (!node) continue;
      const explicit = node.getAttribute('data-theme');
      if (explicit === 'light' || explicit === 'dark') return explicit;
      const inline = node.style.getPropertyValue('--theme-variant').trim();
      if (inline === 'light' || inline === 'dark') return inline;
      if (node.classList.contains('dark')) return 'dark';
      if (node.classList.contains('light')) return 'light';
    }
    return colorMedia.matches ? 'dark' : 'light';
  }
  function reduced() {
    const explicit = root.getAttribute('data-reduced-motion');
    return explicit === 'true' || (explicit !== 'false' && motionMedia.matches);
  }
  let lastTheme = theme();

  function restore(node, previous) {
    if (previous.marker === null) node.removeAttribute(COLORS);
    else node.setAttribute(COLORS, previous.marker);
    if (previous.value) node.style.setProperty(BASE, previous.value, previous.priority);
    else node.style.removeProperty(BASE);
  }
  function releaseRemoved(subtree) {
    // Mutation delivery still runs when background windows suspend RAF. Release
    // detached controls here rather than retaining them until the next paint,
    // and inspect only the removed subtree, never every control in a long chat.
    // A native reparent within this delivery keeps its prepared transition.
    if (subtree.isConnected) return;
    const walker = doc.createTreeWalker(subtree, win.NodeFilter.SHOW_ELEMENT);
    let node = subtree;
    do {
      pendingRoots.delete(node);
      const previous = surfaces.get(node);
      if (previous) { restore(node, previous); surfaces.delete(node); }
    } while ((node = walker.nextNode()));
  }
  function collect() {
    frame = null;
    if (destroyed || armed) return;
    // Only inspect newly added element subtrees after the initial pass. Streamed
    // text tokens never enqueue work or rescan an existing conversation.
    const candidates = new Set();
    for (const subtree of pendingRoots) {
      if (subtree !== doc && !subtree.isConnected) continue;
      let ancestor = subtree.parentNode;
      while (ancestor && !pendingRoots.has(ancestor)) ancestor = ancestor.parentNode;
      if (ancestor) continue;
      if (subtree.matches?.(SURFACES)) candidates.add(subtree);
      if (subtree === doc || subtree.childElementCount) {
        for (const node of subtree.querySelectorAll(SURFACES)) candidates.add(node);
      }
    }
    pendingRoots.clear();
    // Read first, write second: mounting settings does not cause one forced
    // layout for every control. Store styles only; never read or copy content.
    const added = [...candidates].filter(node => !surfaces.has(node));
    const styles = added.map(node => win.getComputedStyle(node).transition);
    added.forEach((node, index) => {
      surfaces.set(node, { marker: node.getAttribute(COLORS), value: node.style.getPropertyValue(BASE), priority: node.style.getPropertyPriority(BASE) });
      node.style.setProperty(BASE, styles[index] || 'all 0s ease 0s');
      node.setAttribute(COLORS, 'v1');
    });
  }
  function scheduleCollect() {
    if (!destroyed && !armed && frame === null && pendingRoots.size) frame = win.requestAnimationFrame(collect);
  }
  function cancelColors() {
    // Removing a transition declaration alone does not cancel a transition
    // already running when its default property is 'all'. Finish only our
    // color interpolation; leave native width, transform and opacity alone.
    for (const node of surfaces.keys()) {
      for (const animation of node.getAnimations?.() || []) {
        if (/^(?:background-color|color|border-(?:top|right|bottom|left)-color)$/.test(animation.transitionProperty || '')) animation.cancel();
      }
    }
  }
  function finish(cancel = false) {
    if (timer !== null) win.clearTimeout(timer);
    timer = null; armed = false;
    if (originalActive === null) root.removeAttribute(ACTIVE);
    else root.setAttribute(ACTIVE, originalActive);
    if (cancel) cancelColors();
    scheduleCollect();
  }
  function update() {
    if (destroyed) return;
    const next = theme();
    if (reduced()) { lastTheme = next; if (armed) finish(true); return; }
    if (next === lastTheme) return;
    lastTheme = next;
    // Never animate first paint or a utility window. Native startup sets this
    // attribute late; that alone is not a palette change.
    if (root.getAttribute('data-codex-window-type') !== 'electron' || !doc.querySelector('[data-app-shell-frame]')) return;
    armed = true;
    root.setAttribute(ACTIVE, 'v1');
    if (timer !== null) win.clearTimeout(timer);
    timer = win.setTimeout(finish, THEME_TRANSITION_MS + 32);
  }
  const themeObserver = new win.MutationObserver(update);
  const structureObserver = new win.MutationObserver(records => {
    for (const record of records) {
      for (const node of record.removedNodes) if (node.nodeType === 1) releaseRemoved(node);
      for (const node of record.addedNodes) if (node.nodeType === 1 && node.isConnected) pendingRoots.add(node);
    }
    scheduleCollect();
  });
  function ready() {
    if (destroyed) return;
    themeObserver.observe(doc.body, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
    structureObserver.observe(doc.body, { childList: true, subtree: true });
    collect();
  }
  themeObserver.observe(root, { attributes: true, attributeFilter: ['data-theme', 'class', 'style', 'data-reduced-motion'] });
  colorMedia.addEventListener('change', update);
  motionMedia.addEventListener('change', update);
  if (doc.body) ready(); else doc.addEventListener('DOMContentLoaded', ready, { once: true });
  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      themeObserver.disconnect(); structureObserver.disconnect();
      colorMedia.removeEventListener('change', update); motionMedia.removeEventListener('change', update);
      doc.removeEventListener('DOMContentLoaded', ready);
      if (frame !== null) win.cancelAnimationFrame(frame);
      if (timer !== null) win.clearTimeout(timer);
      if (originalActive === null) root.removeAttribute(ACTIVE);
      else root.setAttribute(ACTIVE, originalActive);
      if (armed) cancelColors();
      for (const [node, previous] of surfaces) restore(node, previous);
      surfaces.clear(); pendingRoots.clear();
    },
  };
}
