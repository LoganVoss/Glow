import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID, X509Certificate } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const defaultIdentityDirectory = path.join(os.homedir(), 'Library', 'Application Support', 'Glow', 'Signing');
const names = { state: 'identity.json', certificate: 'certificate.pem', password: 'keychain-password', keychain: 'glow.keychain-db' };
const noIdentity = 'Glow’s persistent local signing identity is missing. Restore its Signing folder from a private backup; do not generate a replacement for an existing installation.';

function run(file, args, options = {}) {
  const result = spawnSync(file, args, { encoding: 'utf8', timeout: 120_000, maxBuffer: 4 * 1024 * 1024, ...options });
  if (result.status !== 0 || result.error) throw new Error(`${path.basename(file)} could not complete the local identity operation (exit ${result.status ?? 'unknown'}).`);
  return result.stdout;
}

function requireMac() { assert.equal(process.platform, 'darwin', 'Persistent local signing requires macOS.'); }
function canonicalOptions(options = {}) {
  const directory = path.resolve(options.directory ?? defaultIdentityDirectory);
  // Do not follow a redirected parent into a different Signing folder. This is
  // intentionally strict, including custom fixture paths: pass their real path.
  let ancestor = directory;
  while (true) {
    try { assert.ok(!lstatSync(ancestor).isSymbolicLink(), 'Local identity paths must not contain symbolic links.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const parent = path.dirname(ancestor);
    if (parent === ancestor) break;
    ancestor = parent;
  }
  const expectedSha1 = options.expectedSha1?.toUpperCase();
  if (expectedSha1) assert.match(expectedSha1, /^[0-9A-F]{40}$/, 'Invalid expected local certificate SHA-1.');
  return { directory, expectedSha1 };
}

function privatePath(file, directory = false) {
  const stat = lstatSync(file);
  assert.ok(!stat.isSymbolicLink() && (directory ? stat.isDirectory() : stat.isFile()), `Unexpected local identity file type: ${path.basename(file)}`);
  assert.equal(stat.uid, process.getuid(), 'The local signing identity must belong to the current user.');
  assert.equal(stat.mode & 0o777, directory ? 0o700 : 0o600, `The local signing ${directory ? 'folder' : 'file'} must have ${directory ? '700' : '600'} permissions: ${path.basename(file)}`);
}

function publicCertificate(pem) {
  const certificate = new X509Certificate(pem);
  assert.ok(certificate.subject === certificate.issuer && certificate.verify(certificate.publicKey), 'Local signing certificate must be self-signed.');
  assert.equal(certificate.ca, false, 'Local signing certificate must not be a certificate authority.');
  assert.ok(certificate.keyUsage?.includes('1.3.6.1.5.5.7.3.3'), 'Local certificate must permit code signing.');
  assert.ok(certificate.keyUsage.length === 1, 'Local certificate must be limited to code signing.');
  assert.ok(Date.parse(certificate.validFrom) <= Date.now() && Date.parse(certificate.validTo) > Date.now(), 'Local signing certificate is not currently valid.');
  return {
    sha1: createHash('sha1').update(certificate.raw).digest('hex').toUpperCase(),
    certificateSha256: createHash('sha256').update(certificate.raw).digest('hex').toUpperCase(),
    certificateValidTo: new Date(certificate.validTo).toISOString(),
    certificate,
  };
}

/** Read-only: no creation, unlock, trust edits, or keychain search-list changes. */
export function inspectLocalIdentity(options = {}) {
  requireMac();
  const { directory, expectedSha1 } = canonicalOptions(options);
  if (!existsSync(directory)) throw new Error(noIdentity);
  privatePath(directory, true);
  for (const name of Object.values(names)) {
    assert.ok(existsSync(path.join(directory, name)), `Incomplete local signing identity (${name} missing). Restore the original Signing folder; it will not be replaced automatically.`);
    privatePath(path.join(directory, name));
  }
  let state;
  try { state = JSON.parse(readFileSync(path.join(directory, names.state), 'utf8')); }
  catch { throw new Error('Local signing identity metadata is damaged. Restore the original Signing folder.'); }
  assert.equal(state.schemaVersion, 1, 'Unsupported local identity state.');
  assert.equal(state.strategy, 'persistent-self-signed', 'Unexpected local identity strategy.');
  assert.match(state.name, /^Glow Local [0-9a-f-]{36}$/, 'Invalid local identity name.');
  const cert = publicCertificate(readFileSync(path.join(directory, names.certificate)));
  assert.equal(cert.certificate.subject, `CN=${state.name}`, 'Local certificate subject differs from the recorded identity.');
  for (const key of ['sha1', 'certificateSha256', 'certificateValidTo']) assert.equal(cert[key], state[key], `Local certificate ${key} differs from the recorded identity.`);
  if (expectedSha1) assert.equal(cert.sha1, expectedSha1, 'Local certificate differs from the identity pinned by the existing installation. Restore the original Signing folder.');
  const password = readFileSync(path.join(directory, names.password));
  try { if (!/^[0-9a-f]{64}$/.test(password.toString('ascii'))) throw new Error('Local keychain password state is damaged.'); }
  finally { password.fill(0); }
  const keychainPath = path.join(directory, names.keychain);
  const contained = run('/usr/bin/security', ['find-certificate', '-a', '-p', keychainPath]);
  const certificates = contained.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];
  assert.equal(certificates.length, 1, 'Glow’s private keychain must contain exactly its local signing certificate.');
  assert.equal(publicCertificate(certificates[0]).certificateSha256, cert.certificateSha256, 'Private keychain certificate differs from its recorded identity.');
  const identities = run('/usr/bin/security', ['find-identity', '-p', 'codesigning', keychainPath]);
  assert.ok(new RegExp(`\\b${cert.sha1}\\b`, 'i').test(identities), 'The local signing certificate has no matching private key. Restore the original Signing folder.');
  return Object.freeze({ kind: 'local', strategy: 'persistent-self-signed', sha1: cert.sha1, name: state.name, certificateSha256: cert.certificateSha256, teamIdentifier: null, keychainPath, certificateValidTo: cert.certificateValidTo });
}

function helperIn(directory) {
  const helper = path.join(directory, 'glow-keychain');
  run('/usr/bin/xcrun', ['clang', '-O2', '-Wno-deprecated-declarations', '-framework', 'Security', '-framework', 'CoreFoundation', path.join(here, 'local-identity-keychain.c'), '-o', helper]);
  chmodSync(helper, 0o700);
  return helper;
}

function keychainOperation(helper, operation, directory) {
  const password = operation === 'lock' ? Buffer.alloc(0) : readFileSync(path.join(directory, names.password));
  try { run(helper, [operation, path.join(directory, names.keychain)], { input: password }); }
  finally { password.fill(0); }
}

function secureWrite(file, data) { writeFileSync(file, data, { mode: 0o600, flag: 'wx' }); }
function initialize(directory, helper, expectedSha1) {
  if (expectedSha1) throw new Error(noIdentity);
  const unexpected = readdirSync(directory).filter(name => name !== '.session');
  assert.equal(unexpected.length, 0, 'Incomplete local signing identity found. It will not be replaced automatically.');
  const name = `Glow Local ${randomUUID()}`;
  const scratch = path.join(directory, '.session');
  const config = path.join(scratch, 'certificate.cnf');
  const privateKey = path.join(scratch, 'private.pem');
  const certificate = path.join(directory, names.certificate);
  secureWrite(config, `[req]\nprompt=no\ndistinguished_name=subject\nx509_extensions=extensions\n[subject]\nCN=${name}\n[extensions]\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=critical,codeSigning\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid\n`);
  secureWrite(privateKey, '');
  secureWrite(certificate, '');
  secureWrite(path.join(directory, names.password), randomBytes(32).toString('hex'));
  try {
    run('/usr/bin/openssl', ['req', '-new', '-x509', '-newkey', 'rsa:3072', '-nodes', '-sha256', '-days', '7300', '-keyout', privateKey, '-out', certificate, '-config', config]);
    const cert = publicCertificate(readFileSync(certificate));
    const certPublicKey = run('/usr/bin/openssl', ['x509', '-in', certificate, '-pubkey', '-noout']).trim();
    const privatePublicKey = run('/usr/bin/openssl', ['pkey', '-in', privateKey, '-pubout']).trim();
    assert.equal(privatePublicKey, certPublicKey, 'Generated local certificate and private key do not match.');
    keychainOperation(helper, 'create', directory);
    chmodSync(path.join(directory, names.keychain), 0o600);
    run('/usr/bin/security', ['import', certificate, '-k', path.join(directory, names.keychain)]);
    run('/usr/bin/security', ['import', privateKey, '-k', path.join(directory, names.keychain), '-t', 'priv', '-P', '', '-x', '-T', '/usr/bin/codesign']);
    secureWrite(path.join(directory, names.state), JSON.stringify({ schemaVersion: 1, strategy: 'persistent-self-signed', name, sha1: cert.sha1, certificateSha256: cert.certificateSha256, certificateValidTo: cert.certificateValidTo, createdAt: new Date().toISOString() }, null, 2) + '\n');
  } finally {
    rmSync(privateKey, { force: true });
    rmSync(config, { force: true });
  }
}

/** Creates only a brand-new identity. An existing partial identity is never rotated. */
export async function ensureLocalIdentity(options = {}) {
  let identity;
  await withLocalIdentity(value => { identity = value; }, options);
  return identity;
}

/** Keeps the dedicated keychain unlocked only for the awaited signing callback. */
export async function withLocalIdentity(callback, options = {}) {
  requireMac();
  assert.equal(typeof callback, 'function', 'Local signing requires a callback.');
  const { directory, expectedSha1 } = canonicalOptions(options);
  let created = false;
  if (!existsSync(directory)) {
    if (expectedSha1) throw new Error(noIdentity);
    mkdirSync(path.dirname(directory), { recursive: true, mode: 0o700 });
    mkdirSync(directory, { mode: 0o700 });
    created = true;
  }
  privatePath(directory, true);
  const session = path.join(directory, '.session');
  try { mkdirSync(session, { mode: 0o700 }); }
  catch { throw new Error('Another Glow signing session may be active. Do not remove the Signing folder. If no build is running, inspect the stale .session folder before retrying.'); }
  let helper;
  try {
    helper = helperIn(session);
    if (created) initialize(directory, helper, expectedSha1);
    const identity = inspectLocalIdentity({ directory, expectedSha1 });
    keychainOperation(helper, 'unlock', directory);
    return await callback(identity);
  } finally {
    try { if (helper && existsSync(path.join(directory, names.keychain))) keychainOperation(helper, 'lock', directory); }
    finally { rmSync(session, { recursive: true, force: true }); }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    assert.equal(args.shift(), '--inspect', 'Usage: node scripts/local-identity.mjs --inspect [--expected-sha1 HEX]');
    let expectedSha1;
    if (args.length) { assert.equal(args.shift(), '--expected-sha1', 'Unknown identity inspection option.'); expectedSha1 = args.shift(); assert.ok(expectedSha1, 'Expected a certificate SHA-1.'); }
    assert.equal(args.length, 0, 'Unexpected identity inspection arguments.');
    console.log(JSON.stringify(inspectLocalIdentity({ expectedSha1 }), null, 2));
  } catch (error) { console.error(`Glow local identity: ${error.message}`); process.exitCode = 1; }
}
