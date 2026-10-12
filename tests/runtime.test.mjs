import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STORAGE_KEY, SETTINGS_VERSION, PALETTES, COLOR_FAMILIES, PATTERNS, RANGE_CONTROLS,
  defaultProfile, defaultPreferences, normalizeProfile, normalizePreferences, normalizeEnabledColors,
  loadPreferences, savePreferences, migrateLegacyProfile, mergeRemotePreferences,
  initializeProfile, recordProfileEdit, selectPattern, selectPalette, setCustomEnabled,
  updateCustomColor, setColorEnabled, activeColors, randomizePalette, setSolo, selectSoloColor,
  paletteOptions, paletteOptionIndex, selectPaletteOption,
  hexToHsl, hslToHex, setColorHue, profileVariables, formatValue,
} from '../src/preferences.js';

const originalColors = ['#bba2ed', '#dbafd9', '#ebccb1', '#cbd8b7', '#a9d8ca', '#a4d2e5'];
const legacy = (extra = {}) => ({ thickness: 1.9, spread: 8, intensity: 0.66, saturation: 1.3,
  hue: 83, depth: 0.35, gloss: 0.4, duration: 31, pattern: 'aurora', palette: 'cool',
  colors: [...originalColors], paused: true, reverse: true, ...extra });
const without = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
const numeric = p => Object.fromEntries([...RANGE_CONTROLS.map(({ key }) => key), 'hue', 'depth'].map(key => [key, p[key]]));
const seeded = seed => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

test('both modes start with exact approved defaults and independent banks', () => {
  const a = defaultPreferences(), b = defaultPreferences();
  assert.equal(a.version, 5); assert.equal(a.enabled, true);
  assert.deepEqual(numeric(a.profiles.light), { thickness: 1.2, spread: 7.5, intensity: 0.65, saturation: 1.6, hue: 0, depth: 0.77, gloss: 1, speed: 2.05 });
  assert.equal(a.profiles.light.pattern, 'prism'); assert.equal(a.profiles.light.palette, 'vivid');
  assert.deepEqual(a.profiles.light, a.profiles.dark);
  assert.deepEqual(a.setup, { source: null, complete: false });
  a.profiles.light.colors[0] = '#000000'; a.profiles.light.customColors[1] = '#111111'; a.profiles.light.enabledColors[1] = false;
  assert.notEqual(a.profiles.dark.colors[0], '#000000'); assert.notEqual(a.profiles.light.customColors[0], '#000000');
  assert.notEqual(b.profiles.light.customColors[1], '#111111'); assert.equal(a.profiles.dark.enabledColors[1], true);
  assert.notEqual(PALETTES.vivid.colors[0], '#000000');
});

test('numeric controls reject unsafe types/nonfinite values and clamp finite bounds', () => {
  assert.deepEqual(RANGE_CONTROLS.map(c => c.key), ['thickness', 'spread', 'intensity', 'saturation', 'gloss', 'speed']);
  for (const control of [...RANGE_CONTROLS, { key: 'depth', min: 0, max: 1 }]) {
    assert.equal(normalizeProfile({ [control.key]: control.min - 100 })[control.key], control.min);
    assert.equal(normalizeProfile({ [control.key]: control.max + 100 })[control.key], control.max);
    for (const bad of [NaN, Infinity, -Infinity, '6', '6px', null, {}, []]) assert.equal(normalizeProfile({ [control.key]: bad })[control.key], defaultProfile()[control.key]);
  }
});

test('global hue rotation stays zero for every input value and rendering path', () => {
  for (const solo of [false, true]) for (const hue of [undefined, 0, -20, 87, 155, 263, 360, 920, NaN, Infinity, -Infinity, '263deg', null, {}, []]) {
    const raw = { ...defaultProfile(), solo, hue, depth: 0.31, colors: [...originalColors] };
    const snapshot = structuredClone(raw), normalized = normalizeProfile(raw);
    assert.equal(normalized.hue, 0); assert.equal(normalized.depth, 0.31);
    assert.deepEqual(normalized.colors, originalColors);
    assert.equal(profileVariables(raw)['--neon-hue'], '0deg');
    assert.equal(profileVariables(raw)['--neon-depth'], '0.31');
    assert.deepEqual(raw, snapshot);
  }
});

test('all supported saved schemas remove light and dark hue offsets before rendering or copying themes', () => {
  for (const version of [1, 2, 3, 4, 5]) {
    const saved = { version, setup: { source: 'light', complete: false }, profiles: {
      light: { ...legacy({ hue: 263, depth: 0.32, thickness: 2.4 }), speed: 1.3, solo: false },
      dark: { ...legacy({ hue: 155, depth: 0.61, thickness: 4.1 }), speed: 2.1, solo: false },
    } };
    const storage = { getItem: () => JSON.stringify(saved) }, loaded = loadPreferences(storage);
    for (const theme of ['light', 'dark']) {
      assert.equal(loaded.profiles[theme].hue, 0);
      assert.equal(loaded.profiles[theme].depth, saved.profiles[theme].depth);
      assert.equal(loaded.profiles[theme].thickness, saved.profiles[theme].thickness);
      assert.deepEqual(loaded.profiles[theme].colors, originalColors);
      assert.equal(profileVariables(loaded.profiles[theme])['--neon-hue'], '0deg');
    }
    const initialized = initializeProfile(loaded, 'dark');
    assert.equal(initialized.profiles.light.hue, 0); assert.equal(initialized.profiles.dark.hue, 0);
  }
});

