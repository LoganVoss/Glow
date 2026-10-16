#!/usr/bin/env node
/** Neon Codex — local, reversible theme build. Never installs or launches an app.
 * Theme CSS, a self-origin settings module, and a pinned Appearance mount are edited.
 * ASAR file metadata, Electron integrity digests, and
 * signatures are rebuilt as needed. The installed app is opened read-only.
 * This is a local modification, NOT an official Codex plugin or notarized app.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash, X509Certificate, randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { withLocalIdentity } from './local-identity.mjs';
import { patchSidebarCycle } from './sidebar-cycle-patch.mjs';
import { patchAppearance } from './appearance-patch.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
const LOCAL = path.join(ROOT, '.local');
const THEME_VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const SOURCE_PINS = JSON.parse(fs.readFileSync(path.join(HERE, 'source-pins.json'), 'utf8'));
let PIN;
const MARKER = '\n/* NEON CODEX LOCAL THEME — BEGIN */\n';
const FUSE_SENTINEL = Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX');
const DIGEST_SENTINEL = Buffer.from('AGbevlPCksUGKNL8TSn7wGmJEuJsXb2A');
const args = process.argv.slice(2);
const options = { output: path.join(LOCAL, 'staging/ChatGPT.app'), 'installed-app': '/Applications/ChatGPT.app' };
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--inspect') options.inspect = true;
  else if (args[i] === '--check-assets') options.checkAssets = true;
  else if (args[i] === '--self-test-archive') options.selfTestArchive = true;
  else if (args[i] === '--check-identity') options.checkIdentity = true;
  else if (args[i] === '--list-identities') options.listIdentities = true;
  else if (args[i] === '--local-signing') options.localSigning = true;
  else if (args[i] === '--help') {
    console.log('Usage: node scripts/build.mjs [--identity CERTIFICATE_SHA1 | --local-signing] [--source PATH] [--output PATH] [--installed-app PATH] [--asar-module PATH]\n       node scripts/build.mjs --inspect [--source PATH]\n       node scripts/build.mjs --check-identity --identity CERTIFICATE_SHA1\n       node scripts/build.mjs --list-identities\n       node scripts/build.mjs --check-assets [--source PATH]\n       node scripts/build.mjs --self-test-archive\n\nDefault builds require an Apple-issued codesigning identity SHA-1. Opt-in --local-signing creates and reuses a private self-signed identity on this Mac. No Apple certificate or membership is required. It adds an app-specific library-validation exception and is not notarized. It never changes system-wide protections or quarantine.\n\nRequires macOS and Node 22.12+. Builds a NEW local copy; never overwrites, installs, launches, edits user data, changes fuses, or modifies system protections. Source versions are deliberately pinned in scripts/source-pins.json; new app versions require review. Delete the resulting copy to discard this build.');
    process.exit(0);
  } else if (args[i] === '--identity' && args[i + 1]) options.identity = args[++i].toUpperCase();
  else if (['--source', '--output', '--installed-app', '--asar-module'].includes(args[i]) && args[i + 1]) options[args[i++].slice(2)] = path.resolve(args[i]);
  else throw new Error(`Unknown or incomplete option: ${args[i]}`);
}
if (options.localSigning && options.identity) throw new Error('--local-signing and --identity are mutually exclusive.');
if (options.localSigning && (options.checkIdentity || options.listIdentities)) throw new Error('Local signing manages its own identity; Apple identity operations cannot be combined with it.');
if (process.platform !== 'darwin') throw new Error('This build uses macOS ditto, plutil, and codesign.');
const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number);
if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 12)) throw new Error('Node 22.12 or newer is required.');
const sha = value => createHash('sha256').update(value).digest('hex');
function run(exe, argv, extra = {}) {
  try { return execFileSync(exe, argv, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'], ...extra }); }
  catch (error) { throw new Error(`${path.basename(exe)} failed: ${(error.stderr || error.message).toString().trim()}`); }
}
function plist(file) { return JSON.parse(run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', file])); }
function availableIdentities() {
  const available = run('/usr/bin/security', ['find-identity', '-v', '-p', 'codesigning']);
  return [...available.matchAll(/^\s*\d+\)\s+([0-9A-Fa-f]{40})\s+"([^"\r\n]+)"\s*$/gm)].map(match => ({ sha1: match[1].toUpperCase(), name: match[2] }));
}
function validateSigningIdentity(requested = options.identity) {
  if (!requested) throw new Error('Choose --identity CERTIFICATE_SHA1, or explicitly opt into certificate-free --local-signing with its app-specific library-validation exception. --inspect remains available without either.');
  assert.match(requested, /^[0-9A-F]{40}$/, '--identity must be an explicit 40-character certificate SHA-1; ad-hoc signing and identity-name lookup are not accepted');
  const identity = availableIdentities().find(item => item.sha1 === requested);
  assert.ok(identity, 'Requested certificate is not an available valid codesigning identity');
  const name = identity.name;
  const publicCertificates = run('/usr/bin/security', ['find-certificate', '-a', '-c', name, '-p']);
  const certificates = [...publicCertificates.matchAll(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g)].map(match => new X509Certificate(match[0]));
  const certificate = certificates.find(cert => cert.fingerprint.replaceAll(':', '').toUpperCase() === requested);
  assert.ok(certificate, 'Could not read the public certificate corresponding to the selected identity');
  const teamIdentifier = certificate.subject.match(/^OU=([A-Z0-9]{10})$/m)?.[1];
  assert.ok(teamIdentifier, 'Selected certificate lacks a valid nonempty Apple Team Identifier');
  const appleIssuer = /(?:^|\n)O=Apple Inc\.(?:\n|$)/.test(certificate.issuer);
  assert.ok(appleIssuer, 'Selected certificate was not issued by Apple');
  assert.ok(Date.now() >= Date.parse(certificate.validFrom) && Date.now() <= Date.parse(certificate.validTo), 'Selected certificate is outside its validity period');
  return { sha1: requested, name, teamIdentifier, certificateValidTo: certificate.validTo };
}
function signingMetadata(file) {
  const result = spawnSync('/usr/bin/codesign', ['--display', '--verbose=4', file], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`Unable to inspect code signature: ${result.error?.message || result.stderr}`);
  const detail = `${result.stdout}\n${result.stderr}`;
  const flagString = detail.match(/\bflags=0x([0-9a-fA-F]+)/)?.[1];
  assert.ok(flagString, `Missing code-signing flags: ${file}`);
  return { identifier: detail.match(/^Identifier=(.+)$/m)?.[1]?.trim(), teamIdentifier: detail.match(/^TeamIdentifier=(.+)$/m)?.[1]?.trim(), flags: Number.parseInt(flagString, 16), adHoc: /^Signature=adhoc$/m.test(detail) };
}
function localRequirement(identifier, identity) {
  assert.match(identifier, /^[A-Za-z0-9_.-]+$/, 'Unsupported code signing identifier');
  assert.match(identity.sha1, /^[0-9A-F]{40}$/, 'Invalid local certificate pin');
  return `identifier "${identifier}" and certificate leaf = H"${identity.sha1.toLowerCase()}"`;
}
function verifySigningTeam(file, identity) {
  const metadata = signingMetadata(file);
  if (identity.kind === 'local') {
    assert.equal(metadata.adHoc, false, `Expected persistent local signature: ${file}`);
    assert.ok(!metadata.teamIdentifier || metadata.teamIdentifier === 'not set', `Unexpected certificate team on local code: ${file}`);
    const requirement = localRequirement(metadata.identifier, identity);
    run('/usr/bin/codesign', ['--verify', '--strict', '--test-requirement', `=${requirement}`, file]);
    const displayed = spawnSync('/usr/bin/codesign', ['--display', '-r-', file], { encoding: 'utf8' });
    assert.equal(displayed.status, 0, `Cannot inspect designated requirement: ${file}`);
    const actual = `${displayed.stdout}\n${displayed.stderr}`.match(/^designated => (.+)$/m)?.[1];
    // codesign omits quotes around simple identifiers when displaying a DR.
    // Accept only these two terms; never an identifier-only or broader rule.
    const parts = actual?.match(/^identifier (?:"([A-Za-z0-9_.-]+)"|([A-Za-z0-9_.-]+)) and certificate (?:leaf|0) = H"([0-9a-fA-F]{40})"$/);
    assert.ok(parts && (parts[1] || parts[2]) === metadata.identifier && parts[3].toUpperCase() === identity.sha1,
      `Local designated requirement is not pinned to the signing certificate and identifier: ${file}`);
    return metadata;
  }
  assert.ok(metadata.teamIdentifier && metadata.teamIdentifier !== 'not set', `Signed code has no Team Identifier: ${file}`);
  assert.equal(metadata.teamIdentifier, identity.teamIdentifier, `Signed code Team Identifier mismatch: ${file}`);
  assert.equal(metadata.adHoc, false, `Ad-hoc code is not allowed: ${file}`);
  return metadata;
}
function nodeAt(header, file) { return file.split('/').reduce((node, key) => node.files[key], header); }
function flatten(node, prefix = '', out = new Map()) {
  for (const [name, entry] of Object.entries(node.files || {})) {
    const file = prefix ? `${prefix}/${name}` : name; out.set(file, entry);
    if (entry.files) flatten(entry, file, out);
  }
  return out;
}
async function hashFile(file, start, end) {
  const h = createHash('sha256');
  for await (const chunk of fs.createReadStream(file, { ...(start === undefined ? {} : { start }), ...(end === undefined ? {} : { end }) })) h.update(chunk);
  return h.digest('hex');
}
async function loadAsar() {
  const candidates = [options['asar-module'], path.join(ROOT, 'node_modules/@electron/asar/lib/asar.js')].filter(Boolean);
  for (const candidate of candidates) if (fs.existsSync(candidate)) return import(pathToFileURL(candidate).href);
  try { return await import('@electron/asar'); }
  catch { throw new Error('Install the pinned build dependency with npm ci --ignore-scripts in the repository, or pass --asar-module /path/to/@electron/asar/lib/asar.js.'); }
}
function occurrences(buffer, needle) {
  const found = [];
  for (let i = buffer.indexOf(needle); i >= 0; i = buffer.indexOf(needle, i + 1)) found.push(i);
  return found;
}
function inspectFramework(buffer, integrity) {
  const fuses = occurrences(buffer, FUSE_SENTINEL).map(offset => {
    const base = offset + FUSE_SENTINEL.length;
    const version = buffer[base], length = buffer[base + 1];
    assert.equal(version, 1, 'Unexpected Electron fuse format');
    const wire = buffer.subarray(base + 2, base + 2 + length).toString('ascii');
    assert.equal(wire, PIN.fuse, 'Unexpected Electron fuse settings');
    return { offset, version, wire };
  });
  assert.equal(fuses.length, 1, 'Only the reviewed arm64 build is supported');
  const digest = integrityDigest(integrity);
  const slots = occurrences(buffer, DIGEST_SENTINEL).map(offset => {
    const base = offset + DIGEST_SENTINEL.length;
    assert.ok(base + 34 <= buffer.length, 'Truncated embedded digest');
    assert.equal(buffer[base], 1, 'Expected active embedded integrity digest');
    assert.equal(buffer[base + 1], 1, 'Unsupported embedded integrity version');
    assert.ok(buffer.subarray(base + 2, base + 34).equals(digest), 'Embedded digest does not match Info.plist');
    return { offset, used: 1, version: 1, digest: digest.toString('hex') };
  });
  assert.equal(slots.length, 1, 'Expected exactly one active embedded digest');
  return { fuses, slots };
}
function integrityDigest(integrity) {
  // Electron packager: SHA256 of sorted (resource path, algorithm, hash) tuples.
  const hash = createHash('sha256');
  for (const key of Object.keys(integrity).sort()) hash.update(key).update(integrity[key].algorithm).update(integrity[key].hash);
  return hash.digest();
}
function fileIntegrity(buffer, blockSize = 4 * 1024 * 1024) {
  const blocks = [];
  for (let offset = 0; offset < buffer.length; offset += blockSize) blocks.push(sha(buffer.subarray(offset, offset + blockSize)));
  if (!blocks.length || buffer.length % blockSize === 0) blocks.push(sha(Buffer.alloc(0)));
  return { algorithm: 'SHA256', hash: sha(buffer), blockSize, blocks };
}
function encodeHeader(header) {
  const json = Buffer.from(JSON.stringify(header));
  const payloadLength = Math.ceil((4 + json.length) / 4) * 4;
  const result = Buffer.alloc(8 + 4 + payloadLength);
  result.writeUInt32LE(4, 0); result.writeUInt32LE(4 + payloadLength, 4);
  result.writeUInt32LE(payloadLength, 8); result.writeUInt32LE(json.length, 12); json.copy(result, 16);
  return result;
}
async function writeAll(handle, buffer) {
  let offset = 0;
  while (offset < buffer.length) offset += (await handle.write(buffer, offset, buffer.length - offset)).bytesWritten;
}
async function appendPatchedEntries(source, output, header, oldDataStart, replacements) {
  const handle = await fsp.open(output, 'wx');
  try {
    await writeAll(handle, encodeHeader(header));
    for await (const chunk of fs.createReadStream(source, { start: oldDataStart })) await writeAll(handle, chunk);
    for (const content of replacements.values()) await writeAll(handle, content);
    await handle.sync();
  } finally { await handle.close(); }
}
async function walk(dir, files = [], dirs = []) {
  for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) { dirs.push(file); await walk(file, files, dirs); }
    else if (entry.isFile()) files.push(file);
  }
  return { files, dirs };
}
async function isMachO(file) {
  if (file.includes('.dSYM/')) return false;
  const handle = await fsp.open(file, 'r'); const buffer = Buffer.alloc(4);
  try { await handle.read(buffer, 0, 4, 0); } finally { await handle.close(); }
  return new Set(['feedface', 'cefaedfe', 'feedfacf', 'cffaedfe', 'cafebabe', 'bebafeca', 'cafebabf', 'bfbafeca']).has(buffer.toString('hex'));
}
function readEntitlements(file) {
  const xml = run('/usr/bin/codesign', ['--display', '--entitlements', '-', '--xml', file]);
  if (!xml.trim()) return {};
  return JSON.parse(run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '--', '-'], { input: xml }));
}
function sanitizeEntitlements(value) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !key.startsWith('com.apple.developer.') && !['com.apple.application-identifier', 'application-identifier', 'keychain-access-groups', 'com.apple.security.application-groups'].includes(key)));
}
function executableCode(file) {
  let executable = file;
  if (fs.statSync(file).isDirectory()) {
    const infoPath = ['Contents/Info.plist', 'Resources/Info.plist', 'Versions/Current/Resources/Info.plist']
      .map(relative => path.join(file, relative)).find(candidate => fs.existsSync(candidate));
    assert.ok(infoPath, `Cannot inspect signing bundle metadata: ${file}`);
    const name = plist(infoPath).CFBundleExecutable;
    assert.ok(typeof name === 'string' && name && !name.includes('/'), 'Invalid bundle executable');
    executable = [path.join(file, 'Contents/MacOS', name), path.join(file, name)]
      .find(candidate => fs.existsSync(candidate));
    assert.ok(executable, `Bundle executable is missing: ${file}`);
  }
  return /Mach-O[^\n]*executable/.test(run('/usr/bin/file', ['-b', executable]));
}
function makePlist(value) { return run('/usr/bin/plutil', ['-convert', 'xml1', '-o', '-', '--', '-'], { input: JSON.stringify(value) }); }
async function signOne(file, scratch, report, identity) {
  const beforeSignature = signingMetadata(file);
  const entitlements = readEntitlements(file);
  const safe = sanitizeEntitlements(entitlements);
  const isExecutable = executableCode(file);
  const localExecutable = identity.kind === 'local' && isExecutable;
  if (localExecutable) {
    assert.equal(beforeSignature.flags & 0x2000, 0, `Explicit library validation cannot be preserved with local signing: ${file}`);
    safe['com.apple.security.cs.disable-library-validation'] = true;
  }
  const removed = Object.keys(entitlements).filter(key => !(key in safe));
  const entitlementPath = path.join(scratch, 'signing-entitlements.plist');
  await fsp.writeFile(entitlementPath, makePlist(safe));
  // macOS 15 (Darwin 24) stopped embedding library entitlements by default.
  // Preserve existing sanitized entitlements, without granting new ones to
  // libraries. Older codesign versions embed these without the new flag.
  const libraryEntitlementArgs = !isExecutable && Object.keys(safe).length && Number.parseInt(os.release(), 10) >= 24 ? ['--force-library-entitlements'] : [];
  const localIdentityArgs = identity.kind === 'local' ? ['--keychain', identity.keychainPath, '--identifier', beforeSignature.identifier, '--requirements', `=designated => ${localRequirement(beforeSignature.identifier, identity)}`] : [];
  run('/usr/bin/codesign', ['--force', '--sign', identity.sha1, '--timestamp=none', '--preserve-metadata=flags,runtime', ...localIdentityArgs, ...libraryEntitlementArgs, '--entitlements', entitlementPath, file]);
  const afterSignature = verifySigningTeam(file, identity);
  if (identity.kind === 'local') assert.equal(afterSignature.identifier, beforeSignature.identifier, `Code signing identifier changed: ${file}`);
  assert.equal(afterSignature.flags & ~2, beforeSignature.flags & ~2, `Code-signing security flags changed: ${file}`);
  assert.deepEqual(readEntitlements(file), safe, `Signed entitlements differ from the intended policy: ${file}`);
  report.push({ path: path.relative(options.output, file), removedEntitlements: removed, teamIdentifier: afterSignature.teamIdentifier, flags: afterSignature.flags, adHoc: afterSignature.adHoc, libraryValidationException: localExecutable, entitlements: safe });
}
function bundleSnapshot(app) {
  return JSON.parse(run('/usr/bin/python3', [path.join(HERE, 'install.py'), '--snapshot', app]));
}
function cspMeta(html) {
  const matches = html.match(/<meta\s+http-equiv="Content-Security-Policy"[^>]*>/g) || [];
  assert.equal(matches.length, 1, 'Expected exactly one Content-Security-Policy element');
  return matches[0];
}
function patchAssets(asar, archive, originalCSS) {
  const sourceFiles = ['src/glow.css', 'src/settings.css', 'src/neon-codex.js', 'src/preferences.js', 'src/glow-layer.js', 'src/theme-transition.js', 'src/theme-transition.css', 'src/sidebar-cycle.js', 'src/sidebar-cycle.css'];
  const assets = Object.fromEntries(sourceFiles.map(file => [file, fs.readFileSync(path.join(ROOT, file))]));
  for (const [file, content] of Object.entries(assets)) assert.ok(content.length > 100, `Missing or empty source asset: ${file}`);
  const originalHTML = asar.extractFile(archive, PIN.html);
  const originalAppearance = asar.extractFile(archive, PIN.appearance);
  const originalInitial = asar.extractFile(archive, PIN.initialRenderer);
  assert.equal(sha(originalHTML), PIN.htmlHash, 'Renderer HTML differs from the reviewed original');
  assert.equal(sha(originalAppearance), PIN.appearanceHash, 'Appearance component differs from the reviewed original');
  assert.equal(sha(originalInitial), PIN.initialRendererHash, 'Native initial renderer differs from the reviewed original');
  assert.equal(sha(asar.extractFile(archive, PIN.settingsBridge)), PIN.settingsBridgeHash, 'Native settings bridge differs from the reviewed original');
  assert.equal(sha(asar.extractFile(archive, PIN.generalSettings)), PIN.generalSettingsHash, 'Native appearance control differs from the reviewed original');
  const html = originalHTML.toString();
  assert.equal(html.split('</head>').length - 1, 1, 'Expected one closing head element');
  const scriptTag = '    <script type="module" src="./assets/neon-codex.js"></script>\n';
  const firstModule = html.match(/^[ \t]*<script\s+type="module"[^>]*><\/script>/m);
  assert.ok(firstModule, 'Expected a native entry module');
  // Run the self-contained theme before the app entry, not after its first paint.
  const patchedHTML = html.replace(firstModule[0], scriptTag + firstModule[0]);
  assert.notEqual(patchedHTML, html, 'Could not insert the settings module');
  assert.equal(cspMeta(patchedHTML), cspMeta(html), 'Content Security Policy changed');
  // The shared transformer validates the reviewed native bindings and uses the
  // same scoped, non-optimistic theme writer as the app's Appearance controls.
  const patchedAppearance = patchAppearance({
    appearance: originalAppearance.toString(),
    bridge: asar.extractFile(archive, PIN.settingsBridge).toString(),
    general: asar.extractFile(archive, PIN.generalSettings).toString(),
    bridgePath: PIN.settingsBridge, generalPath: PIN.generalSettings,
  });
  run(process.execPath, ['--input-type=module', '--check'], { input: patchedAppearance });
  const patchedInitial = patchSidebarCycle(originalInitial.toString());
  run(process.execPath, ['--input-type=module', '--check'], { input: patchedInitial });
  const replacements = new Map([
    [PIN.css, Buffer.concat([originalCSS, Buffer.from(MARKER), assets['src/glow.css'], Buffer.from('\n'), assets['src/settings.css'], Buffer.from('\n'), assets['src/theme-transition.css'], Buffer.from('\n'), assets['src/sidebar-cycle.css'], Buffer.from('\n/* NEON CODEX LOCAL THEME — END */\n')])],
    [PIN.html, Buffer.from(patchedHTML)],
    [PIN.appearance, Buffer.from(patchedAppearance)],
    [PIN.initialRenderer, Buffer.from(patchedInitial)],
    ['webview/assets/neon-codex.js', assets['src/neon-codex.js']],
    ['webview/assets/preferences.js', assets['src/preferences.js']],
    ['webview/assets/glow-layer.js', assets['src/glow-layer.js']],
    ['webview/assets/theme-transition.js', assets['src/theme-transition.js']],
    ['webview/assets/sidebar-cycle.js', assets['src/sidebar-cycle.js']],
  ]);
  return { replacements, sourceAssets: Object.fromEntries(Object.entries(assets).map(([file, content]) => [file, { bytes: content.length, sha256: sha(content) }])), csp: cspMeta(html) };
}
function putPackedEntry(header, filename, content, offset) {
  assert.ok(!filename.startsWith('/') && !filename.split('/').includes('..'), 'Unsafe ASAR entry path');
  const segments = filename.split('/'); const basename = segments.pop(); let parent = header;
  for (const part of segments) {
    assert.ok(parent.files, `ASAR parent is not a directory: ${filename}`);
    parent.files[part] ??= { files: {} };
    parent = parent.files[part];
  }
  const previous = parent.files[basename];
  assert.ok(!previous || (!previous.unpacked && !previous.link && !previous.files), `Target is not a packed regular file: ${filename}`);
  parent.files[basename] = { ...(previous || {}), size: content.length, offset: String(offset), integrity: fileIntegrity(content, previous?.integrity?.blockSize) };
}
async function selfTestArchive(asar) {
  await fsp.mkdir(LOCAL, { recursive: true });
  const temporary = await fsp.mkdtemp(path.join(LOCAL, 'archive-test-'));
  try {
    const source = path.join(temporary, 'original.asar');
    const output = path.join(temporary, 'patched.asar');
    const data = Buffer.from('original payload');
    const original = { files: {
      'entry.txt': { size: data.length, offset: '0', executable: true, integrity: fileIntegrity(data) },
      'alias.txt': { link: 'entry.txt' },
      'native.node': { size: 17, unpacked: true, executable: true },
    } };
    const encoded = encodeHeader(original);
    await fsp.writeFile(source, Buffer.concat([encoded, data]));
    const header = structuredClone(original);
    const replacements = new Map([['entry.txt', Buffer.from('updated payload')], ['assets/settings.js', Buffer.from('export {};')]]);
    let offset = data.length;
    for (const [file, content] of replacements) { putPackedEntry(header, file, content, offset); offset += content.length; }
    await appendPatchedEntries(source, output, header, encoded.length, replacements);
    const readback = asar.getRawHeader(output);
    for (const [file, content] of replacements) assert.ok(asar.extractFile(output, file).equals(content));
    assert.equal(nodeAt(readback.header, 'entry.txt').executable, true);
    assert.deepEqual(nodeAt(readback.header, 'alias.txt'), original.files['alias.txt']);
    assert.deepEqual(nodeAt(readback.header, 'native.node'), original.files['native.node']);
    const bytes = await fsp.readFile(output);
    assert.ok(bytes.subarray(8 + readback.headerSize, 8 + readback.headerSize + data.length).equals(data));
    assert.throws(() => putPackedEntry(header, 'native.node', Buffer.from('bad'), 0));
    assert.throws(() => putPackedEntry(header, '../outside', Buffer.from('bad'), 0));
    console.log('PASS: multiple ASAR replacements, new nested entry, original payload, executable/symlink/unpacked metadata, unsafe-entry rejection');
  } finally { await fsp.rm(temporary, { recursive: true, force: true }); }
}
async function main() {
  // Read-only identity listing lets the user-facing wrapper select exactly one.
  if (options.listIdentities) {
    const identities = [];
    for (const item of availableIdentities()) { try { identities.push(validateSigningIdentity(item.sha1)); } catch { /* omit unsupported or expired certificates */ } }
    console.log(JSON.stringify(identities, null, 2)); return;
  }
  if (options.selfTestArchive) { await selfTestArchive(await loadAsar()); return; }
  // Validate before any source read, clone, output write, or signing operation.
  const signingIdentity = (options.inspect || options.checkAssets) && !options.checkIdentity ? null
    : options.localSigning ? null : validateSigningIdentity();
  if (options.checkIdentity) { console.log(JSON.stringify({ signingIdentity, readOnly: true }, null, 2)); return; }
  const asar = await loadAsar();
  // Choose only a reviewed build. A stale cache must never select an older
  // vendor version when the installed app has updated.
  const sourceInfo = plist(path.join(options.source || options['installed-app'], 'Contents/Info.plist'));
  const sourceKey = `${sourceInfo.CFBundleShortVersionString}:${sourceInfo.CFBundleVersion}`;
  assert.ok(Object.hasOwn(SOURCE_PINS, sourceKey), `Codex ${sourceKey} has not been reviewed for Glow yet. Update Neon Codex with support for this version; no app was changed.`);
  PIN = Object.freeze(SOURCE_PINS[sourceKey]);
  if (!options.source) {
    const versioned = path.join(LOCAL, 'originals', `${PIN.version}-${PIN.build}`, 'ChatGPT.app');
    const legacy = path.join(LOCAL, 'original/ChatGPT.app');
    const legacyInfo = !fs.existsSync(versioned) && fs.existsSync(legacy) ? plist(path.join(legacy, 'Contents/Info.plist')) : null;
    options.source = fs.existsSync(versioned) ? versioned
      : legacyInfo?.CFBundleShortVersionString === PIN.version && legacyInfo?.CFBundleVersion === PIN.build ? legacy
      : options['installed-app'];
  }
  const source = await fsp.realpath(options.source);
  const sourceArchive = path.join(source, 'Contents/Resources/app.asar');
  const sourcePlist = path.join(source, 'Contents/Info.plist');
  const sourceFramework = path.join(source, PIN.framework);
  const info = plist(sourcePlist);
  assert.equal(info.CFBundleIdentifier, PIN.bundle, 'Unexpected application');
  assert.equal(info.CFBundleShortVersionString, PIN.version, 'App version changed; review selectors before updating this builder');
  assert.equal(info.CFBundleVersion, PIN.build, 'App build changed; review before updating this builder');
  const original = asar.getRawHeader(sourceArchive);
  assert.equal(sha(original.headerString), PIN.header, 'Source archive differs from reviewed version');
  assert.equal(info.ElectronAsarIntegrity?.['Resources/app.asar']?.hash, PIN.header, 'Source Info.plist archive integrity mismatch');
  const originalCSS = asar.extractFile(sourceArchive, PIN.css);
  assert.equal(sha(originalCSS), PIN.cssHash, 'Source stylesheet differs from reviewed version');
  const html = asar.extractFile(sourceArchive, 'webview/index.html').toString();
  assert.ok(html.includes(path.posix.basename(PIN.css)), 'Reviewed stylesheet is not referenced by the renderer');
  const frameworkBytes = await fsp.readFile(sourceFramework);
  const frameworkState = inspectFramework(frameworkBytes, info.ElectronAsarIntegrity);
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--test-requirement', '=anchor apple generic and certificate leaf[subject.OU] = "2DC432GLL2"', source]);
  const before = {
    archive: await hashFile(sourceArchive), plist: await hashFile(sourcePlist), framework: sha(frameworkBytes),
  };
  const description = { source, version: PIN.version, build: PIN.build, stylesheet: PIN.css, headerHash: PIN.header, hashes: before, framework: frameworkState };
  if (options.inspect) { console.log(JSON.stringify(description, null, 2)); return; }
  const assets = patchAssets(asar, sourceArchive, originalCSS);
  if (options.checkAssets) {
    console.log(JSON.stringify({ readOnly: true, themeVersion: THEME_VERSION, sourceAssets: assets.sourceAssets, changedEntries: [...assets.replacements].map(([file, bytes]) => ({ file, bytes: bytes.length, sha256: sha(bytes) })), cspPreserved: true, appearanceMountMatches: 1 }, null, 2));
    return;
  }
  const installedApp = await fsp.realpath(options['installed-app']);
  const installedBaseline = bundleSnapshot(installedApp);
  assert.equal(installedBaseline.bundleIdentifier, PIN.bundle, 'Installed baseline must be Codex');
  assert.equal(installedBaseline.version, PIN.version, 'Installed Codex version changed');
  assert.equal(installedBaseline.build, PIN.build, 'Installed Codex build changed');
  if (installedBaseline.signature.adHoc || !installedBaseline.signature.teamIdentifier || installedBaseline.signature.teamIdentifier === 'not set') {
    run('/usr/bin/python3', [path.join(HERE, 'install.py'), '--verify-local-baseline', installedApp]);
  } else {
    assert.ok(installedBaseline.signature.teamIdentifier && installedBaseline.signature.teamIdentifier !== 'not set', 'Installed baseline must have a certificate signature');
    assert.equal(installedBaseline.frameworkSignature.teamIdentifier, installedBaseline.signature.teamIdentifier, 'Installed launcher and framework signing teams differ');
    assert.ok(!installedBaseline.frameworkSignature.adHoc, 'Installed framework must have a certificate signature');
  }
  for (const metadata of [installedBaseline.signature, installedBaseline.frameworkSignature]) assert.ok(metadata.flags & 0x10000, 'Installed app must retain hardened runtime');
  assert.ok(!originalCSS.includes(Buffer.from(MARKER)), 'Source is already patched');
  const destination = path.resolve(options.output);
  if (fs.existsSync(destination)) throw new Error('Output already exists. Choose a new --output directory; this builder never overwrites an app.');
  // Only create default repository staging directories, never arbitrary output parents.
  if (destination === path.join(LOCAL, 'staging/ChatGPT.app')) await fsp.mkdir(path.dirname(destination), { recursive: true });
  const realParent = await fsp.realpath(path.dirname(destination));
  assert.ok(destination.endsWith('.app'), 'Output must end in .app');
  assert.ok(realParent !== '/Applications' && !realParent.startsWith('/Applications/'), 'Refusing to write into /Applications');
  assert.ok(realParent !== source && !realParent.startsWith(`${source}/`), 'Output cannot be inside the original app');
  assert.notEqual(path.join(realParent, path.basename(destination)), source, 'Output cannot replace the source');
  async function buildWithIdentity(signingIdentity) {
  if (options.localSigning) console.log('LOCAL SIGNING: reusing a private signing identity generated on this Mac; no Apple certificate or membership is required. The modified app gets an app-specific library-validation exception and is not notarized. Initial Keychain authorization may be required.');
  console.log(`Verified source ${PIN.version} (${PIN.build}); building a separate local copy.`);
  run('/usr/bin/ditto', [source, destination]);
  const scratch = await fsp.mkdtemp(path.join(realParent, '.neon-codex-build-'));
  const report = { schemaVersion: options.localSigning ? 4 : 2, signingMode: options.localSigning ? 'local' : 'certificate', localSigningStrategy: options.localSigning ? 'persistent-self-signed' : undefined, libraryValidationException: Boolean(options.localSigning), buildId: randomUUID(), themeVersion: THEME_VERSION, ...description, installedBaseline, output: destination, sourceAssets: assets.sourceAssets, copiedAt: new Date().toISOString(), signingIdentity, signed: [], unpackedIntegrityChanges: [], launched: false, notarized: false };
  try {
    // OpenAI team-bound provisioning does not apply to a copy signed by another developer.
    const tree = await walk(destination);
    const provisionProfiles = tree.files.filter(file => path.basename(file) === 'embedded.provisionprofile');
    for (const file of provisionProfiles) await fsp.unlink(file);
    report.removedCopiedProvisionProfiles = provisionProfiles.map(file => path.relative(destination, file));
    const binaries = [];
    for (const file of tree.files) if (!provisionProfiles.includes(file) && await isMachO(file)) binaries.push(file);
    const bundles = tree.dirs.filter(file => /\.(app|framework|xpc|appex|bundle|plugin|docktileplugin)$/.test(file) && binaries.some(binary => binary.startsWith(file + path.sep)));
    // Sign from inner code to outer bundle; preserve hardened-runtime flags.
    // Local mode opts process executables out of implicit library validation only.
    for (const file of binaries.sort((a, b) => b.length - a.length)) await signOne(file, scratch, report.signed, signingIdentity);
    const header = structuredClone(original.header);
    const sourceEntries = flatten(original.header);
    for (const [file, entry] of sourceEntries) {
      if (entry.files || entry.link || !entry.unpacked) continue;
      const copiedFile = path.join(destination, 'Contents/Resources/app.asar.unpacked', file);
      const bytes = await fsp.readFile(copiedFile);
      if (sha(bytes) !== entry.integrity?.hash) {
        assert.ok(binaries.includes(copiedFile), `Unexpected changed unpacked resource: ${file}`);
        const next = nodeAt(header, file);
        next.size = bytes.length; next.integrity = fileIntegrity(bytes, entry.integrity?.blockSize);
        report.unpackedIntegrityChanges.push(file);
      }
    }
    const oldDataStart = 8 + original.headerSize;
    const originalArchiveSize = (await fsp.stat(sourceArchive)).size;
    let nextOffset = originalArchiveSize - oldDataStart;
    for (const [file, content] of assets.replacements) {
      putPackedEntry(header, file, content, nextOffset);
      nextOffset += content.length;
    }
    const outArchive = path.join(destination, 'Contents/Resources/app.asar');
    const temporaryArchive = path.join(scratch, 'app.asar');
    await appendPatchedEntries(sourceArchive, temporaryArchive, header, oldDataStart, assets.replacements);
    await fsp.rename(temporaryArchive, outArchive);
    const newHeader = asar.getRawHeader(outArchive);
    for (const [file, content] of assets.replacements) assert.ok(asar.extractFile(outArchive, file).equals(content), `Patched ASAR readback mismatch: ${file}`);
    assert.equal(cspMeta(asar.extractFile(outArchive, PIN.html).toString()), assets.csp, 'Packaged CSP changed');
    report.cspPreserved = true;
    report.changedEntries = [...assets.replacements].map(([file, content]) => ({ file, bytes: content.length, sha256: sha(content), added: !sourceEntries.has(file) }));
    assert.equal(await hashFile(sourceArchive, oldDataStart), await hashFile(outArchive, 8 + newHeader.headerSize, 8 + newHeader.headerSize + originalArchiveSize - oldDataStart - 1), 'Original packed data changed');
    for (const [file, entry] of sourceEntries) {
      if (entry.files || assets.replacements.has(file) || report.unpackedIntegrityChanges.includes(file)) continue;
      assert.deepEqual(nodeAt(newHeader.header, file), entry, `ASAR metadata changed: ${file}`);
    }
    const headerHash = sha(newHeader.headerString);
    const outPlist = path.join(destination, 'Contents/Info.plist');
    run('/usr/libexec/PlistBuddy', ['-c', `Set :ElectronAsarIntegrity:Resources/app.asar:hash ${headerHash}`, outPlist]);
    const updatedInfo = plist(outPlist);
    const updatedDigest = integrityDigest(updatedInfo.ElectronAsarIntegrity);
    const outFramework = await fsp.realpath(path.join(destination, PIN.framework));
    const frameworkHandle = await fsp.open(outFramework, 'r+');
    try {
      for (const slot of frameworkState.slots) await frameworkHandle.write(updatedDigest, 0, updatedDigest.length, slot.offset + DIGEST_SENTINEL.length + 2);
    } finally { await frameworkHandle.close(); }
    // Sign frameworks after the digest update, then enclosing bundles.
    for (const bundle of bundles.sort((a, b) => b.split(path.sep).length - a.split(path.sep).length || b.length - a.length)) await signOne(bundle, scratch, report.signed, signingIdentity);
    await signOne(destination, scratch, report.signed, signingIdentity);
    run('/usr/bin/codesign', ['--verify', '--deep', '--strict', destination]);
    for (const relative of new Set(report.signed.map(item => item.path))) {
      const signedPath = path.resolve(destination, relative);
      verifySigningTeam(signedPath, signingIdentity);
      const expectedPolicy = [...report.signed].reverse().find(item => item.path === relative);
      assert.deepEqual(readEntitlements(signedPath), expectedPolicy.entitlements, `Final entitlements changed: ${signedPath}`);
      run('/usr/bin/codesign', ['--verify', '--strict', signedPath]);
    }
    report.signingTeamVerified = !options.localSigning;
    report.signingPolicyVerified = true;
    if (options.localSigning) report.stableIdentityVerified = true;
    const afterFramework = await fsp.readFile(outFramework);
    const finalFrameworkState = inspectFramework(afterFramework, updatedInfo.ElectronAsarIntegrity);
    assert.deepEqual(finalFrameworkState.fuses, frameworkState.fuses, 'Electron fuses changed');
    assert.equal(sha(asar.getRawHeader(outArchive).headerString), headerHash, 'Archive changed during signing');
    for (const [file, entry] of flatten(newHeader.header)) {
      if (entry.files || entry.link || !entry.unpacked) continue;
      assert.equal(await hashFile(path.join(destination, 'Contents/Resources/app.asar.unpacked', file)), entry.integrity.hash, `Final unpacked integrity mismatch: ${file}`);
    }
    const after = { archive: await hashFile(sourceArchive), plist: await hashFile(sourcePlist), framework: await hashFile(sourceFramework) };
    assert.deepEqual(after, before, 'Original source changed while building');
    run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--test-requirement', '=anchor apple generic and certificate leaf[subject.OU] = "2DC432GLL2"', source]);
    report.newHeaderHash = headerHash;
    report.newEmbeddedDigest = updatedDigest.toString('hex');
    report.originalUnchanged = true;
    report.packedDataPreserved = true;
    report.electronFusesPreserved = true;
    report.codeSignatureVerified = true;
    report.entryCount = flatten(newHeader.header).size;
    report.stagedSnapshot = bundleSnapshot(destination);
    assert.deepEqual(bundleSnapshot(installedApp), installedBaseline, 'Installed app changed while building; rebuild against the current baseline');
    report.installedBaselineUnchanged = true;
    report.runtimeValidated = false;
    report.limitations = [options.localSigning ? 'This local copy uses a persistent self-signed identity generated on this Mac, not an Apple-issued certificate. Process executables have an app-specific library-validation exception; system-wide protections and quarantine are unchanged. It is not notarized. Initial Keychain authorization may be needed. Retain the local identity to preserve code identity across refreshes; loss, rotation, expiry, or policy changes can require reauthorization.' : 'This local copy is signed by the explicitly selected Apple-issued development/distribution identity, not OpenAI; it is not notarized.', 'App behavior, sign-in, updates, keychain, notifications, and integrations are untested; team-bound capabilities were removed from the copy.', 'The copy retains the original bundle identity. No user-data isolation or launch has been performed.', 'This is a version-specific local modification, not a supported Codex plugin API.', 'Native Appearance mounting and controls require manual runtime verification after installation.'];
    const reportFile = `${destination}.build-report.json`;
    await fsp.writeFile(reportFile, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ output: destination, report: reportFile, originalUnchanged: true, signatureVerified: true, signingIdentity: signingIdentity.name, signingTeamIdentifier: signingIdentity.teamIdentifier, signingTeamVerified: report.signingTeamVerified, signingMode: report.signingMode, signingPolicyVerified: true, libraryValidationException: report.libraryValidationException, runtimeValidated: false, unpackedSignatureIntegrityUpdates: report.unpackedIntegrityChanges.length, theme: 'Neon Codex', themeVersion: THEME_VERSION, installedBaselineRecorded: true, cspPreserved: true }, null, 2));
  } catch (error) {
    console.error(`Build failed. The installed source was not edited. The incomplete copy remains at ${destination}; it has not been launched.`);
    throw error;
  } finally { await fsp.rm(scratch, { recursive: true, force: true }); }
  }
  if (options.localSigning) {
    const { sha1: expectedSha1 } = JSON.parse(run('/usr/bin/python3', [path.join(HERE, 'install.py'), '--local-identity-pin']));
    return withLocalIdentity(buildWithIdentity, { expectedSha1: expectedSha1 || undefined });
  }
  return buildWithIdentity(signingIdentity);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
