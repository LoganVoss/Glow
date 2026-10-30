#!/usr/bin/env node
/** Read-only compatibility proposal. Never signs, patches, installs, or launches. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { patchSidebarCycle } from './sidebar-cycle-patch.mjs';
import { patchAppearance } from './appearance-patch.mjs';
import { discoverRendererLayout, discoverRendererStylesheet } from './renderer-layout.mjs';
export { APPEARANCE_NEEDLE } from './appearance-patch.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const FRAMEWORK = 'Contents/Frameworks/Codex Framework.framework/Codex Framework';
const FUSE = '010011001';
const FUSE_SENTINEL = Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX');
const DIGEST_SENTINEL = Buffer.from('AGbevlPCksUGKNL8TSn7wGmJEuJsXb2A');
const count = (value, needle) => value.split(needle).length - 1;
const LIMITS = [
  'Static inspection only: does not establish native launch, sign-in, updates, or full runtime compatibility.',
  'A candidate pin is a review proposal, not permission to bypass the builder or installer safeguards.',
  'No app files, preferences, source pins, signatures, or system protections were changed.',
];
function fail(message) { throw new Error(message); }
function requireCheck(value, message) { if (!value) fail(message); }
function one(values, label) { requireCheck(values.length === 1, `Expected exactly one ${label}; found ${values.length}`); return values[0]; }
function imports(source) {
  return [...source.matchAll(/import\{([^}]+)\}from["'](\.\/[^"']+)["']/g)].map(match => ({ file: path.posix.normalize(`webview/assets/${match[2]}`), bindings: match[1] }));
}
function offsets(buffer, sentinel) {
  const result = [];
  for (let i = buffer.indexOf(sentinel); i >= 0; i = buffer.indexOf(sentinel, i + 1)) result.push(i + sentinel.length);
  return result;
}
function checkFramework(bytes, integrity) {
  const base = one(offsets(bytes, FUSE_SENTINEL), 'Electron fuse record');
  requireCheck(bytes[base] === 1 && bytes[base + 1] === FUSE.length, 'Unexpected Electron fuse format');
  requireCheck(bytes.subarray(base + 2, base + 2 + FUSE.length).toString('ascii') === FUSE, 'Electron fuse settings changed');
  const at = one(offsets(bytes, DIGEST_SENTINEL), 'embedded integrity record');
  requireCheck(at + 34 <= bytes.length && bytes[at] === 1 && bytes[at + 1] === 1, 'Unexpected embedded integrity format');
  const digest = createHash('sha256');
  for (const key of Object.keys(integrity).sort()) digest.update(key).update(integrity[key].algorithm).update(integrity[key].hash);
  requireCheck(bytes.subarray(at + 2, at + 34).equals(digest.digest()), 'Embedded framework integrity differs from Info.plist');
}

/** Pure structural inspector. The CLI separately requires the vendor signature. */
export function inspectStructure({ files, readFile, info, headerHash, frameworkBytes, pins = {} }) {
  const version = String(info.CFBundleShortVersionString ?? '');
  const build = String(info.CFBundleVersion ?? '');
  const report = { schemaVersion: 1, readOnly: true, status: 'unsupported', version, build, bundle: info.CFBundleIdentifier, evidence: [], assets: {}, limitations: LIMITS };
  const evidence = (check, detail) => report.evidence.push({ check, passed: true, detail });
  try {
    requireCheck(info.CFBundleIdentifier === 'com.openai.codex', 'Source is not the Codex application');
    requireCheck(version.length > 0 && build.length > 0, 'Missing app version or build');
    const names = files.map(file => file.replace(/^\//, ''));
    requireCheck(new Set(names).size === names.length, 'Duplicate archive paths');
    const read = file => { requireCheck(names.includes(file), `Missing archive asset: ${file}`); return readFile(file).toString(); };
    requireCheck(!names.some(file => /^webview\/assets\/(?:neon-codex|preferences|glow-layer)\.js$/.test(file)), 'Glow assets already exist; inspect the matching preserved OpenAI-signed original instead');
    const htmlPath = one(names.filter(file => file === 'webview/index.html'), 'renderer HTML');
    const html = read(htmlPath);
    requireCheck(!html.includes('neon-codex'), 'Renderer is already patched; inspect the matching preserved original');
    const layout = discoverRendererLayout({ files: names, readFile, html });
    const initialPath = layout.initialPath;
    const cssPath = discoverRendererStylesheet({ files: names, html });
    const appearancePath = one(names.filter(file => /^webview\/assets\/appearance-settings-[a-f0-9]+\.js$/.test(file)), 'Appearance component');
    const appearance = read(appearancePath);
    const appearanceImports = imports(appearance);
    const bridgeImport = one(appearanceImports.filter(item => /^webview\/assets\/app-shared-[a-f0-9]+\.js$/.test(item.file)), 'Appearance settings bridge import');
    const generalImport = one(appearanceImports.filter(item => /^webview\/assets\/general-settings-[a-f0-9]+\.js$/.test(item.file)), 'native general settings import');
    const bridgePath = bridgeImport.file, generalPath = generalImport.file;
    const css = read(cssPath), bridge = read(bridgePath), general = read(generalPath);
    for (const [role, file] of Object.entries({ html: htmlPath, css: cssPath, appearance: appearancePath, settingsBridge: bridgePath, generalSettings: generalPath, initialRenderer: initialPath, ...(layout.primaryPath ? { primaryRenderer: layout.primaryPath } : {}) })) {
      const bytes = readFile(file); report.assets[role] = { path: file, bytes: bytes.length, sha256: sha(bytes) };
    }
    evidence('asset-discovery', 'Unambiguous hashed assets, linked through the renderer and Appearance imports');
    requireCheck(!css.includes('NEON CODEX LOCAL THEME'), 'Stylesheet already contains Glow; inspect the matching preserved original');
    // Exact transform preconditions from build.mjs patchAssets (guarded by tests).
    requireCheck(count(html, '</head>') === 1, 'Expected one closing head element');
    const firstModule = html.match(/^[ \t]*<script\s+type="module"[^>]*><\/script>/m);
    requireCheck(firstModule, 'Expected a native entry module');
    const csp = html.match(/<meta\s+http-equiv="Content-Security-Policy"[^>]*>/g) || [];
    requireCheck(csp.length === 1, 'Expected exactly one Content-Security-Policy element');
    const patchedHTML = html.replace(firstModule[0], '    <script type="module" src="./assets/neon-codex.js"></script>\n' + firstModule[0]);
    requireCheck(patchedHTML !== html && (patchedHTML.match(/<meta\s+http-equiv="Content-Security-Policy"[^>]*>/g) || [])[0] === csp[0], 'Module insertion changed CSP');
    const patchedAppearance = patchAppearance({ appearance, bridge, general, bridgePath, generalPath });
    try { execFileSync(process.execPath, ['--input-type=module', '--check'], { input: patchedAppearance, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch { fail('Transformed Appearance module does not parse'); }
    evidence('appearance-transform', 'Reviewed native mount and React/JSX bindings, unchanged CSP, and transformed module syntax');
    evidence('settings-bridge', 'Reviewed exports and the native scoped non-optimistic theme writer are present');
    const patchedSidebar = patchSidebarCycle(read(layout.sidebarPath));
    try { execFileSync(process.execPath, ['--input-type=module', '--check'], { input: patchedSidebar, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch { fail('Transformed native sidebar command does not parse'); }
    evidence('sidebar-command', 'Reviewed titlebar/menu command has a fail-open optional bridge, unchanged native fallback, and no new imports');
    const integrity = info.ElectronAsarIntegrity;
    requireCheck(integrity?.['Resources/app.asar']?.algorithm === 'SHA256' && integrity['Resources/app.asar'].hash === headerHash, 'ASAR header differs from Info.plist integrity');
    checkFramework(frameworkBytes, integrity);
    evidence('electron-integrity', 'ASAR header, framework digest, and reviewed fuse settings agree');
    const candidate = { bundle: info.CFBundleIdentifier, version, build, header: headerHash, css: cssPath, cssHash: report.assets.css.sha256, framework: FRAMEWORK, fuse: FUSE, html: htmlPath, htmlHash: report.assets.html.sha256, appearance: appearancePath, appearanceHash: report.assets.appearance.sha256, settingsBridge: bridgePath, settingsBridgeHash: report.assets.settingsBridge.sha256, generalSettings: generalPath, generalSettingsHash: report.assets.generalSettings.sha256, initialRenderer: initialPath, initialRendererHash: report.assets.initialRenderer.sha256 };
    if (layout.primaryPath) Object.assign(candidate, { primaryRenderer: layout.primaryPath, primaryRendererHash: report.assets.primaryRenderer.sha256 });
    const known = pins[`${version}:${build}`];
    if (known) {
      requireCheck(known.primaryRenderer === candidate.primaryRenderer, 'Reviewed source pin mismatch: primaryRenderer');
      requireCheck(known.primaryRendererHash === candidate.primaryRendererHash, 'Reviewed source pin mismatch: primaryRendererHash');
      for (const [key, value] of Object.entries(candidate)) requireCheck(known[key] === value, `Reviewed source pin mismatch: ${key}`);
      report.status = 'compatible-known';
      evidence('reviewed-source-pin', 'All discovered paths, asset hashes, framework settings, and archive header match the reviewed build');
    } else {
      report.status = 'compatible-candidate';
      report.candidateSourcePin = { key: `${version}:${build}`, value: candidate };
      evidence('structural-candidate', 'Current transform conditions passed; proposed pin requires compatibility review and native testing');
    }
  } catch (error) { report.reason = error.message; }
  return report;
}
function run(exe, args) { return execFileSync(exe, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }); }

export async function inspectApp(source) {
  const report = { schemaVersion: 1, readOnly: true, status: 'unsupported', source: path.resolve(source), vendorSignatureVerified: false, evidence: [], limitations: LIMITS };
  try {
    requireCheck(process.platform === 'darwin', 'Real app inspection requires macOS codesign and plutil');
    const real = fs.realpathSync(source);
    report.source = real;
    const info = JSON.parse(run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', path.join(real, 'Contents/Info.plist')]));
    Object.assign(report, { version: String(info.CFBundleShortVersionString ?? ''), build: String(info.CFBundleVersion ?? ''), bundle: info.CFBundleIdentifier });
    requireCheck(info.CFBundleIdentifier === 'com.openai.codex', 'Source is not the Codex application');
    try {
      run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--test-requirement', '=anchor apple generic and certificate leaf[subject.OU] = "2DC432GLL2"', real]);
    } catch {
      fail('Source is not an intact OpenAI-signed app. If Glow is installed, pass --source with the matching preserved original in .local/originals/<version>-<build>/ChatGPT.app (or the legacy .local/original/ChatGPT.app). Never inspect a modified copy as the vendor source.');
    }
    report.vendorSignatureVerified = true;
    const asar = await import('@electron/asar');
    const archive = path.join(real, 'Contents/Resources/app.asar');
    const raw = asar.getRawHeader(archive);
    const pins = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/source-pins.json'), 'utf8'));
    Object.assign(report, inspectStructure({ files: asar.listPackage(archive), readFile: file => asar.extractFile(archive, file), info, headerHash: sha(raw.headerString), frameworkBytes: fs.readFileSync(path.join(real, FRAMEWORK)), pins }));
    report.evidence.unshift({ check: 'vendor-signature', passed: true, detail: 'codesign --deep --strict verified the Apple chain and OpenAI team 2DC432GLL2' });
  } catch (error) { report.reason = error.message; }
  return report;
}
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log('Usage: node scripts/compatibility.mjs [--source /path/to/ChatGPT.app]\nRead-only static inspection; default /Applications/ChatGPT.app. No signing certificate needed.\nJSON status: compatible-known, compatible-candidate, or unsupported. Candidates are not runtime approval.'); return;
  }
  let source = '/Applications/ChatGPT.app';
  if (args.length) {
    if (args.length !== 2 || args[0] !== '--source') { console.log(JSON.stringify({ schemaVersion: 1, readOnly: true, status: 'unsupported', reason: 'Use --source /path/to/ChatGPT.app or --help' }, null, 2)); process.exitCode = 2; return; }
    source = args[1];
  }
  const report = await inspectApp(source);
  console.log(JSON.stringify(report, null, 2));
  if (report.status === 'unsupported') process.exitCode = 2;
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) await main();