test('normalization accepts three patterns and discards retired controls/unsafe colors', () => {
  assert.deepEqual(PATTERNS, ['prism', 'pulse', 'signal']);
  const p = normalizeProfile({ pattern: 'url(x)', palette: '__proto__', paused: true, reverse: true, colors: ['#ABCDEF', 'red', 'url(x)', '#112233', null, '#00aa22'] });
  assert.equal(p.pattern, 'prism'); assert.equal(p.palette, 'vivid'); assert.equal('paused' in p, false); assert.equal(p.reverse, false);
  assert.deepEqual(p.colors, ['#abcdef', PALETTES.vivid.colors[1], PALETTES.vivid.colors[2], '#112233', PALETTES.vivid.colors[4], '#00aa22']);
});

test('masks validate six booleans and always retain at least one color', () => {
  for (let count = 1; count <= 6; count++) {
    const mask = Array.from({ length: 6 }, (_, i) => i < count);
    assert.deepEqual(normalizeEnabledColors(mask), mask);
  }
  assert.deepEqual(normalizeEnabledColors(Array(6).fill(false)), [true, false, false, false, false, false]);
  for (const malformed of [[], [false], null, '111111']) assert.deepEqual(normalizeEnabledColors(malformed), Array(6).fill(true));
  assert.deepEqual(normalizeEnabledColors([false, 'false', 0, null, true, {}]), [false, true, true, true, true, true]);
});

test('legacy masks remain stored but all six multi-colors drive every gradient', () => {
  for (let count = 1; count <= 6; count++) {
    const mask = Array.from({ length: 6 }, (_, i) => i < count);
    const p = normalizeProfile({ ...defaultProfile(), customEnabled: true, enabledColors: mask, customEnabledColors: mask });
    const active = activeColors(p), vars = profileVariables(p);
    assert.deepEqual(active, p.colors); assert.deepEqual(p.enabledColors, mask); assert.deepEqual(p.customEnabledColors, mask);
    for (let i = 1; i <= 6; i++) assert.equal(vars[`--neon-color-${i}`], p.colors[i - 1]);
    for (const name of ['--neon-flow-stops', '--neon-prism-stops']) {
      const resolved = vars[name].replace(/var\((--neon-color-[1-6])\)/g, (_, variable) => vars[variable]);
      for (let i = 1; i <= 6; i++) {
        assert.ok(vars[name].includes(`var(--neon-color-${i})`), 'Gradient stops should retain live references so palette changes interpolate');
        assert.ok(resolved.includes(p.colors[i - 1]));
      }
    }
    assert.match(vars['--neon-flow-stops'], /360deg$/); assert.match(vars['--neon-prism-stops'], /120deg$/);
  }
});

test('legacy mask helpers retain valid banks without affecting the rendered full palette', () => {
  let p = setCustomEnabled(defaultProfile(), true);
  for (let i = 1; i < 6; i++) p = setColorEnabled(p, i, false);
  const before = normalizeProfile(p);
  p = setColorEnabled(p, 0, false);
  assert.deepEqual(p, before); assert.deepEqual(activeColors(p), p.colors);
  assert.deepEqual(p.customEnabledColors, p.enabledColors);
  assert.deepEqual(setColorEnabled(p, -1, true), p);
  assert.deepEqual(setColorEnabled(p, 2, 'false'), p);
});

test('Custom first seeds selected preset, then remembers its colors and mask through presets', () => {
  let p = selectPalette(defaultProfile(), 'soft');
  assert.equal(p.customConfigured, false);
  p = setCustomEnabled(p, true);
  assert.deepEqual(p.customColors, PALETTES.soft.colors); assert.equal(p.customConfigured, true);
  p = updateCustomColor(p, 2, '#123ABC'); p = setColorEnabled(p, 4, false);
  const bank = [...p.customColors], mask = [...p.customEnabledColors];
  p = setCustomEnabled(p, false);
  assert.deepEqual(p.colors, PALETTES.soft.colors); assert.equal(activeColors(p).length, 6);
  p = selectPalette(p, 'vivid');
  assert.deepEqual(p.customColors, bank); assert.deepEqual(p.customEnabledColors, mask);
  p = setCustomEnabled(p, true);
  assert.deepEqual(p.colors, bank); assert.deepEqual(p.enabledColors, mask);
});

test('pattern/palette/mask/color operations preserve tuning and unrelated settings', () => {
  const before = normalizeProfile({ ...defaultProfile(), hue: 55, speed: 1.27, depth: 0.32 });
  for (const pattern of PATTERNS) {
    const p = selectPattern(before, pattern);
    assert.deepEqual(without(p, ['pattern']), without(before, ['pattern']));
  }
  for (const palette of Object.keys(PALETTES)) {
    const p = selectPalette(before, palette);
    assert.deepEqual(numeric(p), numeric(before)); assert.equal(p.pattern, before.pattern);
    assert.deepEqual(p.customColors, before.customColors);
  }
  const edited = updateCustomColor(before, 2, '#123abc');
  assert.deepEqual(edited.colors.filter((_, i) => i !== 2), before.colors.filter((_, i) => i !== 2));
  assert.deepEqual(numeric(edited), numeric(before)); assert.equal(edited.pattern, before.pattern);
});

