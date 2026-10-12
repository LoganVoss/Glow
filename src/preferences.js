/* Neon Codex — pure, versioned, local preferences and color operations. */
export const STORAGE_KEY = 'neon-codex:preferences:v1';
export const SETTINGS_VERSION = 5;
export const PATTERNS = Object.freeze(['prism', 'pulse', 'signal']);
export const PALETTES = Object.freeze({
  soft: { label: 'Soft', colors: ['#d6abea', '#eab2c6', '#efc9a3', '#d6dcb6', '#a7dccc', '#a8d0ed'] },
  vivid: { label: 'Neon', colors: ['#b572ff', '#f06ac6', '#ff9b72', '#f3d96a', '#6fdfb6', '#69b6ff'] },
});
// Deliberately composed hue families, not unconstrained random RGB values.
// Soft uses matte pastels; Neon keeps the same relationships with more chroma.
const FAMILY_HUES = Object.freeze([
  ['rosewater', [310, 324, 340, 356, 12, 26]],
  ['lagoon', [154, 167, 180, 193, 206, 220]],
  ['iris', [218, 230, 244, 258, 272, 286]],
  ['citrus', [20, 32, 45, 58, 71, 84]],
  ['meadow', [78, 93, 109, 124, 139, 153]],
  ['twilight', [255, 279, 303, 327, 351, 15]],
  ['coast', [174, 190, 207, 223, 240, 256]],
  ['opal', [24, 52, 112, 170, 210, 270]],
  ['blush', [334, 342, 351, 1, 10, 19]],
  ['peach', [352, 2, 12, 22, 32, 42]],
  ['apricot', [6, 15, 24, 34, 44, 54]],
  ['golden-hour', [28, 37, 46, 55, 64, 73]],
  ['lemongrass', [48, 60, 72, 84, 96, 108]],
  ['fern', [99, 108, 117, 127, 137, 147]],
  ['mint', [128, 139, 150, 161, 172, 183]],
  ['sea-glass', [145, 155, 165, 175, 185, 195]],
  ['aqua', [163, 174, 185, 196, 207, 218]],
  ['glacier', [185, 193, 201, 209, 217, 225]],
  ['blue-hour', [202, 213, 224, 235, 246, 257]],
  ['periwinkle', [223, 232, 241, 250, 259, 268]],
  ['wisteria', [243, 253, 263, 273, 283, 293]],
  ['orchid', [269, 279, 289, 299, 309, 319]],
  ['sorbet', [292, 310, 328, 346, 4, 22]],
  ['coral-reef', [352, 14, 36, 154, 176, 198]],
  ['daydream', [277, 307, 337, 37, 167, 207]],
  ['aurora', [124, 153, 182, 211, 240, 269]],
  ['wildflower', [258, 282, 306, 54, 90, 126]],
  ['pearl', [330, 24, 66, 150, 204, 270]],
  ['blue-lagoon', [174, 186, 198, 210, 266, 278]],
  ['rose-gold', [304, 324, 344, 4, 28, 48]],
  ['sunset', [268, 291, 314, 337, 0, 23]],
  ['borealis', [83, 119, 155, 191, 227, 263]],
]);
export const RANGE_CONTROLS = Object.freeze([
  { key: 'thickness', label: 'Thickness', min: 0.5, max: 6, step: 0.1, unit: 'px' },
  { key: 'spread', label: 'Spread', min: 0, max: 24, step: 0.5, unit: 'px' },
  { key: 'intensity', label: 'Intensity', min: 0, max: 1, step: 0.01, unit: '%' },
  { key: 'saturation', label: 'Saturation', min: 0, max: 2, step: 0.01, unit: '%' },
  { key: 'gloss', label: 'Gloss', min: 0, max: 1, step: 0.01, unit: '%' },
  { key: 'speed', label: 'Animation Speed', min: 0.25, max: 6, step: 0.05, unit: '×' },
]);
// Preserve saved depth tuning. Global hue rotation is retired and always zero.
const PROFILE_RANGES = Object.freeze([
  ...RANGE_CONTROLS,
  { key: 'depth', min: 0, max: 1 },
]);
const PALETTE_KEYS = Object.keys(PALETTES);
const HEX = /^#[0-9a-f]{6}$/i;
const allEnabled = () => Array(6).fill(true);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
const validTheme = theme => theme === 'light' || theme === 'dark';
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const familyLabel = id => id.split('-').map(word => word[0].toUpperCase() + word.slice(1)).join(' ');
export const COLOR_FAMILIES = Object.freeze(Object.fromEntries(Object.keys(PALETTES).map(vibe => [vibe, Object.freeze([
  Object.freeze({ id: 'signature', label: 'Signature', colors: Object.freeze([...PALETTES[vibe].colors]) }),
  ...FAMILY_HUES.map(([id, hues]) => Object.freeze({ id, label: familyLabel(id), colors: Object.freeze(hues.map((h, i) =>
    hslToHex(h, vibe === 'soft' ? 0.48 + (i % 3) * 0.035 : 0.79 + (i % 3) * 0.04,
      vibe === 'soft' ? 0.79 + (i % 2) * 0.025 : 0.64 + (i % 2) * 0.035))) })),
])])));
const PALETTE_OPTIONS = Object.freeze(Object.fromEntries(PALETTE_KEYS.map(vibe => [vibe, Object.freeze({
  multi: COLOR_FAMILIES[vibe],
  solo: (() => {
    const seen = new Set(), options = [];
    for (const family of COLOR_FAMILIES[vibe]) family.colors.forEach((color, soloIndex) => {
      if (seen.has(color)) return;
      seen.add(color);
      options.push(Object.freeze({ id: `${family.id}:${soloIndex}`, label: `${family.label} ${soloIndex + 1}`,
        colors: family.colors, soloIndex }));
    });
    // A single-color slider travels around the spectrum rather than jumping
    // through the order of unrelated six-color families.
    return Object.freeze(options.sort((a, b) => hexToHsl(a.colors[a.soloIndex]).h - hexToHsl(b.colors[b.soloIndex]).h));
  })(),
})])));

