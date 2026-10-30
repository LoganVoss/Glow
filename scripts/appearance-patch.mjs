import assert from 'node:assert/strict';
import path from 'node:path';

export const APPEARANCE_NEEDLE = '(0,h.jsx)(u,{defaultAdvancedExpanded:i},r)';

// Reviewed roles, not inferred minifier names. Every binding must belong to one
// complete variant before the native Appearance mount can be extended.
export const APPEARANCE_VARIANTS = Object.freeze([
  Object.freeze({ id: '20052-20398', jsx: 'Agn', jsxAlias: 't', react: 'PCn', reactAlias: 'r', cache: 'NCn', cacheAlias: 'n', scopeHook: 'Fan', scope: 'H0t', settings: 'p3t', write: 'wjt', mountNeedle: APPEARANCE_NEEDLE }),
  Object.freeze({ id: '20586', jsx: 'xMt', jsxAlias: 'n', react: 'yzt', reactAlias: 'r', cache: 'vzt', cacheAlias: 't', scopeHook: 'Ixt', scope: 'Cot', settings: '_lt', write: 'qnt', mountNeedle: APPEARANCE_NEEDLE }),
  Object.freeze({ id: '21161', jsx: 'LNt', jsxAlias: 'n', react: 'FBt', reactAlias: 't', cache: 'PBt', cacheAlias: 'r', scopeHook: '$St', scope: 'Qst', settings: 'xut', write: 'lit', mountNeedle: '(0,h.jsx)(u,{defaultAdvancedExpanded:o},r)' }),
  Object.freeze({ id: '21828', jsx: 'YNt', jsxAlias: 'n', react: 'XVt', reactAlias: 't', cache: 'YVt', cacheAlias: 'r', scopeHook: 'rCt', scope: 'Bst', settings: 'put', write: 'Hit', mountNeedle: APPEARANCE_NEEDLE }),
  Object.freeze({ id: '22391', jsx: 'DPt', jsxAlias: 'n', react: 'OHt', reactAlias: 'r', cache: 'DHt', cacheAlias: 't', scopeHook: 'MCt', scope: 'uct', settings: 'But', write: 'uat', mountNeedle: APPEARANCE_NEEDLE }),
  Object.freeze({ id: '22943', jsx: 'JFt', jsxAlias: 't', react: 'pWt', reactAlias: 'r', cache: 'fWt', cacheAlias: 'n', scopeHook: 'oTt', scope: 'klt', settings: 'pft', write: 'Dot', mountNeedle: APPEARANCE_NEEDLE }),
]);

const count = (source, needle) => source.split(needle).length - 1;
const escapeRE = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const identifier = '[A-Za-z_$][\\w$]*';
function one(values, label) {
  assert.equal(values.length, 1, `Expected exactly one ${label}`);
  return values[0];
}
function imports(source) {
  return [...source.matchAll(/import\{([^}]+)\}from["'](\.\/[^"']+)["']/g)].map(match => ({
    file: path.posix.normalize(`webview/assets/${match[2]}`),
    bindings: match[1],
  }));
}
function aliases(bindings, symbol) {
  return [...bindings.matchAll(new RegExp(`(?:^|,)${escapeRE(symbol)} as (${identifier})(?=,|$)`, 'g'))].map(match => match[1]);
}
function hasAlias(bindings, symbol, local) {
  const values = aliases(bindings, symbol);
  return values.length === 1 && values[0] === local;
}

