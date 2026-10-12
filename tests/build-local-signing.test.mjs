import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const macOnly = { skip: process.platform !== 'darwin' };

function run(executable, args, options = {}) {
  return spawnSync(executable, args, { cwd: root, encoding: 'utf8', timeout: 30_000, ...options });
}

function checked(executable, args, options) {
  const result = run(executable, args, options);
  assert.equal(result.status, 0, `${path.basename(executable)} failed: ${result.stderr || result.error || ''}`);
  return result;
}

function isolated(callback) {
  const local = path.join(root, '.local');
  mkdirSync(local, { recursive: true });
  const directory = mkdtempSync(path.join(local, 'local-signing-test-'));
  try { return callback(directory); }
  finally { rmSync(directory, { recursive: true, force: true }); }
}

function rejectBeforeOutput(args, message) {
  isolated(directory => {
    const result = run(process.execPath, ['scripts/build.mjs', ...args, '--source', path.join(directory, 'missing.app'), '--output', path.join(directory, 'output.app')]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, message);
    assert.deepEqual(readdirSync(directory), [], 'Rejected build must not create output');
  });
}

test('local signing cannot accidentally select an Apple certificate', macOnly, () => {
  rejectBeforeOutput(['--local-signing', '--identity', '0'.repeat(40)], /--local-signing and --identity are mutually exclusive/);
});

test('local signing rejects Apple identity operations', macOnly, () => {
  for (const operation of ['--check-identity', '--list-identities']) {
    rejectBeforeOutput(['--local-signing', operation], /Local signing manages its own identity/);
  }
});

test('local signing validates source before creating an identity', macOnly, () => {
  rejectBeforeOutput(['--local-signing'], /plutil failed:/);
});

function fixture(directory) {
  const clang = checked('/usr/bin/xcrun', ['--find', 'clang']).stdout.trim();
  const sdk = checked('/usr/bin/xcrun', ['--sdk', 'macosx', '--show-sdk-path']).stdout.trim();
  const library = path.join(directory, 'libglow-test.dylib');
  const librarySource = path.join(directory, 'library.c');
  const hostSource = path.join(directory, 'host.c');
  writeFileSync(librarySource, 'int glow_value(void) { return 42; }\n');
  writeFileSync(hostSource, '#include <dlfcn.h>\n#include <stdio.h>\nint main(int argc, char **argv) { if(argc != 2) return 64; void *lib = dlopen(argv[1], RTLD_NOW); if(!lib) { fprintf(stderr, "%s\\n", dlerror()); return 2; } int (*value)(void) = dlsym(lib, "glow_value"); if(!value || value() != 42) return 3; puts("42"); dlclose(lib); return 0; }\n');
  checked(clang, ['-isysroot', sdk, '-dynamiclib', '-o', library, librarySource]);
  return { clang, sdk, library, hostSource };
}

function entitlements(file) {
  const xml = checked('/usr/bin/codesign', ['--display', '--entitlements', '-', '--xml', file]).stdout;
  return xml.trim() ? JSON.parse(checked('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '--', '-'], { input: xml }).stdout) : {};
}

function plist(directory, name, value) {
  const file = path.join(directory, `${name}.plist`);
  const xml = checked('/usr/bin/plutil', ['-convert', 'xml1', '-o', '-', '--', '-'], { input: JSON.stringify(value) }).stdout;
  writeFileSync(file, xml);
  return file;
}

function verifyLocal(file, expectedFlags) {
  checked('/usr/bin/codesign', ['--verify', '--strict', file]);
  const metadata = checked('/usr/bin/codesign', ['--display', '--verbose=4', file]).stderr;
  assert.match(metadata, /^Signature=adhoc$/m);
  assert.match(metadata, /^TeamIdentifier=not set$/m);
  assert.equal(Number.parseInt(metadata.match(/flags=0x([0-9a-f]+)/)[1], 16), expectedFlags);
}

test('the local LV exception permits a toy library without removing hardened runtime', macOnly, () => {
  isolated(directory => {
    const { clang, sdk, library, hostSource } = fixture(directory);
    checked('/usr/bin/codesign', ['--force', '--sign', '-', '--timestamp=none', '--options', 'runtime', library]);
    for (const [name, flags, policy, expectedExit] of [
      ['strict', 'runtime', {}, 2],
      ['local', 'runtime', { 'com.apple.security.cs.disable-library-validation': true }, 0],
      ['explicit-lv', 'runtime,library', { 'com.apple.security.cs.disable-library-validation': true }, 2],
    ]) {
      const host = path.join(directory, name);
      checked(clang, ['-isysroot', sdk, '-o', host, hostSource]);
      const policyFile = plist(directory, name, policy);
      checked('/usr/bin/codesign', ['--force', '--sign', '-', '--timestamp=none', '--options', flags, '--entitlements', policyFile, host]);
      verifyLocal(host, flags === 'runtime' ? 0x10002 : 0x12002);
      assert.deepEqual(entitlements(host), policy);
      // Executes only this test's own C program, never an installed app.
      const result = run(host, [library]);
      assert.equal(result.status, expectedExit, result.stderr);
      if (expectedExit) assert.match(result.stderr, /Team ID/);
      else assert.equal(result.stdout.trim(), '42');
    }
  });
});

test('modern codesign needs an explicit option to retain existing library entitlements', {
  skip: process.platform !== 'darwin' || Number.parseInt(os.release(), 10) < 24,
}, () => {
  isolated(directory => {
    const { library } = fixture(directory);
    const policy = { 'com.apple.security.cs.allow-jit': true };
    const policyFile = plist(directory, 'library-policy', policy);
    const base = ['--force', '--sign', '-', '--timestamp=none', '--options', 'runtime', '--entitlements', policyFile];
    checked('/usr/bin/codesign', [...base, library]);
    assert.deepEqual(entitlements(library), {}, 'macOS 15+ omits library entitlements by default');
    checked('/usr/bin/codesign', [...base, '--force-library-entitlements', library]);
    verifyLocal(library, 0x10002);
    assert.deepEqual(entitlements(library), policy);
    assert.equal(entitlements(library)['com.apple.security.cs.disable-library-validation'], undefined);
  });
});
