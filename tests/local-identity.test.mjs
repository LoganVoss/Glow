import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { ensureLocalIdentity, inspectLocalIdentity, withLocalIdentity } from '../scripts/local-identity.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mac = { skip: process.platform !== 'darwin' };
function run(file, args, options = {}) {
  const result = spawnSync(file, args, { encoding: 'utf8', timeout: 30_000, ...options });
  assert.equal(result.status, 0, `${path.basename(file)}: ${result.stderr || result.error || 'failed'}`);
  return result.stdout + result.stderr;
}
async function fixture(callback) {
  const base = mkdtempSync(path.join(realpathSync(os.tmpdir()), 'glow local identity test '));
  try { return await callback(base, path.join(base, 'Signing')); }
  finally { rmSync(base, { recursive: true, force: true }); }
}
const securityState = () => ({
  searchList: run('/usr/bin/security', ['list-keychains', '-d', 'user']),
  defaultKeychain: run('/usr/bin/security', ['default-keychain', '-d', 'user']),
});

test('read-only inspection and an existing installation pin never create a missing identity', mac, async () => {
  await fixture(async (base, directory) => {
    assert.throws(() => inspectLocalIdentity({ directory }), /identity is missing/);
    await assert.rejects(ensureLocalIdentity({ directory, expectedSha1: 'A'.repeat(40) }), /identity is missing/);
    assert.deepEqual(readdirSync(base), []);
  });
});

test('incomplete state, symlinks, and loose permissions fail instead of generating a replacement', mac, async () => {
  await fixture(async (base, directory) => {
    mkdirSync(directory, { mode: 0o700 });
    writeFileSync(path.join(directory, 'identity.json'), '{bad', { mode: 0o600 });
    await assert.rejects(ensureLocalIdentity({ directory }), /Incomplete local signing identity/);
    assert.deepEqual(readdirSync(directory), ['identity.json']);
    chmodSync(directory, 0o755);
    assert.throws(() => inspectLocalIdentity({ directory }), /700 permissions/);
    const alias = path.join(base, 'alias');
    symlinkSync(directory, alias);
    assert.throws(() => inspectLocalIdentity({ directory: alias }), /symbolic links/);
    await assert.rejects(ensureLocalIdentity({ directory: path.join(alias, 'New identity') }), /symbolic links/);
    assert.equal(existsSync(path.join(directory, 'New identity')), false);
  });
});