test('first visits do not select a setup source or copy profiles', () => {
  const p = defaultPreferences();
  assert.deepEqual(initializeProfile(p, 'light'), p);
  assert.deepEqual(initializeProfile(p, 'dark'), p);
  assert.deepEqual(recordProfileEdit(p, 'invalid'), p);
});

test('first edited profile copies to opposite once, in either direction, then isolates edits', () => {
  for (const [source, target] of [['light', 'dark'], ['dark', 'light']]) {
    let p = defaultPreferences();
    p.profiles[source] = setColorEnabled(updateCustomColor(p.profiles[source], 2, '#224466'), 3, false);
    p.profiles[source].thickness = 4.3;
    p = recordProfileEdit(p, source);
    assert.deepEqual(p.setup, { source, complete: false });
    assert.equal(initializeProfile(p, source).setup.complete, false);
    p = initializeProfile(p, target);
    assert.deepEqual(p.profiles[target], p.profiles[source]); assert.equal(p.setup.complete, true);
    p.profiles[target].thickness = 2.2; p.profiles[target].colors[0] = '#000000';
    p = initializeProfile(p, source); p = initializeProfile(p, target);
    assert.equal(p.profiles[target].thickness, 2.2); assert.equal(p.profiles[source].thickness, 4.3);
    assert.notEqual(p.profiles[source].colors[0], '#000000');
  }
});

test('setup metadata persists and copying completes exactly once across reloads without reviving hue rotation', () => {
  let saved;
  const storage = { setItem(key, text) { assert.equal(key, STORAGE_KEY); saved = text; }, getItem() { return saved; } };
  let p = defaultPreferences(); p.profiles.dark.spread = 11; p.profiles.dark.hue = 29; p = recordProfileEdit(p, 'dark');
  assert.equal(savePreferences(storage, p), true);
  p = initializeProfile(loadPreferences(storage), 'light');
  assert.equal(p.profiles.light.spread, 11); assert.equal(p.profiles.light.hue, 0); assert.equal(p.setup.complete, true);
  p.profiles.light.spread = 18; p.profiles.light.hue = 100; savePreferences(storage, p);
  p = initializeProfile(loadPreferences(storage), 'dark');
  assert.equal(p.profiles.dark.spread, 11); assert.equal(p.profiles.dark.hue, 0);
  assert.equal(p.profiles.light.spread, 18); assert.equal(p.profiles.light.hue, 0);
});

test('v1 preserves legacy tuning/colors/exact speed and marks existing profiles complete', () => {
  for (const duration of [6, 31, 36, 44, 73, 120]) {
    const before = legacy({ duration });
    const p = normalizePreferences({ version: 1, enabled: false, profiles: { light: before, dark: { ...before, thickness: 4 } } });
    assert.equal(p.version, SETTINGS_VERSION); assert.equal(p.enabled, false); assert.equal(p.setup.complete, true);
    assert.equal(p.profiles.light.pattern, 'pulse'); assert.equal(p.profiles.light.speed, 36 / duration);
    assert.deepEqual(p.profiles.light.colors, before.colors);
    for (const key of ['thickness', 'spread', 'intensity', 'saturation', 'depth', 'gloss']) assert.equal(p.profiles.light[key], before[key]);
    assert.equal(p.profiles.light.hue, 0); assert.equal(p.profiles.dark.hue, 0);
    assert.equal(initializeProfile(p, 'dark').profiles.dark.thickness, 4);
    assert.ok(Math.abs(Number.parseFloat(profileVariables(p.profiles.light)['--neon-duration']) - duration) < 1e-12);
  }
});

test('v2 preserves distinct tuned profiles/custom banks and never copies one over the other', () => {
  const light = { ...legacy({ pattern: 'ribbon', palette: 'custom', speed: 0.7 }), customColors: Array(6).fill('#112233') };
  const dark = { ...legacy({ pattern: 'signal', palette: 'dusk', speed: 2.7, thickness: 5.3 }), customColors: Array(6).fill('#334455') };
  const p = normalizePreferences({ version: 2, profiles: { light, dark } });
  assert.equal(p.setup.complete, true); assert.equal(p.profiles.light.customEnabled, true); assert.equal(p.profiles.dark.customEnabled, false);
  for (const theme of ['light', 'dark']) {
    const old = theme === 'light' ? light : dark;
    assert.deepEqual(p.profiles[theme].colors, old.colors); assert.deepEqual(p.profiles[theme].customColors, old.customColors);
    assert.equal(p.profiles[theme].speed, old.speed); assert.equal(p.profiles[theme].thickness, old.thickness);
    assert.deepEqual(initializeProfile(p, theme), p);
  }
});

