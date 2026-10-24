import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { inspectStructure, APPEARANCE_NEEDLE } from '../scripts/compatibility.mjs';
import { SIDEBAR_VARIANTS } from '../scripts/sidebar-cycle-patch.mjs';
import { APPEARANCE_VARIANTS } from '../scripts/appearance-patch.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function fixture(variant = SIDEBAR_VARIANTS[0], appearance = APPEARANCE_VARIANTS[0]) {
  const assets = new Map(Object.entries({
    'webview/index.html': '<head><meta http-equiv="Content-Security-Policy" content="default-src \'self\'">\n<link href="./assets/app-shared-a1.css">\n<script type="module" src="./assets/entry-a1.js"></script>\n</head><body></body>',
    'webview/assets/app-shared-a1.css': ':root{color:black}',
    'webview/assets/appearance-settings-a1.js': `import{${appearance.jsx} as ${appearance.jsxAlias},${appearance.cache} as ${appearance.cacheAlias},${appearance.react} as ${appearance.reactAlias}}from"./app-shared-a1.js";import{n as u}from"./general-settings-a1.js";var m,h,p;m=${appearance.reactAlias}();h=${appearance.jsxAlias}();p=${appearance.cacheAlias}();function f(){const i=true,o=true;return ${appearance.mountNeedle}}`,
    'webview/assets/app-shared-a1.js': `export{a as ${appearance.scopeHook},b as ${appearance.scope},c as ${appearance.settings},d as ${appearance.write},e as ${appearance.jsx},f as ${appearance.react},g as ${appearance.cache}};`,
    'webview/assets/general-settings-a1.js': `import{${appearance.scopeHook} as N,${appearance.scope} as P,${appearance.settings} as Xt,${appearance.write} as V}from"./app-shared-a1.js";function theme(){let t=N(P);return e=>V(t,Xt.theme,e,{optimistic:!1})}`,
    'webview/assets/entry-a1.js': 'import "./app-initial-a1.js";',
    'webview/assets/app-initial-a1.js': variant.hook,
  }));
  const integrity = { 'Resources/app.asar': { algorithm: 'SHA256', hash: 'ab'.repeat(32) } };
  const info = { CFBundleIdentifier: 'com.openai.codex', CFBundleShortVersionString: '99.1', CFBundleVersion: '999', ElectronAsarIntegrity: integrity };
  const digest = createHash('sha256');
  for (const key of Object.keys(integrity).sort()) digest.update(key).update(integrity[key].algorithm).update(integrity[key].hash);
  const frameworkBytes = Buffer.concat([Buffer.from('fixture'),Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX'),Buffer.from([1,9]),Buffer.from('010011001'),Buffer.from('AGbevlPCksUGKNL8TSn7wGmJEuJsXb2A'),Buffer.from([1,1]),digest.digest()]);
  return { assets, info, headerHash: integrity['Resources/app.asar'].hash, frameworkBytes };
}
function inspect(f, pins = {}) {
  return inspectStructure({ ...f, files: [...f.assets.keys()], readFile: file => Buffer.from(f.assets.get(file)), pins });
}
function splitFixture() {
  const f=fixture(SIDEBAR_VARIANTS.at(-1),APPEARANCE_VARIANTS.at(-1));
  f.assets.set('webview/assets/app-primary-a1.js',f.assets.get('webview/assets/app-initial-a1.js'));
  f.assets.set('webview/assets/app-initial-a1.js','export const nativeState = {};');
  f.assets.set('webview/assets/entry-a1.js','import("./app-main-a1.js");');
  f.assets.set('webview/assets/app-main-a1.js','import "./app-initial-a1.js";import("./app-runtime-a1.js");');
  f.assets.set('webview/assets/app-runtime-a1.js','import{state as nativeState}from"./app-primary-a1.js";');
  return f;
}
function change(f, role, from, to) {
  const key = [...f.assets.keys()].find(key => key.includes(role));
  assert.ok(f.assets.get(key).includes(from));
  f.assets.set(key, f.assets.get(key).replace(from, to));
}
function reject(f, reason) { const result = inspect(f); assert.equal(result.status, 'unsupported'); assert.match(result.reason, reason); assert.equal(result.candidateSourcePin, undefined); }

test('unknown build with intact structural anchors yields a proposal, not supported status', () => {
  const f = fixture(), before = JSON.stringify([...f.assets]);
  const result = inspect(f);
  assert.equal(result.status, 'compatible-candidate', result.reason);
  assert.deepEqual(Object.keys(result.assets), ['html','css','appearance','settingsBridge','generalSettings','initialRenderer']);
  assert.equal(result.candidateSourcePin.key, '99.1:999');
  assert.equal(result.candidateSourcePin.value.appearanceHash, sha(f.assets.get('webview/assets/appearance-settings-a1.js')));
  assert.equal(JSON.stringify([...f.assets]), before);
  assert.equal(result.readOnly, true);
});
test('reviewed updated sidebar variant remains a candidate until its complete source is pinned', () => {
  const f = fixture(SIDEBAR_VARIANTS[1]);
  const result = inspect(f);
  assert.equal(result.status, 'compatible-candidate', result.reason);
  assert.equal(inspect(f, { [result.candidateSourcePin.key]: result.candidateSourcePin.value }).status, 'compatible-known');
  change(f, 'app-initial-', '(8)', '(9)');
  reject(f, /complete reviewed native sidebar command hook/);
});
test('mixed old and new sidebar bindings cannot pass compatibility review', () => {
  const f = fixture(SIDEBAR_VARIANTS[1]);
  change(f, 'app-initial-', SIDEBAR_VARIANTS[1].callback, SIDEBAR_VARIANTS[0].callback);
  reject(f, /complete reviewed native sidebar command hook/);
});
test('known build must match every recorded source field', () => {
  const f = fixture(), proposal = inspect(f).candidateSourcePin;
  assert.equal(inspect(f, { [proposal.key]: proposal.value }).status, 'compatible-known');
  change(f, 'app-shared-a1.css', 'black', 'white');
  const changed = inspect(f, { [proposal.key]: proposal.value });
  assert.equal(changed.status, 'unsupported');
  assert.match(changed.reason, /Reviewed source pin mismatch: cssHash/);
  assert.equal(changed.candidateSourcePin, undefined);
});
test('unknown asset hashes can change only with all structural checks intact', () => {
  const f = fixture(); change(f, 'app-shared-a1.css', 'black', 'white');
  assert.equal(inspect(f).status, 'compatible-candidate');
});
test('native sidebar command structural changes and unlinked renderer are refused', () => {
  let f = fixture(); change(f, 'app-initial-', 'Pw(`toggleSidebar`,o)', 'Pw(`other`,o)');
  reject(f, /native titlebar\/menu sidebar command registration/);
  f = fixture(); change(f, 'app-initial-', 'animate:t', 'animate:!1');
  reject(f, /reviewed native sidebar command callback/);
  f = fixture(); change(f, 'entry-a1', 'app-initial-a1.js', 'other-a1.js');
  reject(f, /native main renderer import/);
});
test('known build rejects changes to native initial renderer even when hook still matches', () => {
  const f=fixture(), proposal=inspect(f).candidateSourcePin;
  change(f,'app-initial-',SIDEBAR_VARIANTS[0].hook,`${SIDEBAR_VARIANTS[0].hook}/* unrelated vendor change */`);
  const result=inspect(f,{[proposal.key]:proposal.value});
  assert.equal(result.status,'unsupported');
  assert.match(result.reason,/Reviewed source pin mismatch: initialRendererHash/);
});
test('duplicate Appearance candidates are refused', () => {
  const f = fixture();f.assets.set('webview/assets/appearance-settings-a2.js', f.assets.get('webview/assets/appearance-settings-a1.js'));
  reject(f, /exactly one Appearance component/);
});
test('ambiguous referenced shared stylesheets are refused', () => {
  const f = fixture();f.assets.set('webview/assets/app-shared-a2.css', 'body{}');
  change(f, 'index.html', '</head>', '<link href="./assets/app-shared-a2.css"></head>');
  reject(f, /exactly one referenced shared stylesheet/);
});
test('unused unrelated general settings files do not cause false ambiguity', () => {
  const f = fixture();f.assets.set('webview/assets/general-settings-a2.js', 'unrelated');
  assert.equal(inspect(f).status, 'compatible-candidate');
});
test('body mount fallback is never accepted', () => {
  const f = fixture(); change(f, 'appearance-settings', APPEARANCE_NEEDLE, 'document.body.appendChild(document.createElement("div"))');
  reject(f, /exactly one native Appearance mount/);
});
test('duplicate mount anchors and reserved names are refused', () => {
  let f = fixture();change(f, 'appearance-settings', APPEARANCE_NEEDLE, `${APPEARANCE_NEEDLE},${APPEARANCE_NEEDLE}`);reject(f, /exactly one native Appearance mount/);
  f = fixture();change(f, 'appearance-settings', 'var m,h,p;', 'var m,h,p,__scope;');reject(f, /Reserved mount identifier/);
});
test('missing entry module or duplicate CSP is refused', () => {
  let f = fixture();change(f, 'index.html', 'type="module"', 'type="text/javascript"');reject(f, /native entry module/);
  f = fixture();change(f, 'index.html', '</head>', '<meta http-equiv="Content-Security-Policy" content="none"></head>');reject(f, /exactly one Content-Security-Policy/);
});
test('missing bridge export or changed native writer semantics is refused', () => {
  let f = fixture();change(f, 'app-shared-a1.js', 'd as wjt', 'd as other');reject(f, /bridge export missing or duplicated: wjt/);
  f = fixture();change(f, 'general-settings', 'optimistic:!1', 'optimistic:!0');reject(f, /native non-optimistic appearance writer/);
  f = fixture();change(f, 'general-settings', 't=N(P)', 't=N(other)');reject(f, /scope binding changed/);
});
test('changed React bindings or malformed transform is refused', () => {
  let f = fixture();change(f, 'appearance-settings', 'm=r()', 'm=other()');reject(f, /React\/JSX\/cache initialization changed/);
  f = fixture();change(f, 'appearance-settings', 'function f(){', 'function f(){{');reject(f, /does not parse/);
});
test('already-patched archive cannot become a candidate', () => {
  let f = fixture();f.assets.set('webview/assets/neon-codex.js', 'export{}');reject(f, /Glow assets already exist/);
  f = fixture();change(f, 'app-shared-a1.css', ':root', '/* NEON CODEX LOCAL THEME */:root');reject(f, /already contains Glow/);
});
test('header, fuse, and embedded digest changes are refused', () => {
  let f = fixture();f.headerHash='ff'.repeat(32);reject(f, /header differs/);
  f = fixture();const fuse = f.frameworkBytes.indexOf(Buffer.from('010011001'));f.frameworkBytes[fuse]=49;reject(f, /fuse settings changed/);
  f = fixture();f.frameworkBytes[f.frameworkBytes.length-1]^=1;reject(f, /framework integrity differs/);
});
test('unrelated application and duplicate archive paths are refused', () => {
  let f=fixture();f.info.CFBundleIdentifier='org.other';reject(f,/not the Codex/);
  f=fixture();const result=inspectStructure({...f,files:[...f.assets.keys(),'webview/index.html'],readFile: file=>Buffer.from(f.assets.get(file))});assert.match(result.reason,/Duplicate archive paths/);
});
test('builder and inspector both use the same reviewed Appearance transformer', () => {
  for (const file of ['build.mjs','compatibility.mjs']) {
    const source=fs.readFileSync(new URL(`../scripts/${file}`,import.meta.url),'utf8');
    assert.ok(source.includes("import { patchAppearance } from './appearance-patch.mjs';"));
    assert.ok(source.includes('const patchedAppearance = patchAppearance({'));
    assert.equal(source.includes('function __neonAppearanceSlot'),false);
  }
});
test('latest Appearance bindings require matching bridge and native writer before a pin proposal', () => {
  const f=fixture(SIDEBAR_VARIANTS.at(-1),APPEARANCE_VARIANTS.at(-1));
  const result=inspect(f);
  assert.equal(result.status,'compatible-candidate',result.reason);
  assert.equal(inspect(f,{[result.candidateSourcePin.key]:result.candidateSourcePin.value}).status,'compatible-known');
  change(f,'general-settings','optimistic:!1','optimistic:!0');
  reject(f,/native non-optimistic appearance writer/);
});

test('latest Appearance bindings cannot use an older mount or React initializer', () => {
  const latest=APPEARANCE_VARIANTS.at(-1);
  const otherMount=APPEARANCE_VARIANTS.find(variant=>variant.mountNeedle!==latest.mountNeedle).mountNeedle;
  let f=fixture(SIDEBAR_VARIANTS.at(-1),latest);
  change(f,'appearance-settings',latest.mountNeedle,otherMount);
  reject(f,/exactly one native Appearance mount/);
  f=fixture(SIDEBAR_VARIANTS.at(-1),latest);
  change(f,'appearance-settings',`m=${latest.reactAlias}()`,'m=other()');
  reject(f,/React\/JSX\/cache initialization changed/);
});

test('split renderer pins both initial and primary through the actual native import chain',()=>{
  const f=splitFixture(), before=JSON.stringify([...f.assets]);
  const result=inspect(f);
  assert.equal(result.status,'compatible-candidate',result.reason);
  const proposal=result.candidateSourcePin;
  assert.equal(proposal.value.initialRenderer,'webview/assets/app-initial-a1.js');
  assert.equal(proposal.value.primaryRenderer,'webview/assets/app-primary-a1.js');
  assert.equal(proposal.value.primaryRendererHash,sha(f.assets.get(proposal.value.primaryRenderer)));
  assert.equal(inspect(f,{[proposal.key]:proposal.value}).status,'compatible-known');
  assert.equal(JSON.stringify([...f.assets]),before,'inspection must not mutate native modules');
  for(const role of ['initialRenderer','primaryRenderer']){
    const changed=splitFixture();
    changed.assets.set(proposal.value[role],changed.assets.get(proposal.value[role])+'/* changed */');
    rejectKnown(changed,proposal,new RegExp(`${role}Hash`));
  }
  function rejectKnown(changed,proposal,reason){
    const result=inspect(changed,{[proposal.key]:proposal.value});
    assert.equal(result.status,'unsupported');assert.match(result.reason,reason);
  }
});
test('split renderer refuses preload catalogs in place of real import edges',()=>{
  for(const [file,original,replacement] of [
    ['entry-a1.js','import("./app-main-a1.js")','const deps=["./app-main-a1.js"]'],
    ['app-main-a1.js','import("./app-runtime-a1.js")','const deps=["./app-runtime-a1.js"]'],
    ['app-runtime-a1.js','import{state as nativeState}from"./app-primary-a1.js"','const deps=["./app-primary-a1.js"]'],
  ]){
    const f=splitFixture();change(f,file,original,replacement);
    reject(f,/native (?:main|runtime|primary) renderer|reviewed native sidebar/);
  }
});
test('split renderer refuses missing, duplicate, unlinked, or unreviewed primary modules',()=>{
  let f=splitFixture();f.assets.delete('webview/assets/app-primary-a1.js');reject(f,/native primary renderer/);
  f=splitFixture();f.assets.set('webview/assets/app-primary-a2.js',SIDEBAR_VARIANTS.at(-1).hook);reject(f,/exactly one native primary renderer/);
  f=splitFixture();change(f,'app-runtime-a1.js','app-primary-a1.js','app-primary-a2.js');reject(f,/Missing renderer asset/);
  f=splitFixture();f.assets.set('webview/assets/app-primary-a1.js','export const state = {};');reject(f,/reviewed native sidebar/);
});
test('builder and inspector share split-renderer discovery',()=>{
  for(const file of ['build.mjs','compatibility.mjs']){
    const source=fs.readFileSync(new URL(`../scripts/${file}`,import.meta.url),'utf8');
    assert.ok(source.includes("import { discoverRendererLayout } from './renderer-layout.mjs';"));
    assert.ok(source.includes('const layout = discoverRendererLayout('));
  }
});

test('legacy main imports keep patching initial even when an unrelated primary asset exists',()=>{
  const f=fixture();
  f.assets.set('webview/assets/entry-a1.js','import("./app-main-a1.js");');
  f.assets.set('webview/assets/app-main-a1.js','import "./app-initial-a1.js";');
  f.assets.set('webview/assets/app-primary-a1.js','import "./app-initial-a1.js";');
  const result=inspect(f);
  assert.equal(result.status,'compatible-candidate',result.reason);
  assert.equal(result.candidateSourcePin.value.primaryRenderer,undefined);
  assert.equal(result.candidateSourcePin.value.initialRenderer,'webview/assets/app-initial-a1.js');
});