test('persistent identity is reused across builds, rejects replacement, and relocks after callback failure', mac, async t => {
  await fixture(async (base, directory) => {
    const initialSecurityState = securityState();
    const identity = await ensureLocalIdentity({ directory });
    assert.equal(identity.strategy, 'persistent-self-signed');
    assert.equal(identity.kind, 'local');
    assert.equal(identity.teamIdentifier, null);
    assert.match(identity.sha1, /^[A-F0-9]{40}$/);
    assert.match(identity.certificateSha256, /^[A-F0-9]{64}$/);
    assert.ok(Date.parse(identity.certificateValidTo) > Date.now() + 19 * 365 * 86400_000);
    assert.equal(statSync(directory).mode & 0o777, 0o700);
    for (const entry of ['identity.json', 'certificate.pem', 'keychain-password', 'glow.keychain-db']) assert.equal(statSync(path.join(directory, entry)).mode & 0o777, 0o600);
    assert.equal(existsSync(path.join(directory, '.session')), false);
    assert.equal(JSON.stringify(identity).includes(readFileSync(path.join(directory, 'keychain-password'), 'utf8')), false);
    assert.deepEqual(inspectLocalIdentity({ directory, expectedSha1: identity.sha1 }), identity);
    assert.deepEqual(await ensureLocalIdentity({ directory }), identity);

    const statusHelper = path.join(base, 'keychain-status');
    run('/usr/bin/xcrun', ['clang', '-Wno-deprecated-declarations', '-framework', 'Security', '-framework', 'CoreFoundation', path.join(root, 'scripts', 'local-identity-keychain.c'), '-o', statusHelper]);
    const status = () => run(statusHelper, ['status', identity.keychainPath]).trim();
    assert.equal(status(), 'locked');

    await t.test('different executable bytes retain the same certificate-pinned requirement', async () => {
      const requirements = [];
      const hashes = [];
      for (const number of [1, 2]) {
        const source = path.join(base, `fixture${number}.c`);
        const executable = path.join(base, `fixture${number}`);
        writeFileSync(source, `int main(void) { return ${number}; }\n`);
        run('/usr/bin/xcrun', ['clang', source, '-o', executable]);
        await withLocalIdentity(current => {
          assert.equal(status(), 'unlocked');
          assert.deepEqual(current, identity);
          run('/usr/bin/codesign', ['--force', '--sign', current.sha1, '--keychain', current.keychainPath, '--timestamp=none', '--options', 'runtime', '--identifier', 'dev.glow.identity-test', '--requirements', `=designated => identifier "dev.glow.identity-test" and certificate leaf = H"${current.sha1}"`, executable]);
        }, { directory, expectedSha1: identity.sha1 });
        run('/usr/bin/codesign', ['--verify', '--strict', executable]);
        const metadata = run('/usr/bin/codesign', ['--display', '--verbose=4', '--requirements', '-', executable]);
        assert.match(metadata, /flags=0x10000\(runtime\)/);
        assert.doesNotMatch(metadata, /Signature=adhoc/);
        hashes.push(metadata.match(/^CDHash=(.+)$/m)[1]);
        requirements.push(metadata.match(/^designated => (.+)$/m)[1]);
        assert.equal(status(), 'locked');
      }
      assert.notEqual(hashes[0], hashes[1]);
      assert.equal(requirements[0], requirements[1]);
      assert.match(requirements[0], /certificate leaf = H"[A-Fa-f0-9]{40}"/);
    });

    await t.test('a failed or concurrent callback cannot leave the keychain unlocked', async () => {
      await assert.rejects(withLocalIdentity(async () => {
        assert.equal(status(), 'unlocked');
        await assert.rejects(withLocalIdentity(() => {}, { directory }), /Another Glow signing session/);
        assert.equal(status(), 'unlocked');
        throw new Error('deliberate callback failure');
      }, { directory }), /deliberate callback failure/);
      assert.equal(status(), 'locked');
      assert.equal(existsSync(path.join(directory, '.session')), false);
    });

    await t.test('read-only inspection does not unlock or alter its files', () => {
      const before = Object.fromEntries(readdirSync(directory).map(name => [name, readFileSync(path.join(directory, name)).toString('base64')]));
      assert.deepEqual(inspectLocalIdentity({ directory }), identity);
      assert.equal(status(), 'locked');
      for (const [name, bytes] of Object.entries(before)) assert.equal(readFileSync(path.join(directory, name)).toString('base64'), bytes);
      assert.throws(() => inspectLocalIdentity({ directory, expectedSha1: 'A'.repeat(40) }), /identity pinned/);
    });

    await t.test('damaged metadata is never silently repaired or replaced', async () => {
      const statePath = path.join(directory, 'identity.json');
      const original = readFileSync(statePath);
      const state = JSON.parse(original);
      writeFileSync(statePath, JSON.stringify({ ...state, sha1: 'A'.repeat(40) }));
      await assert.rejects(ensureLocalIdentity({ directory }), /differs from the recorded identity/);
      assert.equal(JSON.parse(readFileSync(statePath)).sha1, 'A'.repeat(40));
      writeFileSync(statePath, original);
      assert.deepEqual(inspectLocalIdentity({ directory }), identity);
    });
    assert.deepEqual(securityState(), initialSecurityState, 'Creating and using the private identity must not change the user’s default keychain or search list.');
  });
});