test('v1 Mono retains visible first-color effect and original six-color bank', () => {
  const p = migrateLegacyProfile(legacy({ pattern: 'mono', palette: 'mineral' }));
  assert.equal(p.pattern, 'pulse'); assert.equal(p.customEnabled, true);
  assert.deepEqual(p.colors, Array(6).fill(originalColors[0])); assert.deepEqual(p.customColors, originalColors);
});

test('curated color dice stay inside the selected vibe, avoid repeats, and preserve tuning/masks', () => {
  assert.deepEqual(Object.keys(PALETTES), ['soft', 'vivid']);
  assert.deepEqual(Object.values(PALETTES).map(p => p.label), ['Soft', 'Neon']);
  for (const vibe of Object.keys(PALETTES)) {
    const families = COLOR_FAMILIES[vibe];
    assert.ok(families.length >= 30 && families.length <= 36); assert.equal(new Set(families.map(f => f.id)).size, families.length);
    let p = setCustomEnabled(selectPalette(defaultProfile(), vibe), true);
    p = setColorEnabled(p, 1, false); p = setColorEnabled(p, 4, false);
    const before = normalizeProfile(p), rng = seeded(72), visited = new Set();
    for (let roll = 0; roll < 200; roll++) {
      const next = randomizePalette(p, rng);
      assert.equal(next.palette, vibe); assert.notEqual(next.paletteFamily, p.paletteFamily);
      assert.notDeepEqual(next.colors, p.colors); assert.equal(new Set(next.colors).size, 6);
      assert.deepEqual(next.colors, families.find(f => f.id === next.paletteFamily).colors);
      assert.deepEqual(numeric(next), numeric(before)); assert.equal(next.pattern, before.pattern);
      assert.deepEqual(next.enabledColors, before.enabledColors); assert.deepEqual(next.customEnabledColors, before.enabledColors);
      assert.equal(activeColors(next).length, 6); assert.deepEqual(next.customColors, next.colors);
      for (const color of next.colors) {
        const { s, l } = hexToHsl(color);
        if (vibe === 'soft') { assert.ok(s >= 0.3 && s <= 0.74); assert.ok(l >= 0.74 && l <= 0.85); }
        else { assert.ok(s >= 0.58 && s <= 1); assert.ok(l >= 0.6 && l <= 0.74); }
      }
      visited.add(next.paletteFamily); p = next;
    }
    assert.equal(visited.size, families.length);
    assert.deepEqual(randomizePalette(before, seeded(73)), randomizePalette(before, seeded(73)));
    for (const rng of [() => 0, () => 1, () => NaN, () => Infinity]) assert.ok(families.some(f => f.id === randomizePalette(before, rng).paletteFamily));
  }
});

test('stored light/dark hue offsets retire to zero while depth and other tuning survive palette edits and serialization', () => {
  const original = defaultPreferences();
  original.setup = { source: 'light', complete: true };
  original.profiles.light.hue = 83; original.profiles.light.depth = 0.35;
  original.profiles.dark.hue = 291; original.profiles.dark.depth = 0.18;
  let stored = JSON.stringify(original);
  const storage = { getItem() { return stored; }, setItem(_key, value) { stored = value; } };
  const loaded = loadPreferences(storage);
  for (const theme of ['light', 'dark']) {
    assert.equal(loaded.profiles[theme].hue, 0);
    assert.deepEqual(without(loaded.profiles[theme], ['hue']), without(original.profiles[theme], ['hue']));
  }
  loaded.profiles.light = selectPaletteOption(loaded.profiles.light, 23);
  loaded.profiles.dark = randomizePalette(loaded.profiles.dark, seeded(112), 'dark');
  savePreferences(storage, loaded);
  const result = loadPreferences(storage);
  for (const theme of ['light', 'dark']) {
    assert.deepEqual(without(numeric(result.profiles[theme]), ['hue']), without(numeric(original.profiles[theme]), ['hue']));
    assert.equal(JSON.parse(stored).profiles[theme].hue, 0); assert.equal(result.profiles[theme].hue, 0);
    const vars = profileVariables(result.profiles[theme]);
    assert.equal(vars['--neon-hue'], '0deg');
    assert.equal(vars['--neon-depth'], String(original.profiles[theme].depth));
  }
});

test('palette browsing selects every curated family deterministically without changing tuning or vibe', () => {
  for (const vibe of Object.keys(PALETTES)) {
    const before = normalizeProfile({ ...selectPalette(defaultProfile(), vibe), thickness: 3.7, hue: 42,
      depth: 0.23, intensity: 0.41, speed: 0.8, pattern: 'signal', enabledColors: [true, false, true, false, true, false] });
    const snapshot = structuredClone(before), options = paletteOptions(before);
    assert.equal(options.length, COLOR_FAMILIES[vibe].length);
    assert.ok(Object.isFrozen(options));
    for (const [index, option] of options.entries()) {
      assert.ok(Object.isFrozen(option)); assert.ok(Object.isFrozen(option.colors));
      assert.ok(option.label.length); assert.equal('soloIndex' in option, false);
      const selected = selectPaletteOption(before, index);
      assert.deepEqual(selected.colors, option.colors); assert.notEqual(selected.colors, option.colors);
      assert.equal(selected.paletteFamily, option.id); assert.equal(selected.palette, vibe);
      assert.equal(selected.pattern, before.pattern); assert.equal(selected.solo, false);
      assert.deepEqual(numeric(selected), numeric(before)); assert.deepEqual(selected.enabledColors, before.enabledColors);
      assert.deepEqual(selected.customColors, selected.colors); assert.equal(selected.customConfigured, true);
      assert.equal(paletteOptionIndex(selected), index);
      assert.deepEqual(selectPaletteOption(before, index), selected);
    }
    for (const invalid of [-1, options.length, 1.3, '2', NaN, Infinity]) assert.deepEqual(selectPaletteOption(before, invalid), before);
    assert.deepEqual(before, snapshot);
  }
});