export function patchAppearance({ appearance, bridge, general, bridgePath, generalPath }) {
  assert.ok(!appearance.includes('__neon') && !appearance.includes('__scope'), 'Reserved mount identifier already exists');
  assert.match(bridgePath, /^webview\/assets\/app-shared-[a-f0-9]+\.js$/, 'Unexpected settings bridge path');
  assert.match(generalPath, /^webview\/assets\/general-settings-[a-f0-9]+\.js$/, 'Unexpected general settings path');
  const appearanceImports = imports(appearance);
  const bridgeImport = one(appearanceImports.filter(item => /^webview\/assets\/app-shared-[a-f0-9]+\.js$/.test(item.file)), 'Appearance settings bridge import');
  const generalImport = one(appearanceImports.filter(item => /^webview\/assets\/general-settings-[a-f0-9]+\.js$/.test(item.file)), 'native general settings import');
  assert.equal(bridgeImport.file, bridgePath, 'Appearance settings bridge linkage changed');
  assert.equal(generalImport.file, generalPath, 'Appearance general settings linkage changed');
  const variant = one(APPEARANCE_VARIANTS.filter(candidate =>
    hasAlias(bridgeImport.bindings, candidate.jsx, candidate.jsxAlias) &&
    hasAlias(bridgeImport.bindings, candidate.react, candidate.reactAlias) &&
    hasAlias(bridgeImport.bindings, candidate.cache, candidate.cacheAlias)), 'reviewed Appearance React/JSX/cache binding variant');
  assert.equal(count(appearance, variant.mountNeedle), 1, 'Expected exactly one native Appearance mount');
  assert.ok(hasAlias(generalImport.bindings, 'n', 'u'), 'Appearance general settings component import changed');
  for (const initialization of [`m=${variant.reactAlias}()`, `h=${variant.jsxAlias}()`, `p=${variant.cacheAlias}()`]) {
    assert.equal([...appearance.matchAll(new RegExp(`(?<![\\w$])${escapeRE(initialization)}(?![\\w$])`, 'g'))].length, 1, 'Appearance React/JSX/cache initialization changed');
  }
  const exportBlocks = [...bridge.matchAll(/export\{([^}]+)\}/g)];
  for (const symbol of [variant.jsx, variant.react, variant.cache, variant.scopeHook, variant.scope, variant.settings, variant.write]) {
    const matches = exportBlocks.flatMap(block => [...block[1].matchAll(new RegExp(`(?:^|,)${identifier} as ${escapeRE(symbol)}(?=,|$)`, 'g'))]);
    assert.equal(matches.length, 1, `Required settings bridge export missing or duplicated: ${symbol}`);
  }
  const nativeImport = one(imports(general).filter(item => item.file === bridgePath), 'general settings bridge import');
  const local = Object.fromEntries(['scopeHook', 'scope', 'settings', 'write'].map(role => [role, one(aliases(nativeImport.bindings, variant[role]), `native appearance ${role} import`)]));
  assert.equal(new Set(Object.values(local)).size, 4, 'Native appearance writer imports collide');
  const writer = new RegExp(`(?<![\\w$])${escapeRE(local.write)}\\((${identifier}),${escapeRE(local.settings)}\\.theme,(${identifier}),\\{optimistic:!1\\}\\)`, 'g');
  const writerMatch = one([...general.matchAll(writer)], 'native non-optimistic appearance writer');
  const scopeBinding = new RegExp(`(?<![\\w$])${escapeRE(writerMatch[1])}=${escapeRE(local.scopeHook)}\\(${escapeRE(local.scope)}\\)`);
  assert.ok(scopeBinding.test(general), 'Native appearance scope binding changed');

  const replacement = `(0,h.jsxs)("div",{"data-neon-appearance":"v1",children:[${variant.mountNeedle},(0,h.jsx)(__neonAppearanceSlot,{})]})`;
  // A callback ref attaches the panel before paint, using the native scoped,
  // non-optimistic theme writer. The initial renderer never imports this module.
  const boot = `import{startNeonCodex as __neonBoot}from"./neon-codex.js";import{${variant.scopeHook} as __neonUseScope,${variant.scope} as __neonScope,${variant.settings} as __neonSettings,${variant.write} as __neonWrite}from"./${path.posix.basename(bridgePath)}";function __neonAppearanceSlot(){const __scope=__neonUseScope(__neonScope),__setTheme=m.useCallback(__theme=>{if(__theme!=="light"&&__theme!=="dark")return Promise.reject(new Error("Unsupported appearance mode"));return __neonWrite(__scope,__neonSettings.theme,__theme,{optimistic:false})},[__scope]),__ref=m.useCallback(__slot=>{if(__slot)__neonBoot().mountAppearance(__slot,{setTheme:__setTheme})},[__setTheme]);return(0,h.jsx)("div",{"data-neon-settings-slot":"v1",ref:__ref})}`;
  return boot + appearance.replace(variant.mountNeedle, replacement);
}
