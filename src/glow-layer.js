/* Persistent renderer decoration. It reads only reviewed shell geometry and
   never enters React's route-owned subtree or examines conversation content. */
export const WORKSPACE_ROW_SELECTOR = '[data-app-shell-frame][data-app-shell-page-surface="true"] > [data-app-shell-workspace-row]';
// Pinned to the reviewed native builds. This is the actual background surface,
// already positioned by Codex's titlebar, navigation rail, gutters, and zoom.
const NATIVE_SURFACE_SELECTOR = ':scope > :is(._PageSurface_yl8z4_2, ._PageSurface_etoz9_2)';
const px = value => `${Math.round(value * 1000) / 1000}px`;

export function createGlowLayer(win, { makeOverlay, applyOverlay, getTheme }) {
  const doc = win.document;
  let frame = null, probe = null, row = null, shell = null, surface = null;
  let hasGeometry = false, scheduled = null, destroyed = false;
  const resizeObserver = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(reconcile) : null;
  // Observe only our current geometry anchors. The runtime owns the bounded
  // route-structure observer and calls reconcile synchronously on replacements.
  const geometryObserver = new win.MutationObserver(scheduleGeometry);

  function setStyle(node, name, value) {
    if (node.style.getPropertyValue(name) !== value) node.style.setProperty(name, value);
  }
  function setAnchorState(value) {
    if (frame.dataset.neonAnchorState !== value) frame.dataset.neonAnchorState = value;
  }
  function ensureFrame() {
    if (!frame) {
      frame = makeOverlay();
      frame.dataset.neonGlobal = 'true';
      frame.dataset.neonAnchorState = 'initializing';
      frame.setAttribute('aria-hidden', 'true');
      frame.style.visibility = 'hidden';
      frame.style.position = 'fixed';
      frame.style.inset = 'auto';
      frame.style.margin = '0';
      // Read computed lengths for the synthetic/public fallback without adding
      // measurement nodes to Codex's React tree. The native path needs no probe.
      probe = doc.createElement('span');
      probe.dataset.neonLayerMeasure = '';
      probe.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;pointer-events:none;box-sizing:border-box;border:0;padding:0;contain:strict;';
      frame.append(probe);
      applyOverlay(frame, getTheme());
    }
    if (frame.parentElement !== doc.body) doc.body.append(frame);
    return frame;
  }
  function windowType() { return doc.documentElement.getAttribute('data-codex-window-type'); }
  function eligibleRow(candidate) {
    if (!candidate?.isConnected || !candidate.matches(WORKSPACE_ROW_SELECTOR)) return false;
    // Utility windows and modal-contained shells do not establish a main border.
    if (candidate.closest('dialog,[role="dialog"],[popover]')) return false;
    const rect = candidate.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    const style = win.getComputedStyle(candidate);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.visibility !== 'collapse';
  }
  function borderBoxLength(style, dimension, fallback) {
    let size = Number.parseFloat(style[dimension]);
    if (!Number.isFinite(size)) return fallback;
    if (style.boxSizing !== 'border-box') {
      const sides = dimension === 'width' ? ['Left', 'Right'] : ['Top', 'Bottom'];
      for (const side of sides) {
        size += Number.parseFloat(style[`padding${side}`]) || 0;
        size += Number.parseFloat(style[`border${side}Width`]) || 0;
      }
    }
    return size || fallback;
  }
  function scaleFor(node, rect, style) {
    return {
      x: rect.width / borderBoxLength(style, 'width', node.offsetWidth || rect.width),
      y: rect.height / borderBoxLength(style, 'height', node.offsetHeight || rect.height),
    };
  }
  function scaledRadius(value, scale) {
    const [horizontal = '0px', vertical = horizontal] = value.trim().split(/\s+/);
    const scaleLength = (token, factor) => token.endsWith('%') ? token : px((Number.parseFloat(token) || 0) * factor);
    return `${scaleLength(horizontal, scale.x)} ${scaleLength(vertical, scale.y)}`;
  }
  function radii(style, scale) {
    return Object.fromEntries(['top-left', 'top-right', 'bottom-right', 'bottom-left'].map(corner => [
      `border-${corner}-radius`, scaledRadius(style.getPropertyValue(`border-${corner}-radius`), scale),
    ]));
  }
  function measure(candidate) {
    const nativeSurface = candidate.querySelector(NATIVE_SURFACE_SELECTOR);
    if (nativeSurface) {
      const rect = nativeSurface.getBoundingClientRect();
      if (rect.width > 1 && rect.height > 1) {
        const style = win.getComputedStyle(nativeSurface), scale = scaleFor(nativeSurface, rect, style);
        if (style.display !== 'none' && style.visibility !== 'hidden') return {
          source: nativeSurface,
          left: rect.left, top: rect.top, width: rect.width, height: rect.height,
          radii: radii(style, scale), scale: (scale.x + scale.y) / 2,
          cornerShape: style.getPropertyValue('corner-shape') || 'round',
        };
      }
    }
    // Preview fixtures and compatible shell markup use the same logical insets.
    // Browser-computed probe lengths support calc(), rem, and the native zoom.
    const rect = candidate.getBoundingClientRect(), style = win.getComputedStyle(candidate);
    const scale = scaleFor(candidate, rect, style);
    const value = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
    probe.style.width = value('--app-shell-navigation-rail-width', '0px');
    probe.style.height = value('--app-shell-titlebar-height', '0px');
    probe.style.fontSize = style.fontSize;
    probe.style.borderRadius = value('--app-shell-window-radius', value('--radius-xl-base', '12px'));
    const computed = win.getComputedStyle(probe);
    const rail = (Number.parseFloat(computed.width) || 0) * scale.x;
    const titlebar = (Number.parseFloat(computed.height) || 0) * scale.y;
    const borderLeft = (Number.parseFloat(style.borderLeftWidth) || 0) * scale.x;
    const borderRight = (Number.parseFloat(style.borderRightWidth) || 0) * scale.x;
    const borderTop = (Number.parseFloat(style.borderTopWidth) || 0) * scale.y;
    const borderBottom = (Number.parseFloat(style.borderBottomWidth) || 0) * scale.y;
    return {
      source: null,
      left: rect.left + borderLeft + (style.direction === 'rtl' ? 0 : rail),
      top: rect.top + borderTop + titlebar,
      width: rect.width - borderLeft - borderRight - rail,
      height: rect.height - borderTop - borderBottom - titlebar,
      radii: radii(computed, scale), scale: (scale.x + scale.y) / 2, cornerShape: 'round',
    };
  }
  function observe(candidate, nativeSurface) {
    const nextShell = candidate.parentElement;
    if (candidate === row && nativeSurface === surface && nextShell === shell) return;
    row = candidate; shell = nextShell; surface = nativeSurface;
    resizeObserver?.disconnect(); geometryObserver.disconnect();
    for (const node of new Set([row, shell, surface].filter(Boolean))) {
      resizeObserver?.observe(node);
      geometryObserver.observe(node, { attributes: true, attributeFilter: ['style', 'class', 'dir', 'data-app-shell-page-surface'] });
    }
  }
  function releaseAnchors() {
    resizeObserver?.disconnect(); geometryObserver.disconnect();
    row = null; shell = null; surface = null;
  }
  function commit(geometry) {
    for (const name of ['left', 'top', 'width', 'height']) setStyle(frame, name, px(geometry[name]));
    for (const [name, value] of Object.entries(geometry.radii)) setStyle(frame, name, value);
    setStyle(frame, 'corner-shape', geometry.cornerShape);
    setStyle(frame, '--neon-render-scale', String(geometry.scale));
    setStyle(frame, 'visibility', 'visible');
    setAnchorState('active');
    // The styles retain all geometry needed across route gaps. Holding the
    // measurement's source node would also retain its detached route subtree.
    hasGeometry = true;
  }
  function reconcile() {
    if (destroyed || !doc.body) return;
    if ([row, shell, surface].some(node => node && !node.isConnected)) releaseAnchors();
    const type = windowType();
    if (type && type !== 'electron') {
      if (frame) { setStyle(frame, 'visibility', 'hidden'); setAnchorState('suspended'); }
      return;
    }
    // Missing or temporarily false shell attributes are route gaps, not an
    // instruction to flash the already-established decoration off and on.
    let candidate = eligibleRow(row) ? row : null;
    if (!candidate && type === 'electron') {
      for (const next of Array.from(doc.querySelectorAll(WORKSPACE_ROW_SELECTOR)).slice(0, 8)) {
        if (eligibleRow(next)) { candidate = next; break; }
      }
    }
    if (!candidate) {
      if (frame && hasGeometry) {
        ensureFrame(); setStyle(frame, 'visibility', 'visible'); setAnchorState('retained');
      }
      return;
    }
    ensureFrame();
    const geometry = measure(candidate);
    if (geometry.width <= 1 || geometry.height <= 1 || !Number.isFinite(geometry.scale)) return;
    observe(candidate, geometry.source);
    commit(geometry);
  }
  function scheduleGeometry() {
    if (!destroyed && scheduled === null) scheduled = win.requestAnimationFrame(() => { scheduled = null; reconcile(); });
  }
  function update() {
    if (destroyed) return;
    if (frame) applyOverlay(frame, getTheme());
    reconcile();
  }
  win.addEventListener('resize', scheduleGeometry);
  win.addEventListener('scroll', scheduleGeometry, { capture: true, passive: true });
  win.visualViewport?.addEventListener('resize', scheduleGeometry);
  win.visualViewport?.addEventListener('scroll', scheduleGeometry);
  reconcile();
  return {
    reconcile, update,
    getFrame() { return frame; },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (scheduled !== null) win.cancelAnimationFrame(scheduled);
      releaseAnchors();
      win.removeEventListener('resize', scheduleGeometry);
      win.removeEventListener('scroll', scheduleGeometry, true);
      win.visualViewport?.removeEventListener('resize', scheduleGeometry);
      win.visualViewport?.removeEventListener('scroll', scheduleGeometry);
      frame?.remove(); frame = null; probe = null; hasGeometry = false;
    },
  };
}