test('Solo browsing follows unique hue-ordered swatches while retaining each complete color bank', () => {
  for (const vibe of Object.keys(PALETTES)) {
    const before = setSolo(selectPalette(defaultProfile(), vibe), true), options = paletteOptions(before);
    const colors = options.map(option => option.colors[option.soloIndex]), hues = colors.map(color => hexToHsl(color).h);
    assert.ok(options.length >= 150); assert.equal(new Set(colors).size, options.length);
    assert.deepEqual(hues, [...hues].sort((a, b) => a - b));
    for (const [index, option] of options.entries()) {
      const selected = selectPaletteOption(before, index);
      assert.equal(selected.solo, true); assert.equal(selected.palette, vibe); assert.equal(selected.soloIndex, option.soloIndex);
      assert.deepEqual(activeColors(selected), [colors[index]]); assert.deepEqual(numeric(selected), numeric(before));
      assert.deepEqual(selected.colors, option.colors); assert.equal(new Set(selected.colors).size, 6);
      assert.equal(paletteOptionIndex(selected), index);
      assert.deepEqual(activeColors(setSolo(selected, false)), option.colors);
    }
  }
});

test('catalog index exactly matches actual colors or finds a stable nearest palette without modifying saved colors', () => {
  for (const solo of [false, true]) {
    const before = setSolo(defaultProfile(), solo), options = paletteOptions(before);
    const selected = selectPaletteOption(before, Math.floor(options.length / 2));
    selected.paletteFamily = 'signature'; // Stored identifiers are not evidence of a color match.
    assert.equal(paletteOptionIndex(selected), Math.floor(options.length / 2));
    const modifiedIndex = solo ? selected.soloIndex : 0;
    const color = selected.colors[modifiedIndex], blue = Number.parseInt(color.slice(5), 16);
    selected.colors[modifiedIndex] = color.slice(0, 5) + (blue === 255 ? 254 : blue + 1).toString(16).padStart(2, '0');
    const snapshot = structuredClone(selected);
    assert.equal(paletteOptionIndex(selected), Math.floor(options.length / 2));
    assert.deepEqual(selected, snapshot);
    const unusual = { ...selected, colors: ['#000000', '#ffffff', '#123456', '#654321', '#112233', '#aabbcc'] };
    const index = paletteOptionIndex(unusual);
    assert.ok(Number.isInteger(index) && index >= 0 && index < options.length);
    assert.equal(paletteOptionIndex(unusual), index);
  }
});

test('Solo dice and slider use the same catalog and never repeat the displayed color', () => {
  for (const vibe of Object.keys(PALETTES)) {
    let p = setSolo(selectPalette(defaultProfile(), vibe), true);
    const original = structuredClone(p), rng = seeded(328), options = paletteOptions(p);
    for (let roll = 0; roll < 200; roll++) {
      const next = randomizePalette(p, rng), index = paletteOptionIndex(next), option = options[index];
      assert.notDeepEqual(activeColors(next), activeColors(p));
      assert.equal(next.palette, vibe); assert.equal(next.solo, true);
      assert.deepEqual(activeColors(next), [option.colors[option.soloIndex]]);
      assert.deepEqual(next.colors, option.colors); assert.deepEqual(numeric(next), numeric(original));
      p = next;
    }
  }
});

test('Solo selects exactly one color then restores all six colors while preserving legacy banks', () => {
  let p = setCustomEnabled(defaultProfile(), true);
  p = setColorEnabled(p, 1, false); p = setColorEnabled(p, 4, false);
  const before = normalizeProfile(p);
  p = setSolo(p, true);
  for (let index = 0; index < 6; index++) {
    p = selectSoloColor(p, index);
    assert.deepEqual(activeColors(p), [p.colors[index]]);
    assert.deepEqual(p.enabledColors, before.enabledColors); assert.deepEqual(p.customEnabledColors, before.customEnabledColors);
    assert.deepEqual(without(numeric(p), ['hue']), without(numeric(before), ['hue'])); assert.equal(p.hue, 0);
    const vars = profileVariables(p);
    for (const value of Object.entries(vars).filter(([name]) => name.startsWith('--neon-color-')).map(([,value]) => value)) assert.equal(value, p.colors[index]);
    for (const color of p.colors.filter((_, i) => i !== index)) assert.equal(vars['--neon-flow-stops'].includes(color), false);
  }
  p = setSolo(p, false);
  assert.deepEqual(without(p, ['soloIndex']), without(before, ['soloIndex'])); assert.equal(p.hue, 0);
  assert.deepEqual(activeColors(p), activeColors(before));
  assert.deepEqual(selectSoloColor(p, -1), p); assert.deepEqual(selectSoloColor(p, 6), p); assert.deepEqual(setSolo(p, 'true'), p);
});

