import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFileSync, mkdtempSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { withLocalIdentity } from '../scripts/local-identity.mjs';

// This integration test accesses only generated identities and a dummy password in
// explicit disposable keychains. Every fixture process disables Keychain UI.
const fixture = fileURLToPath(new URL('./fixtures/keychain-continuity.c', import.meta.url));
function command(file, args, options = {}) {
  const result = spawnSync(file, args, { encoding: 'utf8', timeout: 30_000, ...options });
  if (result.error) throw new Error(`${path.basename(file)} did not complete: ${result.error.code ?? 'unknown'}`);
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}
function checked(file, args, options) {
  const result = command(file, args, options);
  assert.equal(result.status, 0, `${path.basename(file)} failed: ${result.stderr}`);
  return result;
}
function preferences() {
  return [
    command('/usr/bin/security', ['list-keychains', '-d', 'user']),
    command('/usr/bin/security', ['default-keychain', '-d', 'user']),
    command('/usr/bin/security', ['dump-trust-settings']),
    command('/usr/bin/security', ['dump-trust-settings', '-d']),
    command('/usr/bin/security', ['dump-trust-settings', '-s']),
  ];
}
function description(file) {
  const result = checked('/usr/bin/codesign', ['-d', '-r-', '--verbose=4', file]);
  return result.stdout + result.stderr;
}

test('persistent local identity retains a scoped Keychain grant across changed code', { skip: process.platform !== 'darwin', timeout: 180_000 }, async t => {
  const root = mkdtempSync(path.join(realpathSync(os.tmpdir()), 'glow-keychain-continuity-'));
  const dummyKeychain = path.join(root, 'dummy.keychain-db');
  const goodDirectory = path.join(root, 'good');
  const wrongDirectory = path.join(root, 'wrong');
  const helper = path.join(root, 'helper');
  const active = path.join(root, 'active');
  const dummyPassword = randomBytes(32).toString('hex');
  const before = preferences();
  const compile = (name, version) => {
    const executable = path.join(root, name);
    checked('/usr/bin/xcrun', ['clang', '-Wno-deprecated-declarations', `-DBUILD_VERSION=${version}`, '-framework', 'Security', '-framework', 'CoreFoundation', fixture, '-o', executable]);
    return executable;
  };
  const activate = executable => {
    const next = path.join(root, 'next-active');
    copyFileSync(executable, next);
    renameSync(next, active);
  };
  const read = executable => {
    activate(executable);
    return command(active, ['read', dummyKeychain]);
  };
  try {
    compile('helper', 0);
    checked(helper, ['create', dummyKeychain], { input: dummyPassword + '\n' });
    assert.deepEqual(preferences(), before, 'Private Keychain creation must not change default, search list, or trust settings.');
    const entitlementFile = path.join(root, 'entitlements.plist');
    writeFileSync(entitlementFile, '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>com.apple.security.cs.disable-library-validation</key><true/></dict></plist>', { mode: 0o600 });
    const v1 = compile('v1', 1);
    const v2 = compile('v2', 2);
    const wrongID = compile('wrong-id', 3);
    const wrongCertificate = compile('wrong-certificate', 4);
    function sign(executable, identity, identifier) {
      const requirement = `designated => identifier "${identifier}" and certificate leaf = H"${identity.sha1}"`;
      checked('/usr/bin/codesign', ['--force', '--sign', identity.sha1, '--keychain', identity.keychainPath, '--timestamp=none', '--options', 'runtime', '--identifier', identifier, '--requirements', '=' + requirement, '--entitlements', entitlementFile, executable]);
      checked('/usr/bin/codesign', ['--verify', '--strict', executable]);
      const detail = description(executable);
      assert.match(detail, /flags=0x10000\(runtime\)/, 'The fixture must retain hardened runtime.');
      assert.match(detail, new RegExp(`certificate leaf = H"${identity.sha1.toLowerCase()}"`, 'i'));
      return detail;
    }
    let goodIdentity;
    let firstDescription;
    await withLocalIdentity(identity => {
      goodIdentity = identity;
      firstDescription = sign(v1, identity, 'org.glow.keychain-fixture');
    }, { directory: goodDirectory });
    checked('/usr/bin/codesign', ['--verify', '--strict', v1]);
    activate(v1);
    checked(helper, ['seed', dummyKeychain, active]);
    await t.test('the initially granted identity can read the dummy item without UI', () => {
      const result = read(v1);
      assert.equal(result.status, 0, result.stdout);
      assert.match(result.stdout, /read_status=0 dummy_matched=1/);
    });
    let secondDescription;
    // A separate signing session must recover and reuse the existing identity.
    await withLocalIdentity(identity => {
      assert.equal(identity.sha1, goodIdentity.sha1);
      secondDescription = sign(v2, identity, 'org.glow.keychain-fixture');
      sign(wrongID, identity, 'org.glow.different-fixture');
    }, { directory: goodDirectory, expectedSha1: goodIdentity.sha1 });
    await withLocalIdentity(identity => {
      assert.notEqual(identity.sha1, goodIdentity.sha1);
      sign(wrongCertificate, identity, 'org.glow.keychain-fixture');
    }, { directory: wrongDirectory });
    await t.test('changed code with the same certificate and identifier keeps access', () => {
      const cdhash = value => value.match(/^CDHash=(.+)$/m)?.[1];
      const requirement = value => value.match(/^designated => (.+)$/m)?.[1];
      assert.ok(cdhash(firstDescription));
      assert.notEqual(cdhash(firstDescription), cdhash(secondDescription), 'This must be a real change of code.');
      assert.ok(requirement(firstDescription));
      assert.equal(requirement(firstDescription), requirement(secondDescription));
      const result = read(v2);
      assert.equal(result.status, 0, result.stdout);
      assert.match(result.stdout, /version=2 read_status=0 dummy_matched=1/);
    });
    await t.test('another certificate cannot impersonate the same identifier', () => {
      const result = read(wrongCertificate);
      assert.equal(result.status, 3, result.stdout);
      assert.match(result.stdout, /read_status=-25293 dummy_matched=0/);
    });
    await t.test('the correct certificate cannot impersonate a different identifier', () => {
      const result = read(wrongID);
      assert.equal(result.status, 3, result.stdout);
      assert.match(result.stdout, /read_status=-25293 dummy_matched=0/);
    });
    await t.test('the recorded grant survives locking and unlocking its keychain', () => {
      checked('/usr/bin/security', ['lock-keychain', dummyKeychain]);
      checked(helper, ['unlock', dummyKeychain], { input: dummyPassword + '\n' });
      const result = read(v2);
      assert.equal(result.status, 0, result.stdout);
      assert.equal(read(wrongCertificate).status, 3);
    });
    assert.deepEqual(preferences(), before, 'Signing and scoped dummy-item access must not change global Keychain preferences or trust.');
  } finally {
    // Only paths created by this test are removed. Never touch a login Keychain.
    for (const keychain of [dummyKeychain, path.join(goodDirectory, 'glow.keychain-db'), path.join(wrongDirectory, 'glow.keychain-db')]) {
      command('/usr/bin/security', ['lock-keychain', keychain]);
      command('/usr/bin/security', ['delete-keychain', keychain]);
    }
    rmSync(root, { recursive: true, force: true });
    assert.deepEqual(preferences(), before, 'Fixture cleanup must not change global Keychain preferences or trust.');
  }
});
