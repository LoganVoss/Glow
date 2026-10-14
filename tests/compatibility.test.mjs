import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { inspectStructure, APPEARANCE_NEEDLE } from '../scripts/compatibility.mjs';
import { SIDEBAR_VARIANTS } from '../scripts/sidebar-cycle-patch.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function fixture(variant = SIDEBAR_VARIANTS[0]) {
  const assets = new Map(Object.entries({
    'webview/index.html': '<head><meta http-equiv="Content-Security-Policy" content="default-src \'self\'">\n<link href="./assets/app-shared-a1.css">\n<script type="module" src="./assets/entry-a1.js"></script>\n</head><body></body>',
    'webview/assets/app-shared-a1.css': ':root{color:black}',
    'webview/assets/appearance-settings-a1.js': `import{Agn as t,PCn as r}from"./app-shared-a1.js";import{n as u}from"./general-settings-a1.js";var m,h;m=r();h=t();function f(){const i=true;return ${APPEARANCE_NEEDLE}}`,
    'webview/assets/app-shared-a1.js': 'export{a as Fan,b as H0t,c as p3t,d as wjt,e as Agn,f as PCn};',
    'webview/assets/general-settings-a1.js': 'import{Fan as N,H0t as P,p3t as Xt,wjt as V}from"./app-shared-a1.js";function theme(){let t=N(P);return e=>V(t,Xt.theme,e,{optimistic:!1})}',
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
  reject(f, /linked native initial renderer/);
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
  f = fixture();change(f, 'appearance-settings', 'var m,h;', 'var m,h,__scope;');reject(f, /Reserved mount identifier/);
});
test('missing entry module or duplicate CSP is refused', () => {
  let f = fixture();change(f, 'index.html', 'type="module"', 'type="text/javascript"');reject(f, /native entry module/);
  f = fixture();change(f, 'index.html', '</head>', '<meta http-equiv="Content-Security-Policy" content="none"></head>');reject(f, /exactly one Content-Security-Policy/);
});
test('missing bridge export or changed native writer semantics is refused', () => {
  let f = fixture();change(f, 'app-shared-a1.js', 'd as wjt', 'd as other');reject(f, /bridge export missing: wjt/);
  f = fixture();change(f, 'general-settings', 'optimistic:!1', 'optimistic:!0');reject(f, /non-optimistic appearance writer changed/);
  f = fixture();change(f, 'general-settings', 't=N(P)', 't=N(other)');reject(f, /scope binding changed/);
});
test('changed React bindings or malformed transform is refused', () => {
  let f = fixture();change(f, 'appearance-settings', 'm=r()', 'm=other()');reject(f, /React\/JSX initialization changed/);
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
test('inspector transform strings track current builder insertion rather than inventing a mount', () => {
  const builder=fs.readFileSync(new URL('../scripts/build.mjs',import.meta.url),'utf8');
  const inspector=fs.readFileSync(new URL('../scripts/compatibility.mjs',import.meta.url),'utf8');
  assert.ok(builder.includes(`const needle = '${APPEARANCE_NEEDLE}'`));
  const builderReplacement=builder.match(/const replacement = ('[^\n]+');/)[1];
  assert.ok(inspector.includes(`const replacement = ${builderReplacement};`));
  const builderBoot=builder.match(/const appearanceBoot = (`[^\n]+`);/)[1].replace('PIN.settingsBridge','bridgePath');
  assert.ok(inspector.includes(`const appearanceBoot = ${builderBoot};`));
});