test('Solo dice select a different color and retain the full multi-color bank', () => {
  let p = setSolo(setColorEnabled(defaultProfile(), 2, false), true);
  p = selectSoloColor(p, 3);
  const before = normalizeProfile(p), next = randomizePalette(p, seeded(7));
  assert.equal(next.solo, true);
  assert.equal(activeColors(next).length, 1); assert.notDeepEqual(activeColors(next), activeColors(before));
  assert.equal(next.palette, before.palette); assert.deepEqual(numeric(next), numeric(before));
  assert.deepEqual(next.enabledColors, before.enabledColors);
  assert.deepEqual(activeColors(setSolo(next, false)), next.colors);
  const switched = selectPalette(next, 'soft');
  assert.equal(switched.solo, true); assert.equal(switched.soloIndex, next.soloIndex);
  assert.deepEqual(switched.enabledColors, before.enabledColors);
  assert.deepEqual(activeColors(setSolo(switched, false)), switched.colors);
});

test('HSL conversion round trips colors and hue edits preserve saturation/lightness', () => {
  for (const color of [...originalColors, '#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff']) {
    const hsl = hexToHsl(color); assert.equal(hslToHex(hsl.h, hsl.s, hsl.l), color);
  }
  const before = defaultProfile(), p = setColorHue(before, 3, 213);
  const a = hexToHsl(before.colors[3]), b = hexToHsl(p.colors[3]);
  assert.ok(Math.abs(a.s - b.s) < 0.01); assert.ok(Math.abs(a.l - b.l) < 0.01); assert.ok(Math.abs(b.h - 213) < 1);
  assert.deepEqual(p.colors.filter((_, i) => i !== 3), before.colors.filter((_, i) => i !== 3));
  assert.deepEqual(numeric(p), numeric(before)); assert.equal(p.customEnabled, true);
});

test('invalid versions and unavailable storage restore defaults using only isolated key', () => {
  for (const bad of [undefined, null, [], 0, '', {}, { version: 99 }]) assert.deepEqual(normalizePreferences(bad), defaultPreferences());
  const keys = []; const p = defaultPreferences(); p.enabled = false;
  assert.equal(loadPreferences({ getItem(key) { keys.push(key); return JSON.stringify(p); } }).enabled, false);
  assert.deepEqual(keys, [STORAGE_KEY]);
  for (const storage of [null, undefined, { getItem() { throw new Error('blocked'); } }, { getItem() { return '{broken'; } }]) assert.deepEqual(loadPreferences(storage), defaultPreferences());
  assert.equal(savePreferences({ setItem() { throw new Error('quota'); } }, p), false);
});

test('remote update merges local pending fields/setup with unrelated remote edits', () => {
  const baseline = defaultPreferences(), local = recordProfileEdit(defaultPreferences(), 'light'), remote = defaultPreferences();
  local.profiles.light.intensity = 0.31; remote.profiles.dark.gloss = 0.81;
  const merged = mergeRemotePreferences(local, baseline, remote);
  assert.equal(merged.profiles.light.intensity, 0.31); assert.equal(merged.profiles.dark.gloss, 0.81); assert.equal(merged.setup.source, 'light');
  assert.equal(remote.profiles.light.intensity, 0.65);
});

test('remote reset clears synchronized settings and preserves only pending local differences', () => {
  const baseline = defaultPreferences(); baseline.profiles.light.thickness = 4;
  assert.deepEqual(mergeRemotePreferences(baseline, baseline, defaultPreferences()), defaultPreferences());
  const local = normalizePreferences(baseline); local.profiles.dark.depth = 0.29; local.profiles.dark.hue = 205;
  const merged = mergeRemotePreferences(local, baseline, defaultPreferences());
  assert.equal(merged.profiles.light.thickness, 1.2); assert.equal(merged.profiles.dark.depth, 0.29); assert.equal(merged.profiles.dark.hue, 0);
});