export function paletteOptions(profile) {
  const p = normalizeProfile(profile);
  return PALETTE_OPTIONS[p.palette][p.solo ? 'solo' : 'multi'];
}
const sameColors = (a, b) => a.every((color, i) => color === b[i]);
function colorCoordinates(hex) {
  const [r, g, b] = [1, 3, 5].map(offset => {
    const v = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
export function paletteOptionIndex(profile) {
  const p = normalizeProfile(profile), options = paletteOptions(p);
  const exact = options.findIndex(option => p.solo
    ? option.colors[option.soloIndex] === p.colors[p.soloIndex] : sameColors(option.colors, p.colors));
  if (exact !== -1) return exact;
  const current = (p.solo ? [p.colors[p.soloIndex]] : p.colors).map(colorCoordinates);
  let closest = 0, distance = Infinity;
  options.forEach((option, index) => {
    const colors = p.solo ? [option.colors[option.soloIndex]] : option.colors;
    const candidate = colors.reduce((sum, color, i) => sum + colorCoordinates(color)
      .reduce((squared, coordinate, axis) => squared + (coordinate - current[i][axis]) ** 2, 0), 0);
    if (candidate < distance) { closest = index; distance = candidate; }
  });
  return closest;
}
export function selectPaletteOption(profile, index, theme = 'light') {
  const next = normalizeProfile(profile, theme), options = paletteOptions(next);
  if (!Number.isInteger(index) || index < 0 || index >= options.length) return next;
  const option = options[index];
  next.paletteFamily = option.id.split(':')[0]; next.colors = [...option.colors];
  if (next.solo) next.soloIndex = option.soloIndex;
  return storeCurrentCustom(next);
}

export function defaultProfile(_theme = 'light') {
  return {
    thickness: 1.2, spread: 7.5, intensity: 0.65, saturation: 1.6,
    hue: 0, depth: 0.77, gloss: 1, speed: 2.05,
    pattern: 'prism', reverse: false, palette: 'vivid', paletteFamily: 'signature', colors: [...PALETTES.vivid.colors],
    solo: false, soloIndex: 0,
    enabledColors: allEnabled(), customEnabled: false, customConfigured: false,
    customColors: [...PALETTES.vivid.colors], customEnabledColors: allEnabled(),
  };
}
export function defaultPreferences() {
  return { version: SETTINGS_VERSION, enabled: true, setup: { source: null, complete: false },
    profiles: { light: defaultProfile(), dark: defaultProfile() } };
}
function normalizeColors(value, fallback) {
  return Array.isArray(value) && value.length === 6
    ? value.map((color, i) => typeof color === 'string' && HEX.test(color) ? color.toLowerCase() : fallback[i])
    : [...fallback];
}
export function normalizeEnabledColors(value, fallback = allEnabled()) {
  const mask = Array.isArray(value) && value.length === 6
    ? value.map((enabled, i) => typeof enabled === 'boolean' ? enabled : Boolean(fallback[i])) : [...fallback];
  if (!mask.some(Boolean)) mask[0] = true;
  return mask;
}
export function normalizeProfile(value, theme = 'light') {
  const input = record(value), result = defaultProfile(theme);
  for (const control of PROFILE_RANGES) {
    const v = input[control.key];
    if (typeof v === 'number' && Number.isFinite(v)) result[control.key] = clamp(v, control.min, control.max);
  }
  const pattern = { spectrum: 'pulse', aurora: 'pulse', mono: 'pulse', ribbon: 'prism' }[input.pattern] ?? input.pattern;
  if (PATTERNS.includes(pattern)) result.pattern = pattern;
  // Direction was retired; it must not survive a saved v4 appearance.
  result.reverse = false;
  if (PALETTE_KEYS.includes(input.palette)) result.palette = input.palette;
  result.colors = normalizeColors(input.colors, PALETTES[result.palette].colors);
  if (input.palette === 'cool' || input.palette === 'dusk') result.palette = nearestVibe(result.colors);
  const family = COLOR_FAMILIES[result.palette].find(f => f.id === input.paletteFamily)
    ?? COLOR_FAMILIES[result.palette].find(f => f.colors.every((color, i) => color === result.colors[i]));
  result.paletteFamily = family?.id ?? null;
  result.solo = input.solo === true;
  if (Number.isInteger(input.soloIndex) && input.soloIndex >= 0 && input.soloIndex < 6) result.soloIndex = input.soloIndex;
  result.enabledColors = normalizeEnabledColors(input.enabledColors);
  result.customColors = normalizeColors(input.customColors, result.colors);
  result.customEnabledColors = normalizeEnabledColors(input.customEnabledColors, result.enabledColors);
  result.customEnabled = typeof input.customEnabled === 'boolean' ? input.customEnabled : false;
  result.customConfigured = typeof input.customConfigured === 'boolean' ? input.customConfigured : result.customEnabled;
  if (result.customEnabled) result.customConfigured = true;
  return result;
}
function nearestVibe(colors) {
  const appearance = list => list.map(hexToHsl).reduce((a, c) => ({ s: a.s + c.s / 6, l: a.l + c.l / 6 }), { s: 0, l: 0 });
  const current = appearance(colors);
  return PALETTE_KEYS.reduce((best, vibe) => {
    const candidate = appearance(PALETTES[vibe].colors), distance = 2 * (candidate.s - current.s) ** 2 + (candidate.l - current.l) ** 2;
    return distance < best.distance ? { vibe, distance } : best;
  }, { vibe: 'vivid', distance: Infinity }).vibe;
}
function legacyDefaults(theme, version) {
  const dark = theme === 'dark';
  const colors = version === 1 ? ['#bba2ed', '#dbafd9', '#ebccb1', '#cbd8b7', '#a9d8ca', '#a4d2e5'] : PALETTES.soft.colors;
  return { thickness: dark ? 1.2 : 1.6, spread: dark ? 7 : 6, intensity: dark ? 0.52 : 0.72,
    saturation: dark ? 0.78 : 0.85, hue: 0, depth: dark ? 0.14 : 0.18, gloss: dark ? 0.16 : 0.24,
    speed: dark ? 36 / 44 : 1, pattern: 'spectrum', palette: 'soft', colors: [...colors], customColors: [...colors] };
}
export function migrateLegacyProfile(value, theme = 'light', version = 1) {
  const input = record(value), legacy = { ...legacyDefaults(theme, version), ...input };
  if (version === 1 && typeof input.duration === 'number' && Number.isFinite(input.duration)) legacy.speed = 36 / clamp(input.duration, 6, 120);
  if (input.pattern === 'aurora' || input.pattern === 'mono') legacy.pattern = 'spectrum';
  const custom = !['soft', 'cool', 'dusk', 'vivid'].includes(legacy.palette);
  if (custom) legacy.palette = 'vivid';
  legacy.customEnabled = custom;
  // Older versions already maintained a meaningful custom bank, including
  // currently unselected colors; treat that bank as configured on migration.
  legacy.customConfigured = true;
  legacy.customColors = version === 1 ? legacy.colors : (input.customColors ?? legacy.colors);
  const profile = normalizeProfile(legacy, theme);
  if (version === 1 && input.pattern === 'mono') { profile.colors = Array(6).fill(profile.colors[0]); profile.customEnabled = true; }
  return profile;
}
export function normalizePreferences(value) {
  const input = record(value);
  if (![1, 2, 3, 4, SETTINGS_VERSION].includes(input.version)) return defaultPreferences();
  const old = input.version < 3, setup = record(input.setup);
  const normalize = (profile, theme) => old ? migrateLegacyProfile(profile, theme, input.version) : normalizeProfile(profile, theme);
  return {
    version: SETTINGS_VERSION, enabled: typeof input.enabled === 'boolean' ? input.enabled : true,
    setup: old ? { source: null, complete: true } : { source: validTheme(setup.source) ? setup.source : null, complete: setup.complete === true },
    profiles: { light: normalize(record(input.profiles).light, 'light'), dark: normalize(record(input.profiles).dark, 'dark') },
  };
}
export function initializeProfile(preferences, theme) {
  const next = normalizePreferences(preferences);
  if (validTheme(theme) && !next.setup.complete && next.setup.source && next.setup.source !== theme) {
    next.profiles[theme] = normalizeProfile(next.profiles[next.setup.source], theme);
    next.setup.complete = true;
  }
  return next;
}
export function recordProfileEdit(preferences, theme) {
  const next = normalizePreferences(preferences);
  if (validTheme(theme) && !next.setup.complete && next.setup.source === null) next.setup.source = theme;
  return next;
}
export function loadPreferences(storage) {
  try { return normalizePreferences(JSON.parse(storage.getItem(STORAGE_KEY))); } catch { return defaultPreferences(); }
}
export function savePreferences(storage, preferences) {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(normalizePreferences(preferences))); return true; } catch { return false; }
}
export function selectPattern(profile, pattern, theme = 'light') {
  const next = normalizeProfile(profile, theme);
  if (PATTERNS.includes(pattern)) next.pattern = pattern;
  return next;
}
export function setCustomEnabled(profile, enabled, theme = 'light') {
  const next = normalizeProfile(profile, theme);
  if (typeof enabled !== 'boolean' || enabled === next.customEnabled) return next;
  if (enabled) {
    if (!next.customConfigured) { next.customColors = [...next.colors]; next.customEnabledColors = [...next.enabledColors]; }
    next.colors = [...next.customColors]; next.enabledColors = [...next.customEnabledColors]; next.customConfigured = true;
  } else { next.colors = [...PALETTES[next.palette].colors]; next.enabledColors = allEnabled(); }
  next.customEnabled = enabled;
  return next;
}
export function selectPalette(profile, palette, theme = 'light') {
  if (palette === 'custom') return setCustomEnabled(profile, true, theme);
  const next = normalizeProfile(profile, theme);
  if (PALETTE_KEYS.includes(palette)) {
    next.palette = palette; next.paletteFamily = 'signature'; next.colors = [...PALETTES[palette].colors];
    // Vibe changes color alone: an intentional mask and Solo selection remain.
    if (next.customEnabled) { next.customColors = [...next.colors]; next.customEnabledColors = [...next.enabledColors]; }
  }
  return next;
}
function storeCurrentCustom(next) {
  next.customEnabled = true; next.customConfigured = true;
  next.customColors = [...next.colors]; next.customEnabledColors = [...next.enabledColors];
  return next;
}
export function updateCustomColor(profile, index, color, theme = 'light') {
  const next = normalizeProfile(profile, theme);
  if (!Number.isInteger(index) || index < 0 || index > 5 || typeof color !== 'string' || !HEX.test(color)) return next;
  next.colors[index] = color.toLowerCase();
  next.paletteFamily = null;
  return storeCurrentCustom(next);
}
export function setColorEnabled(profile, index, enabled, theme = 'light') {
  const next = normalizeProfile(profile, theme);
  if (!Number.isInteger(index) || index < 0 || index > 5 || typeof enabled !== 'boolean') return next;
  if (!enabled && next.enabledColors[index] && next.enabledColors.filter(Boolean).length === 1) return next;
  next.enabledColors[index] = enabled;
  return storeCurrentCustom(next);
}
export function setSolo(profile, enabled, theme = 'light') {
  const next = normalizeProfile(profile, theme);
  if (typeof enabled !== 'boolean') return next;
  next.solo = enabled;
  return next;
}
export function selectSoloColor(profile, index, theme = 'light') {
  const next = normalizeProfile(profile, theme);
  if (Number.isInteger(index) && index >= 0 && index < 6) next.soloIndex = index;
  return next;
}
export function activeColors(profile) {
  const p = normalizeProfile(profile);
  if (p.solo) return [p.colors[p.soloIndex]];
  // Color dots are decorative. Retain old masks for compatibility, but never
  // let an invisible legacy selection omit colors from the multi-color look.
  return [...p.colors];
}
export function hexToHsl(hex) {
  const safe = typeof hex === 'string' && HEX.test(hex) ? hex : '#000000';
  const [r, g, b] = [1, 3, 5].map(offset => Number.parseInt(safe.slice(offset, offset + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min, l = (max + min) / 2;
  let h = 0;
  if (delta) h = max === r ? ((g - b) / delta + 6) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return { h: h * 60, s: delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1)), l };
}
export function hslToHex(h, s, l) {
  h = Number.isFinite(h) ? ((h % 360) + 360) % 360 : 0;
  s = Number.isFinite(s) ? clamp(s, 0, 1) : 0; l = Number.isFinite(l) ? clamp(l, 0, 1) : 0;
  const chroma = (1 - Math.abs(2 * l - 1)) * s, x = chroma * (1 - Math.abs((h / 60) % 2 - 1)), m = l - chroma / 2;
  const rgb = h < 60 ? [chroma, x, 0] : h < 120 ? [x, chroma, 0] : h < 180 ? [0, chroma, x] : h < 240 ? [0, x, chroma] : h < 300 ? [x, 0, chroma] : [chroma, 0, x];
  return '#' + rgb.map(v => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}
export function setColorHue(profile, index, hue, theme = 'light') {
  const next = normalizeProfile(profile, theme);
  if (!Number.isInteger(index) || index < 0 || index > 5 || !Number.isFinite(hue)) return next;
  const { s, l } = hexToHsl(next.colors[index]);
  return updateCustomColor(next, index, hslToHex(hue, s, l), theme);
}
function randomSource(rng) {
  return () => { const value = rng(); return Number.isFinite(value) ? clamp(value, 0, 0.999999999) : 0.5; };
}
export function randomizePalette(profile, rng = Math.random, theme = 'light') {
  const next = normalizeProfile(profile, theme), random = randomSource(rng);
  const options = paletteOptions(next), choices = options.map((_, i) => i).filter(index => next.solo
    ? options[index].colors[options[index].soloIndex] !== next.colors[next.soloIndex]
    : !sameColors(options[index].colors, next.colors));
  return choices.length ? selectPaletteOption(next, choices[Math.floor(random() * choices.length)], theme) : next;
}
export function mergeRemotePreferences(local, baseline, remote) {
  const current = normalizePreferences(local), previous = normalizePreferences(baseline), merged = normalizePreferences(remote);
  if (current.enabled !== previous.enabled) merged.enabled = current.enabled;
  const remoteSetup = merged.setup;
  if (JSON.stringify(current.setup) !== JSON.stringify(previous.setup)) {
    merged.setup = { ...current.setup };
    // A pending first edit cannot undo a copy already completed elsewhere.
    if (remoteSetup.complete && !previous.setup.complete) merged.setup.complete = true;
  }
  // Opposite first edits in separate windows mean both profiles have already
  // been deliberately tuned. Retain them rather than copying either over the other.
  if (current.setup.source && remoteSetup.source && current.setup.source !== remoteSetup.source) merged.setup.complete = true;
  for (const theme of ['light', 'dark']) for (const key of Object.keys(current.profiles[theme])) {
    const value = current.profiles[theme][key], before = previous.profiles[theme][key];
    if (JSON.stringify(value) !== JSON.stringify(before)) merged.profiles[theme][key] = Array.isArray(value) ? [...value] : value;
  }
  // Reapply profile invariants after combining fields from separate windows.
  return normalizePreferences(merged);
}
const decimal = value => Number(value.toFixed(10)).toString();
export function profileVariables(profile) {
  const p = normalizeProfile(profile), colors = activeColors(p), count = colors.length;
  // Reference the interpolated color channels, never bake target hex values
  // into a gradient. The same six stops also let Solo gently converge to one
  // color without changing gradient geometry mid-transition.
  const conic = arc => [...Array.from({ length: 6 }, (_, i) => `var(--neon-color-${i + 1}) ${decimal(i * arc / 6)}deg`), `var(--neon-color-1) ${arc}deg`].join(', ');
  const vars = {
    '--neon-thickness': `${p.thickness}px`, '--neon-spread': `${p.spread}px`, '--neon-intensity': String(p.intensity),
    '--neon-saturation': String(p.saturation), '--neon-hue': '0deg', '--neon-depth': String(p.depth),
    '--neon-gloss': String(p.gloss), '--neon-duration': `${36 / p.speed}s`,
    '--neon-flow-stops': conic(360), '--neon-prism-stops': conic(120),
  };
  for (let i = 0; i < 6; i++) vars[`--neon-color-${i + 1}`] = colors[i % count];
  return vars;
}
export function formatValue(control, value) {
  if (control.unit === '%') return `${Math.round(value * 100)}%`;
  if (control.unit === '×') return `${Number(value.toFixed(2))}×`;
  return `${Number(value.toFixed(1))}${control.unit === '°' ? '' : ' '}${control.unit}`;
}
