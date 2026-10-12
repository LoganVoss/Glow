#!/usr/bin/env node
/** Finder build helper. No installation, process control, or app launch. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const builder = path.join(root, 'scripts/build.mjs');
const args = process.argv.slice(2);
const [major, minor] = process.versions.node.split('.').map(Number);
function execute(executable, arguments_, options = {}) {
  const result = spawnSync(executable, arguments_, { cwd: root, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(executable)} exited with status ${result.status ?? result.signal}`);
  return result;
}

try {
  if (major < 22 || (major === 22 && minor < 12)) throw new Error('Install Node 22.12 or newer, then reopen this launcher.');
  // Read-only modes go straight to the builder without dependency installation.
  if (args.some(value => ['--help', '--list-identities', '--check-identity'].includes(value))) {
    execute(process.execPath, [builder, ...args]);
    process.exit(0);
  }
  const readOnly = args.some(value => ['--inspect', '--check-assets', '--self-test-archive'].includes(value));
  if (!args.includes('--identity') && !readOnly) {
    const listing = execute(process.execPath, [builder, '--list-identities'], { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });
    const identities = JSON.parse(listing.stdout);
    if (identities.length !== 1) {
      for (const identity of identities) console.error(`${identity.sha1}  ${identity.name}  (Team ${identity.teamIdentifier})`);
      throw new Error(identities.length ? 'More than one valid signing identity is available. Run npm run build -- --identity YOUR_CERTIFICATE_SHA1 to select one explicitly.' : 'No valid Apple-issued signing identity is available. Add your development certificate and its private key to Keychain, then try again.');
    }
    const identity = identities[0];
    console.log(`Signing with your only available valid identity:\n${identity.name}\nCertificate ${identity.sha1}\nTeam ${identity.teamIdentifier}\n`);
    args.push('--identity', identity.sha1);
  }
  if (!fs.existsSync(path.join(root, 'node_modules/@electron/asar/lib/asar.js'))) {
    console.log('Installing the exact dependencies recorded in package-lock.json...');
    execute('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund']);
  }
  execute(process.execPath, [builder, ...args]);
  if (!readOnly) console.log('\nBuild complete. Review the local build report, then open Install Neon Codex.command when ready.');
} catch (error) {
  console.error(`Neon Codex: ${error.message}`);
  process.exitCode = 1;
}