test('CSS serialization and speed formatting stay bounded and precise', () => {
  for (const [speed, duration] of [[0.25, '144s'], [1, '36s'], [6, '6s']]) assert.equal(profileVariables({ speed })['--neon-duration'], duration);
  const vars = profileVariables({ thickness: 20, spread: -1, colors: Array(6).fill('url(secret)') });
  assert.equal(vars['--neon-thickness'], '6px'); assert.equal(vars['--neon-spread'], '0px'); assert.equal(Object.keys(vars).length, 16);
  assert.equal(Object.values(vars).some(v => /NaN|Infinity|url\(/.test(v)), false);
  const speed = RANGE_CONTROLS.find(c => c.key === 'speed');
  assert.equal(formatValue(speed, 0.25), '0.25×'); assert.equal(formatValue(speed, 36 / 44), '0.82×');
  assert.equal(normalizeProfile({ speed: 36 / 44 }).speed, 36 / 44);
});


test('opposite first edits in fresh windows finish setup without overwriting either profile', () => {
  for (const [source, target] of [['light', 'dark'], ['dark', 'light']]) {
    const baseline = defaultPreferences();
    const local = recordProfileEdit(defaultPreferences(), source), remote = recordProfileEdit(defaultPreferences(), target);
    local.profiles[source].thickness = 4; remote.profiles[target].thickness = 3;
    let merged = mergeRemotePreferences(local, baseline, remote);
    assert.equal(merged.setup.complete, true);
    merged = initializeProfile(merged, target); merged = initializeProfile(merged, source);
    assert.equal(merged.profiles[source].thickness, 4); assert.equal(merged.profiles[target].thickness, 3);
    // Even when our first-edit marker was already saved, a conflicting
    // remote source must not re-arm the one-time copy operation.
    merged = mergeRemotePreferences(local, local, remote);
    assert.equal(merged.setup.complete, true);
  }
});

test('pending first-source metadata never regresses a remote completed setup', () => {
  const baseline = defaultPreferences(), local = recordProfileEdit(defaultPreferences(), 'light');
  local.profiles.light.gloss = 0.45;
  let remote = recordProfileEdit(defaultPreferences(), 'light');
  remote.profiles.light.thickness = 4; remote = initializeProfile(remote, 'dark');
  remote.profiles.dark.thickness = 3;
  const merged = mergeRemotePreferences(local, baseline, remote);
  assert.equal(merged.setup.complete, true); assert.equal(merged.profiles.light.gloss, 0.45);
  assert.equal(initializeProfile(merged, 'dark').profiles.dark.thickness, 3);
});


test('v3/v4 upgrades preserve tuned profiles, masks, setup and colors while retiring old names/direction', () => {
  for (const version of [3, 4]) {
    const old = defaultPreferences(); old.version = version;
    old.setup = { source: 'dark', complete: false };
    old.profiles.dark.palette = 'cool'; old.profiles.dark.colors = Array(6).fill('#819eea');
    old.profiles.dark.hue = 37; old.profiles.dark.reverse = true; old.profiles.dark.pattern = 'ribbon';
    old.profiles.light = setColorEnabled(old.profiles.light, 2, false); old.profiles.light.pattern = 'spectrum';
    const next = normalizePreferences(old);
    assert.equal(next.version, 5); assert.deepEqual(next.setup, old.setup);
    assert.deepEqual(next.profiles.dark.colors, old.profiles.dark.colors);
    assert.deepEqual(next.profiles.dark.customColors, old.profiles.dark.customColors);
    assert.deepEqual(without(numeric(next.profiles.dark), ['hue']), without(numeric(old.profiles.dark), ['hue']));
    assert.equal(next.profiles.dark.hue, 0);
    assert.equal(next.profiles.dark.pattern, 'prism'); assert.equal(next.profiles.light.pattern, 'pulse');
    assert.equal(next.profiles.dark.reverse, false); assert.equal(next.profiles.dark.palette, 'vivid');
    assert.deepEqual(next.profiles.light.enabledColors, old.profiles.light.enabledColors);
    assert.deepEqual(normalizePreferences(JSON.parse(JSON.stringify(next))), next);
  }
  for (const palette of ['cool', 'dusk']) {
    for (const vibe of ['soft', 'vivid']) {
      const old = { ...defaultPreferences(), version: 4 };
      old.profiles.light.palette = palette; old.profiles.light.colors = [...PALETTES[vibe].colors];
      const next = normalizePreferences(old);
      assert.equal(next.profiles.light.palette, vibe); assert.deepEqual(next.profiles.light.colors, old.profiles.light.colors);
    }
  }
});

test('v5 Solo/family settings survive saving, reload and unrelated remote profile edits', () => {
  const baseline = defaultPreferences(), local = defaultPreferences(), remote = defaultPreferences();
  local.profiles.light = selectSoloColor(setSolo(randomizePalette(setColorEnabled(local.profiles.light, 4, false), seeded(13)), true), 2);
  Object.assign(remote.profiles.dark, { thickness: 2.3, spread: 9, intensity: 0.41, hue: 88, speed: 1.35 });
  const merged = mergeRemotePreferences(local, baseline, remote);
  assert.deepEqual(merged.profiles.light, local.profiles.light); assert.deepEqual(merged.profiles.dark, normalizeProfile(remote.profiles.dark));
  let saved; const storage = { getItem: () => saved, setItem: (_, value) => { saved = value; } };
  assert.equal(savePreferences(storage, merged), true); assert.deepEqual(loadPreferences(storage), merged);
  const restored = setSolo(loadPreferences(storage).profiles.light, false);
  assert.equal(activeColors(restored).length, 6); assert.equal(restored.enabledColors[4], false);
  // Resetting the active appearance must not disturb its independently tuned sibling.
  merged.profiles.light = defaultProfile('light');
  assert.deepEqual(merged.profiles.dark, normalizeProfile(remote.profiles.dark));
});


test('Solo transitions retain zero hue rotation without changing other tuning', () => {
  const before = normalizeProfile({ ...defaultProfile(), hue: 289, thickness: 2.7, speed: 1.35 });
  const solo = setSolo(before, true);
  assert.equal(solo.hue, 0); assert.equal(solo.solo, true);
  assert.deepEqual(without(solo, ['solo', 'hue']), without(before, ['solo', 'hue']));
  assert.deepEqual(setSolo(solo, true), solo);
  assert.equal(normalizeProfile({ ...solo, hue: 333 }).hue, 0);
  assert.equal(profileVariables({ ...solo, hue: 333 })['--neon-hue'], '0deg');
  const off = setSolo(solo, false);
  assert.equal(off.solo, false); assert.equal(off.hue, 0);
  assert.deepEqual(without(off, ['solo', 'hue']), without(solo, ['solo', 'hue']));
  assert.deepEqual(setSolo(off, false), off);
  const edited = normalizeProfile({ ...off, hue: 87 });
  assert.equal(edited.hue, 0); assert.deepEqual(setSolo(edited, false), edited);
});

test('stored v5 Solo, color dice and vibe changes retain Hue Offset zero without touching other tuning', () => {
  const old = defaultPreferences(); old.profiles.light.solo = true; old.profiles.light.hue = 222;
  old.profiles.light.soloIndex = 3; old.profiles.light.thickness = 2.8;
  let stored = JSON.stringify(old); const storage = { getItem: () => stored, setItem: (_, value) => { stored = value; } };
  const loaded = loadPreferences(storage); assert.equal(loaded.version, 5); assert.equal(loaded.profiles.light.hue, 0);
  assert.equal(loaded.profiles.dark.hue, old.profiles.dark.hue);
  for (const changed of [randomizePalette(loaded.profiles.light, seeded(25)), selectPalette(loaded.profiles.light, 'soft')]) {
    assert.equal(changed.hue, 0); assert.equal(changed.solo, true);
    assert.deepEqual(without(numeric(changed), ['hue']), without(numeric(old.profiles.light), ['hue']));
  }
  assert.equal(savePreferences(storage, old), true);
  assert.equal(JSON.parse(stored).profiles.light.hue, 0);
  assert.equal(loadPreferences(storage).profiles.light.hue, 0);
});

test('concurrent hue edits cannot revive global hue rotation through remote field merges', () => {
  const baseline = defaultPreferences(), local = defaultPreferences(), remote = defaultPreferences();
  local.profiles.light.hue = 95; remote.profiles.light = setSolo(remote.profiles.light, true);
  let merged = mergeRemotePreferences(local, baseline, remote);
  assert.equal(merged.profiles.light.solo, true); assert.equal(merged.profiles.light.hue, 0);
  local.profiles.light = setSolo(baseline.profiles.light, true);
  remote.profiles.light = { ...baseline.profiles.light, hue: 71 };
  merged = mergeRemotePreferences(local, baseline, remote);
  assert.equal(merged.profiles.light.solo, true); assert.equal(merged.profiles.light.hue, 0);
  const soloBaseline = normalizePreferences(merged), offLocal = normalizePreferences(merged), otherRemote = normalizePreferences(merged);
  offLocal.profiles.light = setSolo(offLocal.profiles.light, false); otherRemote.profiles.dark.spread = 12;
  merged = mergeRemotePreferences(offLocal, soloBaseline, otherRemote);
  assert.equal(merged.profiles.light.solo, false); assert.equal(merged.profiles.light.hue, 0);
  assert.equal(merged.profiles.dark.spread, 12);
});

test('stale multicolor actions and cross-window writes cannot reintroduce either theme offset', () => {
  const stale = { ...defaultProfile(), hue: 263, thickness: 2.8, depth: 0.29 };
  for (const changed of [
    randomizePalette(stale, seeded(42)), selectPaletteOption(stale, 17), selectPalette(stale, 'soft'),
    selectPattern(stale, 'signal'), setSolo(stale, false), setSolo(setSolo(stale, true), false),
  ]) {
    assert.equal(changed.hue, 0); assert.equal(profileVariables(changed)['--neon-hue'], '0deg');
    assert.equal(changed.thickness, stale.thickness); assert.equal(changed.depth, stale.depth);
  }
  const baseline = defaultPreferences(), local = defaultPreferences(), remote = defaultPreferences();
  local.profiles.light.hue = 71; local.profiles.light.intensity = 0.31;
  local.profiles.dark.hue = 155; remote.profiles.light.hue = 263;
  remote.profiles.dark.hue = 291; remote.profiles.dark.spread = 13;
  const merged = mergeRemotePreferences(local, baseline, remote);
  assert.equal(merged.profiles.light.intensity, 0.31); assert.equal(merged.profiles.dark.spread, 13);
  for (const theme of ['light', 'dark']) {
    assert.equal(merged.profiles[theme].solo, false); assert.equal(merged.profiles[theme].hue, 0);
    assert.equal(profileVariables(merged.profiles[theme])['--neon-hue'], '0deg');
  }
  let serialized;
  assert.equal(savePreferences({ setItem(_key, value) { serialized = value; } }, remote), true);
  for (const theme of ['light', 'dark']) assert.equal(JSON.parse(serialized).profiles[theme].hue, 0);
});
