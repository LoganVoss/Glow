/* Neon Codex — local renderer UI. Preferences and the persistent frame are independent. */
import {
  STORAGE_KEY, SETTINGS_VERSION, PALETTES, RANGE_CONTROLS,
  defaultPreferences, normalizePreferences, loadPreferences, savePreferences,
  selectPattern, selectPalette,
  randomizePalette, setSolo, paletteOptions, paletteOptionIndex, selectPaletteOption,
  recordProfileEdit, initializeProfile, mergeRemotePreferences, profileVariables, formatValue,
} from './preferences.js';
import { createGlowLayer } from './glow-layer.js';
export * from './preferences.js';

const SLOT_SELECTOR = '[data-neon-settings-slot="v1"]';
const ROW_SELECTOR = '[data-app-shell-frame][data-app-shell-page-surface="true"] > [data-app-shell-workspace-row]';
const OWN_SELECTOR = '[data-neon-settings-root],[data-neon-codex-frame]';

export function startNeonCodex(win = window) {
  if (win.__neonCodexRuntime) return win.__neonCodexRuntime;
  const doc = win.document;
  let storage;
  try { storage = win.localStorage; } catch { storage = null; }
  let preferences = loadPreferences(storage), saveTimer = null, destroyed = false;
  let synchronizedPreferences = normalizePreferences(preferences);
  const colorMedia = win.matchMedia('(prefers-color-scheme: dark)');
  const motionMedia = win.matchMedia('(prefers-reduced-motion: reduce)');
  let panel = null, activeSlot = null, layer = null, nextID = 0;
  let setNativeTheme = null;
  const preparedSlot = doc.createElement('div');

  function effectiveTheme() {
    const explicit = doc.documentElement.getAttribute('data-theme') || doc.body?.getAttribute('data-theme');
    if (explicit === 'light' || explicit === 'dark') return explicit;
    const variant = win.getComputedStyle(doc.documentElement).getPropertyValue('--theme-variant').trim();
    return variant === 'light' || variant === 'dark' ? variant : colorMedia.matches ? 'dark' : 'light';
  }
  let lastActualTheme = effectiveTheme();
  function reducedMotion() {
    const explicit = doc.documentElement.getAttribute('data-reduced-motion');
    return explicit === 'true' || (explicit !== 'false' && motionMedia.matches);
  }
  function element(tag, attrs = {}, children = []) {
    const node = doc.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else node.setAttribute(key, String(value));
    }
    for (const child of children) node.append(typeof child === 'string' ? doc.createTextNode(child) : child);
    return node;
  }
  function makeOverlay(sample = false) {
    const frame = element('div', { 'data-neon-codex-frame': '', 'aria-hidden': 'true' });
    if (sample) frame.classList.add('neon-glow-sample');
    frame.append(element('div', { class: 'neon-glow-blur' }, [element('div', { class: 'neon-glow-color' })]),
      element('div', { class: 'neon-glow-edge' }), element('div', { class: 'neon-glow-depth' }));
    return frame;
  }
  function makeBloom(id) {
    function svgNode(tag, attributes = {}, children = []) {
      const node = doc.createElementNS('http://www.w3.org/2000/svg', tag);
      for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
      for (const child of children) node.append(child);
      return node;
    }
    // OpenAI bloom path: original app asset openai_logo_regular_bounding_box-7d7de901cdaa.svg.
    // The glass material is Neon Codex artwork; the underlying mark belongs to OpenAI.
    const path = "M9.81648 9.47276V7.7074C9.81648 7.55872 9.87226 7.44716 10.0023 7.37291L13.5517 5.32883C14.0348 5.05012 14.6109 4.92009 15.2055 4.92009C17.4354 4.92009 18.8478 6.64833 18.8478 8.48794C18.8478 8.61797 18.8478 8.76665 18.8291 8.91534L15.1497 6.7597C14.9268 6.62967 14.7036 6.62967 14.4807 6.7597L9.81648 9.47276ZM18.1043 16.3484V12.13C18.1043 11.8698 17.9928 11.684 17.7698 11.554L13.1056 8.84091L14.6294 7.96746C14.7594 7.89321 14.871 7.89321 15.001 7.96746L18.5504 10.0115C19.5725 10.6063 20.26 11.8698 20.26 13.0962C20.26 14.5084 19.4238 15.8093 18.1043 16.3482V16.3484ZM8.7201 12.6319L7.19632 11.74C7.06629 11.6657 7.01052 11.5541 7.01052 11.4055V7.31731C7.01052 5.32901 8.53429 3.82371 10.597 3.82371C11.3776 3.82371 12.1021 4.08395 12.7155 4.54847L9.05477 6.66698C8.83183 6.79701 8.72028 6.98282 8.72028 7.24306V12.632L8.7201 12.6319ZM12 14.5273L9.81648 13.3009V10.6993L12 9.47294L14.1833 10.6993V13.3009L12 14.5273ZM13.403 20.1765C12.6224 20.1765 11.8979 19.9163 11.2845 19.4517L14.9452 17.3332C15.1682 17.2032 15.2797 17.0174 15.2797 16.7571V11.3682L16.8221 12.2601C16.9522 12.3343 17.008 12.4459 17.008 12.5946V16.6827C17.008 18.671 15.4655 20.1763 13.403 20.1763V20.1765ZM8.99881 16.0326L5.44944 13.9885C4.42731 13.3938 3.73985 12.1302 3.73985 10.9038C3.73985 9.47294 4.59465 8.19075 5.91396 7.6518V11.8886C5.91396 12.1489 6.02552 12.3347 6.24845 12.4647L10.8942 15.1591L9.37043 16.0326C9.2404 16.1068 9.12884 16.1068 8.99881 16.0326ZM8.79453 19.0801C6.69468 19.0801 5.15225 17.5006 5.15225 15.5494C5.15225 15.4007 5.1709 15.252 5.18938 15.1033L8.85013 17.2218C9.07307 17.3519 9.29618 17.3519 9.51911 17.2218L14.1833 14.5274V16.2928C14.1833 16.4415 14.1276 16.553 13.9975 16.6273L10.4482 18.6714C9.96498 18.9501 9.38891 19.0801 8.79435 19.0801H8.79453ZM13.403 21.2913C15.6515 21.2913 17.5283 19.6933 17.9558 17.5748C20.037 17.0359 21.375 15.0847 21.375 13.0964C21.375 11.7956 20.8176 10.532 19.8141 9.62144C19.907 9.23117 19.9628 8.84091 19.9628 8.45081C19.9628 5.79353 17.8071 3.80506 15.317 3.80506C14.8154 3.80506 14.3322 3.87931 13.849 4.04665C13.0127 3.22898 11.8606 2.70868 10.597 2.70868C8.34848 2.70868 6.47174 4.30671 6.04417 6.42521C3.96297 6.96416 2.625 8.91534 2.625 10.9036C2.625 12.2045 3.18243 13.468 4.1859 14.3786C4.093 14.7688 4.03722 15.1591 4.03722 15.5492C4.03722 18.2065 6.19285 20.195 8.68297 20.195C9.18462 20.195 9.6678 20.1207 10.151 19.9534C10.9871 20.771 12.1393 21.2913 13.403 21.2913Z";
    const fillID = id + '-glass', edgeID = id + '-edge', shadowID = id + '-shadow';
    const stops = [['0%', '#b5bed0'], ['22%', '#f4f5fc'], ['46%', '#c2c8d8'], ['66%', '#ded7e9'], ['82%', '#f1f2f8'], ['100%', '#a7b2c5']];
    const fill = svgNode('linearGradient', { id: fillID, x1: '12%', y1: '0%', x2: '78%', y2: '100%' },
      stops.map(([offset, color]) => svgNode('stop', { offset, 'stop-color': color })));
    const edge = svgNode('linearGradient', { id: edgeID, x1: '0%', y1: '0%', x2: '100%', y2: '100%' }, [
      svgNode('stop', { offset: '0%', 'stop-color': '#ffffff', 'stop-opacity': '.9' }),
      svgNode('stop', { offset: '55%', 'stop-color': '#ffffff', 'stop-opacity': '.24' }),
      svgNode('stop', { offset: '100%', 'stop-color': '#747c98', 'stop-opacity': '.45' }),
    ]);
    const shadow = svgNode('filter', { id: shadowID, x: '-20%', y: '-20%', width: '140%', height: '140%', 'color-interpolation-filters': 'sRGB' }, [
      svgNode('feDropShadow', { dx: '0', dy: '.12', stdDeviation: '.1', 'flood-color': '#596079', 'flood-opacity': '.2' }),
    ]);
    return svgNode('svg', { class: 'neon-preview-bloom', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' }, [
      svgNode('defs', {}, [fill, edge, shadow]),
      svgNode('path', { d: path, fill: 'url(#' + fillID + ')', stroke: 'url(#' + edgeID + ')', 'stroke-width': '.075', filter: 'url(#' + shadowID + ')' }),
    ]);
  }
  function applyOverlay(frame, theme, pattern = preferences.profiles[theme].pattern) {
    const p = preferences.profiles[theme], variables = profileVariables(p);
    // Color scrubbing only changes the target colors. Inspect the animation
    // clock when speed changes, avoiding forced style reads for every hue.
    const durationChanged = frame.isConnected && frame.style.getPropertyValue('--neon-duration') !== variables['--neon-duration'];
    const previous = durationChanged && frame.getAnimations?.().find(animation => animation.animationName === 'neon-glow-orbit');
    const previousDuration = previous?.effect?.getComputedTiming().duration;
    const elapsed = previous?.currentTime;
    for (const [name, value] of Object.entries(variables)) {
      if (frame.style.getPropertyValue(name) !== value) frame.style.setProperty(name, value);
    }
    Object.assign(frame.dataset, { theme, pattern, enabled: String(preferences.enabled), reducedMotion: String(reducedMotion()) });
    if (!durationChanged) return;
    const running = frame.isConnected && frame.getAnimations?.().find(animation => animation.animationName === 'neon-glow-orbit');
    if (!running?.effect) return;
    const duration = running.effect.getComputedTiming().duration;
    if (!(duration > 0) || !Number.isFinite(duration)) return;
    if (running === previous && typeof elapsed === 'number' && previousDuration > 0 && duration !== previousDuration) {
      // Keep the same point in the loop when a slider or preset changes speed.
      running.currentTime = elapsed * duration / previousDuration;
    }
  }
  function persist() {
    saveTimer = null;
    const saved = savePreferences(storage, preferences);
    if (saved) synchronizedPreferences = normalizePreferences(preferences);
    panel?.persistence(saved);
  }
  function queueSave() {
    if (saveTimer !== null) win.clearTimeout(saveTimer);
    saveTimer = win.setTimeout(persist, 120);
  }
  function initializeForTheme(theme) {
    const next = initializeProfile(preferences, theme);
    if (JSON.stringify(next) !== JSON.stringify(preferences)) { preferences = next; queueSave(); }
  }
  function updateRuntime() {
    if (destroyed) return;
    const theme = effectiveTheme();
    if (theme !== lastActualTheme) {
      initializeForTheme(theme); lastActualTheme = theme; panel?.setEditing(theme);
    }
    layer?.update(); panel?.update();
  }
  function changed() { updateRuntime(); queueSave(); }
  function flush() { if (saveTimer !== null) { win.clearTimeout(saveTimer); persist(); } }

  function makePanel() {
    let editing = effectiveTheme(), themeRequest = 0, queuedTheme = null, writingTheme = false;
    const id = `neon-glow-${++nextID}`;
    const root = element('section', { class: 'neon-settings', 'data-neon-settings-root': '', 'aria-labelledby': `${id}-title` });
    function editProfile(edit) {
      preferences.profiles[editing] = edit(preferences.profiles[editing]);
      preferences = recordProfileEdit(preferences, editing);
      changed();
    }
    function switchNode(label) {
      const input = element('input', { type: 'checkbox', role: 'switch', 'aria-label': label });
      return [element('label', { class: 'neon-switch' }, [input, element('span', { class: 'neon-switch-track', 'aria-hidden': 'true' })]), input];
    }
    function icon(paths, className = '') {
      const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
      for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', 'aria-hidden': 'true', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })) svg.setAttribute(key, value);
      if (className) svg.setAttribute('class', className);
      for (const d of paths) {
        const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', d); svg.append(path);
      }
      return svg;
    }
    function animateIcon(svg, keyframes, duration) {
      for (const animation of svg.getAnimations?.() || []) animation.cancel();
      if (!reducedMotion()) svg.animate?.(keyframes, { duration, easing: 'cubic-bezier(.2,.7,.2,1)' });
    }
    const [enableSwitch, enable] = switchNode('Glow');
    root.append(element('div', { class: 'neon-settings-heading' }, [element('h2', { id: `${id}-title`, text: 'Glow' }), enableSwitch]));
    enable.addEventListener('change', () => { preferences.enabled = enable.checked; changed(); });

    const tabs = element('div', { class: 'neon-profile-tabs', role: 'tablist', 'aria-label': 'Glow appearance profile' });
    const tabButtons = {};
    const themeNote = element('p', { class: 'neon-theme-note', role: 'status', text: 'Appearance could not be changed. Try again.' });
    themeNote.hidden = true;
    async function applyThemeRequests() {
      if (writingTheme) return;
      writingTheme = true;
      while (queuedTheme && !destroyed) {
        const { theme, request } = queuedTheme; queuedTheme = null;
        try { await setNativeTheme(theme); }
        catch { if (!destroyed && request === themeRequest) themeNote.hidden = false; }
        if (!destroyed) updateRuntime();
      }
      writingTheme = false;
    }
    function selectTheme(theme) {
      const request = ++themeRequest; themeNote.hidden = true;
      if (setNativeTheme) {
        // Serialize native writes and coalesce intermediate clicks. A slow older
        // write cannot land after the latest requested Light/Dark preference.
        queuedTheme = { theme, request }; void applyThemeRequests();
      } else {
        // The standalone preview owns this event. Native appearance is only
        // changed through the real app controller supplied to mountAppearance.
        win.dispatchEvent(new win.CustomEvent('neon-codex:theme-request', { detail: { theme } }));
        updateRuntime();
      }
    }
    for (const theme of ['light', 'dark']) {
      const button = element('button', { type: 'button', role: 'tab', id: `${id}-${theme}-tab`, 'aria-controls': `${id}-profile`, text: theme === 'light' ? 'Light' : 'Dark' });
      button.addEventListener('click', () => selectTheme(theme));
      button.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const requested = event.key === 'Home' ? 'light' : event.key === 'End' ? 'dark' : theme === 'light' ? 'dark' : 'light';
        tabButtons[requested].focus(); selectTheme(requested);
      });
      tabButtons[theme] = button; tabs.append(button);
    }
    root.append(tabs, themeNote);
    const profilePanel = element('div', { id: `${id}-profile`, role: 'tabpanel', class: 'neon-profile-panel' });
    const preview = element('div', { class: 'neon-settings-preview' });
    const sample = makeOverlay(true);
    preview.append(element('div', { class: 'neon-preview-window' }, [makeBloom(id), sample]));
    profilePanel.append(preview);

    const patterns = element('div', { class: 'neon-pattern-section', role: 'group', 'aria-label': 'Animation' });
    patterns.append(element('div', { class: 'neon-group-label', text: 'Animation' }));
    const patternGrid = element('div', { class: 'neon-pattern-grid' }), patternButtons = [];
    for (const [name, label] of [['pulse', 'Pulse'], ['prism', 'Bloom'], ['signal', 'Ping']]) {
      const frame = makeOverlay(true); frame.classList.add('neon-pattern-sample');
      const button = element('button', { type: 'button', class: 'neon-pattern-card', 'data-pattern': name }, [
        element('span', { class: 'neon-pattern-thumbnail', 'aria-hidden': 'true' }, [frame]), element('span', { text: label }),
      ]);
      button.addEventListener('click', () => editProfile(p => selectPattern(p, name, editing)));
      patternGrid.append(button); patternButtons.push([name, button, frame]);
    }
    patterns.append(patternGrid);

    const palettes = element('div', { class: 'neon-palette-section', role: 'group', 'aria-label': 'Vibe' });
    palettes.append(element('div', { class: 'neon-group-label', text: 'Vibe' }));
    const paletteGrid = element('div', { class: 'neon-palette-grid' }), paletteButtons = [];
    for (const [name, palette] of Object.entries(PALETTES)) {
      const swatch = element('span', { class: 'neon-palette-swatch', 'aria-hidden': 'true' });
      swatch.style.background = `linear-gradient(110deg, ${palette.colors.join(', ')})`;
      const button = element('button', { type: 'button', class: 'neon-palette-card', 'data-palette': name }, [swatch, element('span', { text: palette.label })]);
      button.addEventListener('click', () => editProfile(p => selectPalette(p, name, editing)));
      paletteGrid.append(button); paletteButtons.push([name, button]);
    }
    palettes.append(paletteGrid);

    const editor = element('div', { class: 'neon-custom-editor', id: `${id}-custom-editor`, role: 'group', 'aria-label': 'Glow settings' });
    function makeDice(label, className = '') {
      const button = element('button', { type: 'button', class: `neon-icon-button neon-dice ${className}`, 'aria-label': label, title: label });
      const svg = icon(['M8 4h8a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4Z']);
      for (const [x, y] of [[8, 8], [16, 8], [12, 12], [8, 16], [16, 16]]) {
        const dot = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('cx', x); dot.setAttribute('cy', y); dot.setAttribute('r', 1.1); dot.setAttribute('fill', 'currentColor'); dot.setAttribute('stroke', 'none'); svg.append(dot);
      }
      button.append(svg); return [button, svg];
    }
    function spinDice(svg) {
      animateIcon(svg, [
        { transform: 'rotate(0deg) scale(1)' }, { transform: 'rotate(-15deg) scale(.94)', offset: .2 },
        { transform: 'rotate(190deg) scale(1.05)', offset: .7 }, { transform: 'rotate(360deg) scale(1)' },
      ], 480);
    }
    const dotStage = element('div', { class: 'neon-dot-stage' });
    const colorDots = element('div', { class: 'neon-color-dots', 'aria-hidden': 'true' });
    const dotNodes = Array.from({ length: 6 }, () => {
      const dot = element('span', { class: 'neon-color-dot', 'aria-hidden': 'true' });
      colorDots.append(dot); return dot;
    });
    const [colorDice, colorDiceIcon] = makeDice('Shuffle color selection', 'neon-color-dice');
    const solo = element('button', { type: 'button', class: 'neon-icon-button neon-solo-button', text: '1', 'aria-label': 'Select one color', 'aria-pressed': 'false', title: 'Select one color' });
    solo.addEventListener('click', () => editProfile(p => setSolo(p, !p.solo, editing)));
    function makePaletteBrowserIcon() {
      // Native SF Symbol, rendered through AppKit and tinted by the shared dock.
      return element('span', { class: 'neon-eyedropper-symbol', 'aria-hidden': 'true' });
    }
    const paletteBrowserButton = element('button', { type: 'button', class: 'neon-icon-button neon-palette-browser-button', 'aria-label': 'Color Slider', title: 'Color Slider', 'aria-expanded': 'false', 'aria-controls': `${id}-palette-browser` }, [makePaletteBrowserIcon()]);
    const paletteSlider = element('input', { type: 'range', class: 'neon-glass-slider neon-palette-slider', min: 0, max: 0, step: 1, 'aria-label': 'Color selection' });
    const paletteBrowser = element('div', { id: `${id}-palette-browser`, class: 'neon-palette-browser', 'aria-hidden': 'true' }, [
      paletteSlider,
    ]);
    // Both catalogs are constructed at module load. Prepare their slider tracks
    // with the panel too, so toggles and scrubbing need no asset load or rebuild.
    const soloTracks = Object.fromEntries(Object.keys(PALETTES).map(palette => {
      const options = paletteOptions({ palette, solo: true });
      const track = options.filter((_, i) => i % Math.max(1, Math.floor(options.length / 18)) === 0)
        .map(option => option.colors[option.soloIndex]);
      return [palette, `linear-gradient(90deg, ${track.join(', ')})`];
    }));
    let paletteBrowserOpen = false;
    function setPaletteBrowserOpen(open, focusSlider = false) {
      paletteBrowserOpen = open;
      paletteBrowserButton.setAttribute('aria-expanded', String(open));
      paletteBrowser.dataset.open = String(open); paletteBrowser.setAttribute('aria-hidden', String(!open));
      paletteBrowser.inert = !open; paletteSlider.disabled = !open;
      if (open && focusSlider) paletteSlider.focus({ preventScroll: true });
    }
    paletteBrowserButton.addEventListener('click', event => setPaletteBrowserOpen(!paletteBrowserOpen, event.detail === 0));
    paletteBrowser.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); setPaletteBrowserOpen(false); paletteBrowserButton.focus({ preventScroll: true });
    });
    paletteSlider.addEventListener('input', () => editProfile(p => selectPaletteOption(p, Number(paletteSlider.value), editing)));
    setPaletteBrowserOpen(false);
    dotStage.append(colorDots);
    editor.append(element('div', { class: 'neon-color-selection' }, [
      dotStage, element('div', { class: 'neon-color-actions' }, [solo, paletteBrowserButton, colorDice]),
      element('div', { class: 'neon-palette-browser-space' }, [paletteBrowser]),
    ]));

    let constellationCount = 0, constellationToken = 0, colorSignature = '';
    const formations = ['smile', 'orbit', 'smile', 'smile', 'flower', 'smile', 'smile', 'wave', 'smile'];
    function cancelConstellation() {
      ++constellationToken; colorDots.removeAttribute('data-constellation');
      for (const dot of dotNodes) for (const animation of dot.getAnimations?.() || []) {
        // A color scrub keeps its short transition while a formation is replaced.
        if (!win.CSSTransition || !(animation instanceof win.CSSTransition)) animation.cancel();
      }
    }
    function currentDotStates() {
      return dotNodes.map(dot => {
        const transform = win.getComputedStyle(dot).transform;
        const matrix = transform === 'none' ? null : new win.DOMMatrixReadOnly(transform);
        return { x: dot.offsetLeft + dot.offsetWidth / 2 + (matrix?.m41 || 0),
          y: dot.offsetTop + dot.offsetHeight / 2 + (matrix?.m42 || 0),
          sx: matrix ? Math.hypot(matrix.m11, matrix.m12) : 1,
          sy: matrix ? Math.hypot(matrix.m21, matrix.m22) : 1 };
      });
    }
    function animateConstellation(starts) {
      cancelConstellation();
      const width = dotStage.clientWidth, height = dotStage.clientHeight;
      if (reducedMotion() || !dotNodes[0].animate || !width || !height) return;
      const token = constellationToken, shape = formations[constellationCount++ % formations.length];
      const smooth = t => t * t * (3 - 2 * t);
      const mix = (a, b, t) => a + (b - a) * t;
      function pose(i, t) {
        const eased = smooth(t), breathe = Math.sin(Math.PI * eased);
        let x, y, sx = 1, sy = 1;
        if (shape === 'smile') {
          [x, y] = [[-30, -39], [30, -39], [-84, 20], [-31, 49], [31, 49], [84, 20]][i];
          const settle = breathe * Math.sin(t * Math.PI * 2 + i * .45);
          x += settle * (i < 2 ? 1.2 : 2); y += settle * (i < 2 ? 1.5 : 2.5);
          if (i < 2) { const blink = Math.pow(breathe, 8) * .14; sx += blink * .2; sy -= blink; }
          else sx = sy = 1 + settle * .04;
        } else if (shape === 'orbit') {
          const angle = (-90 + i * 60 + smooth(t) * 125) * Math.PI / 180, radius = 44 + breathe * 2;
          x = Math.cos(angle) * radius; y = Math.sin(angle) * radius; sx = sy = 1 + breathe * .025;
        } else if (shape === 'flower') {
          const angle = (-90 + i * 72 + breathe * 8) * Math.PI / 180, radius = 30 + breathe * 14;
          x = i === 5 ? 0 : Math.cos(angle) * radius; y = i === 5 ? 0 : Math.sin(angle) * radius;
          sx = sy = i === 5 ? 1 + breathe * .09 : .97 + breathe * .1;
        } else {
          x = (i / 5 - .5) * 150; y = Math.sin(i * 1.05 - eased * Math.PI * 2) * 25;
          sx = sy = 1 + breathe * Math.sin(i * .7 - t * Math.PI * 2) * .035;
        }
        const shapeScale = Math.min(1, Math.max(0, width - 40) / 180, Math.max(0, height - 20) / 108);
        return { x: width / 2 + x * shapeScale, y: height / 2 - (shape === 'smile' ? 4 : 0) + y * shapeScale, sx, sy };
      }
      function curve(from, to, t, bend) {
        const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy) || 1;
        const cx = (from.x + to.x) / 2 - dy / length * bend;
        const cy = (from.y + to.y) / 2 + dx / length * bend;
        const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
        return { x: a * from.x + b * cx + c * to.x, y: a * from.y + b * cy + c * to.y,
          sx: mix(from.sx, to.sx, t), sy: mix(from.sy, to.sy, t) };
      }
      colorDots.dataset.constellation = shape;
      const animations = dotNodes.map((dot, i) => {
        const halfWidth = dot.offsetWidth / 2, halfHeight = dot.offsetHeight / 2;
        const base = { x: dot.offsetLeft + halfWidth, y: dot.offsetTop + halfHeight, sx: 1, sy: 1 };
        const first = pose(i, 0), last = pose(i, 1), gatherEnd = .32 + i % 3 * .02, returnStart = .70 + i % 3 * .015;
        // Sampling a continuous path gives each dot a curved, staggered entrance
        // and a moving formation. Every keyframe includes its transient scale in
        // the bounds; linear interpolation between these safe states stays safe.
        const offsets = [...new Set([0, gatherEnd, returnStart, 1, ...Array.from({ length: 49 }, (_, j) => j / 48)])].sort((a, b) => a - b);
        const keyframes = offsets.map(offset => {
          let state;
          if (offset <= gatherEnd) state = curve(starts[i], first, 1 - Math.pow(1 - offset / gatherEnd, 3), (i % 2 ? -1 : 1) * 28);
          else if (offset < returnStart) state = pose(i, (offset - gatherEnd) / (returnStart - gatherEnd));
          else state = curve(last, base, smooth((offset - returnStart) / (1 - returnStart)), (i % 2 ? 1 : -1) * 19);
          const insetX = halfWidth * state.sx + 6, insetY = halfHeight * state.sy + 6;
          const cx = Math.max(insetX, Math.min(width - insetX, state.x));
          const cy = Math.max(insetY, Math.min(height - insetY, state.y));
          return { offset, transform: `translate(${cx - base.x}px, ${cy - base.y}px) scale(${state.sx}, ${state.sy})` };
        });
        return dot.animate(keyframes, { duration: 1140, easing: 'linear' });
      });
      Promise.all(animations.map(animation => animation.finished.catch(() => {}))).then(() => {
        if (!destroyed && token === constellationToken) colorDots.removeAttribute('data-constellation');
      });
    }
    colorDice.addEventListener('click', () => {
      const starts = currentDotStates();
      editProfile(p => randomizePalette(p, Math.random, editing));
      animateConstellation(starts); spinDice(colorDiceIcon);
    });
    // A changed container makes old translations invalid. Return to the centered
    // grid before paint; clipping remains a final guard during host layout work.
    const stageObserver = new win.ResizeObserver(cancelConstellation);
    stageObserver.observe(dotStage);
    // The settings container can change dot sizing at a responsive breakpoint.
    stageObserver.observe(root);
    win.addEventListener('resize', cancelConstellation);
    const ranges = element('div', { class: 'neon-range-grid' }), rangeNodes = [];
    for (const control of RANGE_CONTROLS) {
      const input = element('input', { type: 'range', class: 'neon-glass-slider', id: `${id}-${control.key}`, min: control.min, max: control.max, step: control.step });
      const output = element('output', { for: input.id, 'aria-hidden': 'true' });
      const caption = element('span', { class: 'neon-range-caption' }, [element('span', { text: control.label })]);
      input.addEventListener('input', () => {
        editProfile(p => ({ ...p, [control.key]: Number(input.value) }));
      });
      const field = element('div', { class: 'neon-range-field' }, [element('label', { class: 'neon-range-label', for: input.id }, [caption, output]), input]);
      ranges.append(field); rangeNodes.push([control, input, output]);
    }
    editor.append(palettes, patterns, ranges); profilePanel.append(editor);
    function cancelFlourishes() {
      cancelConstellation();
      for (const animation of colorDiceIcon.getAnimations?.() || []) animation.cancel();
    }
    const motionNote = element('p', { class: 'neon-motion-note', text: 'Animation is paused by your Reduce motion preference.' });
    const persistenceNote = element('p', { class: 'neon-storage-note', role: 'status', text: 'Storage is unavailable. These settings will last until this window closes.' });
    persistenceNote.hidden = Boolean(storage);
    profilePanel.append(motionNote, persistenceNote); root.append(profilePanel);

    function update() {
      const p = preferences.profiles[editing], active = effectiveTheme();
      const nextSignature = JSON.stringify([editing, p.palette, p.solo, p.soloIndex, p.colors, p.enabledColors]);
      const colorsChanged = colorSignature !== nextSignature;
      if (colorSignature && colorsChanged) cancelFlourishes();
      colorSignature = nextSignature;
      enable.checked = preferences.enabled;
      root.dataset.editingTheme = editing; root.dataset.theme = active; root.dataset.glowEnabled = String(preferences.enabled);
      for (const [theme, button] of Object.entries(tabButtons)) {
        button.setAttribute('aria-selected', String(theme === editing)); button.tabIndex = theme === editing ? 0 : -1;
      }
      profilePanel.setAttribute('aria-labelledby', tabButtons[editing].id); preview.dataset.theme = editing;
      applyOverlay(sample, editing);
      for (const [name, button, frame] of patternButtons) {
        button.setAttribute('aria-pressed', String(p.pattern === name)); applyOverlay(frame, editing, name); frame.dataset.enabled = 'true';
      }
      for (const [name, button] of paletteButtons) button.setAttribute('aria-pressed', String(p.palette === name));
      root.dataset.solo = String(p.solo); solo.setAttribute('aria-pressed', String(p.solo));
      if (colorsChanged) {
        dotNodes.forEach((dot, i) => dot.style.setProperty('--neon-swatch', p.colors[p.solo ? p.soloIndex : i]));
        const colorOptions = paletteOptions(p), colorIndex = paletteOptionIndex(p);
        paletteSlider.max = String(colorOptions.length - 1); paletteSlider.value = String(colorIndex);
        paletteSlider.style.setProperty('--neon-range-progress', `${100 * colorIndex / Math.max(1, colorOptions.length - 1)}%`);
        if (p.solo) paletteSlider.style.setProperty('--neon-palette-track', soloTracks[p.palette]);
        else paletteSlider.style.removeProperty('--neon-palette-track');
      }
      for (const [control, input, output] of rangeNodes) {
        input.value = String(p[control.key]); const formatted = formatValue(control, p[control.key]);
        output.textContent = formatted; input.setAttribute('aria-valuetext', formatted);
        input.style.setProperty('--neon-range-progress', `${100 * (p[control.key] - control.min) / (control.max - control.min)}%`);
      }
      motionNote.hidden = !reducedMotion();
      if (reducedMotion()) cancelFlourishes();
    }
    update();
    return { root, update, setEditing(theme) { if (editing !== theme) cancelFlourishes(); editing = theme; }, persistence(saved) { persistenceNote.hidden = saved; }, destroy() { stageObserver.disconnect(); win.removeEventListener('resize', cancelConstellation); cancelFlourishes(); root.remove(); } };
  }

  // Build the complete panel before its route is visible. React's ref only moves
  // this prepared node, so the first Appearance frame contains the controls.
  panel = makePanel(); preparedSlot.append(panel.root);
  layer = createGlowLayer(win, { makeOverlay, applyOverlay, getTheme: effectiveTheme });

  function mountAppearance(slot, options = {}) {
    if (destroyed || !slot || slot.ownerDocument !== doc) return;
    if (typeof options.setTheme === 'function') setNativeTheme = options.setTheme;
    const theme = effectiveTheme(); initializeForTheme(theme); panel.setEditing(theme);
    activeSlot = slot;
    if (panel.root.parentElement !== slot) slot.append(panel.root);
    updateRuntime();
  }
  function reconcile() {
    if (destroyed || !doc.body) return;
    layer.reconcile();
    if (activeSlot && (!activeSlot.isConnected || panel.root.parentElement !== activeSlot)) {
      if (!panel.root.isConnected) preparedSlot.append(panel.root);
      activeSlot = null;
    }
    const slots = doc.querySelectorAll(SLOT_SELECTOR);
    if (!activeSlot && slots.length) mountAppearance(slots[slots.length - 1]);
    updateRuntime();
  }
  const structureObserver = new win.MutationObserver(records => {
    if (destroyed) return;
    const globalFrame = layer.getFrame();
    if (globalFrame && !globalFrame.isConnected) { reconcile(); return; }
    if (activeSlot && (!activeSlot.isConnected || panel.root.parentElement !== activeSlot)) { reconcile(); return; }
    let examined = 0;
    for (const mutation of records) {
      if (mutation.target.nodeType === 1 && mutation.target.closest(OWN_SELECTOR)) continue;
      if (mutation.type === 'attributes') { reconcile(); return; }
      for (const node of [...mutation.addedNodes, ...mutation.removedNodes]) {
        if (node.nodeType !== 1 || node.matches(OWN_SELECTOR)) continue;
        if (++examined > 64 || node.matches(`${SLOT_SELECTOR},${ROW_SELECTOR}`) || node.querySelector(`${SLOT_SELECTOR},${ROW_SELECTOR}`)) {
          reconcile(); return;
        }
      }
    }
  });
  const themeObserver = new win.MutationObserver(updateRuntime);
  function storageChanged(event) {
    if ((event.key === STORAGE_KEY || event.key === null) && (event.storageArea == null || event.storageArea === storage)) {
      const remote = loadPreferences(storage);
      preferences = mergeRemotePreferences(preferences, synchronizedPreferences, remote);
      synchronizedPreferences = remote; updateRuntime();
    }
  }
  function ready() {
    if (destroyed) return;
    structureObserver.observe(doc.body, { childList: true, subtree: true, attributes: true,
      attributeFilter: ['data-app-shell-frame', 'data-app-shell-page-surface', 'data-app-shell-workspace-row', 'data-neon-settings-slot'] });
    themeObserver.observe(doc.body, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
    reconcile();
  }
  const runtime = {
    version: SETTINGS_VERSION, mountAppearance,
    getPreferences() { return normalizePreferences(preferences); },
    reset() { preferences = defaultPreferences(); changed(); },
    destroy() {
      if (destroyed) return; flush(); destroyed = true;
      structureObserver.disconnect(); themeObserver.disconnect(); layer.destroy(); panel.destroy();
      colorMedia.removeEventListener('change', updateRuntime); motionMedia.removeEventListener('change', updateRuntime);
      win.removeEventListener('storage', storageChanged); win.removeEventListener('pagehide', flush); doc.removeEventListener('DOMContentLoaded', ready);
      activeSlot = null; delete win.__neonCodexRuntime;
    },
  };
  win.__neonCodexRuntime = runtime;
  themeObserver.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style', 'data-reduced-motion', 'data-codex-window-type'] });
  colorMedia.addEventListener('change', updateRuntime); motionMedia.addEventListener('change', updateRuntime);
  win.addEventListener('storage', storageChanged); win.addEventListener('pagehide', flush);
  if (doc.body) ready(); else doc.addEventListener('DOMContentLoaded', ready, { once: true });
  return runtime;
}
if (typeof window !== 'undefined' && !window.__NEON_CODEX_DISABLE_AUTOBOOT__) startNeonCodex(window);
