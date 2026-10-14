import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { extractFile, listPackage } from '@electron/asar';
import { chromium } from 'playwright';
import { patchSidebarCycle, SIDEBAR_VARIANTS } from '../scripts/sidebar-cycle-patch.mjs';

// Opt-in, read-only verification of a locally prepared app archive. No vendor
// code is checked in or written to disk. Only webview assets are served to a
// fresh browser; native bridges, account data and external network are absent.
// This proves module startup, not a successful native sign-in or conversation.
const archive = process.env.NEON_TEST_APP_ASAR;
const originalArchive = process.env.NEON_TEST_ORIGINAL_ASAR;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.wasm': 'application/wasm' };
const FAILURE = 'Glow bootstrap failure intentionally injected by its isolated test';
const MARKER = '__glowNativeBootstrapCompleted';

test('prepared native renderer starts independently of the optional Glow entry', {
  skip: !archive && 'Set NEON_TEST_APP_ASAR to a prepared app.asar to run this read-only test',
  timeout: 60_000,
}, async t => {
  assert.ok(path.isAbsolute(archive), 'NEON_TEST_APP_ASAR must be an absolute path');
  assert.ok(existsSync(archive), 'Prepared archive must exist');
  const html = extractFile(archive, 'webview/index.html').toString();
  assert.ok(html.includes('./assets/neon-codex.js'), 'Test a Glow-patched archive');
  assert.doesNotMatch(html.match(/<html\b[^>]*>/i)?.[0] || '', /data-codex-window-type=/,
    'Exercise the real initial state before Codex establishes its window type');
  const entries = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
    .map(match => path.posix.normalize(`webview/${match[1]}`))
    .filter(file => /^webview\/assets\/index-[\w-]+\.js$/.test(file));
  assert.equal(entries.length, 1, 'Expected one reviewed native entry module');
  const packageFiles = listPackage(archive).map(file => file.replace(/^\//, ''));
  const initial = packageFiles.filter(file => /^webview\/assets\/app-initial-[\w-]+\.js$/.test(file));
  assert.equal(initial.length, 1, 'Expected one reviewed native initial renderer');
  const bootstrapFiles = [...initial, ...entries];
  const initialSource = extractFile(archive, initial[0]).toString();
  assert.doesNotMatch(initialSource, /import\s*\{[^}]*startNeonCodex[^}]*\}\s*from\s*["']\.\/neon-codex\.js["']/,
    'Native startup must not statically depend on optional Glow initialization');
  const settingsImports = [...initialSource.matchAll(/import\(`(\.\/settings-page-[\w-]+\.js)`\)/g)];
  assert.equal(settingsImports.length, 1, 'Expected one reviewed native Settings lazy import');
  const settingsFile = path.posix.normalize(`webview/assets/${settingsImports[0][1]}`);
  const settingsSource = extractFile(archive, settingsFile).toString();
  const appearanceFiles = packageFiles.filter(file => /^webview\/assets\/appearance-settings-[\w-]+\.js$/.test(file));
  assert.equal(appearanceFiles.length, 1, 'Expected one patched native Appearance module');
  const appearanceFile = appearanceFiles[0];
  const bridgeCount = SIDEBAR_VARIANTS.reduce((total, variant) =>
    total + initialSource.split(variant.bridge).length - 1, 0);
  assert.equal(bridgeCount, 1, 'The native command must contain exactly one reviewed optional bridge');
  const matchingHooks = SIDEBAR_VARIANTS.reduce((total, variant) =>
    total + initialSource.split(patchSidebarCycle(variant.hook)).length - 1, 0);
  assert.equal(matchingHooks, 1, 'The native command must match one complete reviewed patched hook');
  assert.doesNotMatch(settingsSource, /__neon(?:Rail|Settings)|data-neon-rail|data-neon-settings-(?:home|navigation|loading)/,
    'Native Settings stays untouched; optional Home belongs to the independent Glow runtime');
  for (const source of [initialSource, settingsSource]) {
    assert.doesNotMatch(source, /(?:import|from)\s*[(]?\s*["'`]\.\/(?:neon-codex|sidebar-cycle)\.js/,
      'Native navigation must not statically depend on optional Glow initialization');
  }
  if (originalArchive) {
    assert.ok(path.isAbsolute(originalArchive) && existsSync(originalArchive), 'Original archive must exist at an absolute path');
    assert.equal(initialSource, patchSidebarCycle(extractFile(originalArchive, initial[0]).toString()),
      'Native initial renderer changes must be exactly the reviewed optional command bridge');
    assert.deepEqual(extractFile(archive, settingsFile), extractFile(originalArchive, settingsFile),
      'Native Settings must remain byte-for-byte identical to the preserved original');
  }
  const observed = new Set([...bootstrapFiles, settingsFile, appearanceFile]);

  const server = createServer((request, response) => {
    try {
      assert.equal(request.method, 'GET');
      const url = new URL(request.url, 'http://127.0.0.1');
      const pathname = decodeURIComponent(url.pathname);
      const match = pathname.match(/^\/(normal|throws|missing)\/(webview\/.+)$/);
      assert.ok(match && !pathname.split('/').includes('..'), 'Only public webview assets are served');
      const [, mode, file] = match;
      if (file === 'webview/assets/neon-codex.js' && mode === 'missing') {
        response.writeHead(404); response.end(); return;
      }
      let content = extractFile(archive, file);
      if (file === 'webview/assets/neon-codex.js' && mode === 'throws') {
        // Keep its export shape so failure occurs during evaluation, matching
        // the 0.10.0 startup regression rather than an unrelated link error.
        content = Buffer.from(`export function startNeonCodex(){};throw new Error(${JSON.stringify(FAILURE)});`);
      }
      if (observed.has(file)) {
        assert.ok(!content.toString().includes(MARKER), 'Probe marker must not collide with vendor code');
        content = Buffer.concat([content, Buffer.from(`\n;(globalThis.${MARKER}??=[]).push(${JSON.stringify(file)});\n`)]);
      }
      response.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      response.end(content);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  let browser;
  try {
    browser = await chromium.launch({ headless: true, chromiumSandbox: true,
      executablePath: process.env.NEON_TEST_BROWSER || (existsSync(chrome) ? chrome : undefined) });
    for (const mode of ['normal', 'throws', 'missing']) await t.test(`native modules finish with ${mode} Glow entry`, async () => {
      const context = await browser.newContext({ serviceWorkers: 'block' });
      try {
        await context.route('**/*', route => {
          const url = new URL(route.request().url());
          return url.origin === origin ? route.continue() : route.abort();
        });
        const page = await context.newPage(), errors = [], failedAssets = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('response', response => {
          if (response.status() >= 400) failedAssets.push(new URL(response.url()).pathname);
        });
        await page.goto(`${origin}/${mode}/webview/index.html`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(([marker, files]) => files.every(file => globalThis[marker]?.includes(file)),
          [MARKER, bootstrapFiles], { timeout: 10_000 });
        // Allow pending exception delivery after both modules have evaluated.
        await page.waitForTimeout(100);
        assert.deepEqual(await page.evaluate(marker => globalThis[marker], MARKER), bootstrapFiles,
          'Both real native modules complete in dependency order');
        assert.deepEqual(errors, mode === 'throws' ? [FAILURE] : [],
          'Optional Glow failure must not produce native dependency errors');
        assert.deepEqual(failedAssets, mode === 'missing' ? [`/${mode}/webview/assets/neon-codex.js`] : []);
        assert.equal(await page.evaluate(() => Boolean(globalThis.__neonCodexRuntime)), mode === 'normal');
        if (mode === 'normal') {
          const shape = await page.evaluate(async url => {
            const module = await import(url);
            return { settingsPage: typeof module.SettingsPage };
          }, `${origin}/${mode}/${settingsFile}`);
          assert.deepEqual(shape, { settingsPage: 'function' }, 'Real Settings module links and exports its native React page');
          await page.waitForTimeout(100);
          assert.deepEqual(await page.evaluate(marker => globalThis[marker], MARKER), [...bootstrapFiles, settingsFile],
            'Unmodified Settings chunk completes evaluation after native startup');
          assert.deepEqual(errors, [], 'Settings lazy import must not raise renderer errors');
          assert.deepEqual(failedAssets, [], 'Settings lazy import must resolve its local dependency graph');
          const appearanceShape = await page.evaluate(async url => {
            const module = await import(url);
            return { appearanceSettings: typeof module.AppearanceSettings };
          }, `${origin}/${mode}/${appearanceFile}`);
          assert.deepEqual(appearanceShape, { appearanceSettings: 'function' },
            'Patched Appearance module links its settings bridge and exports its native React component');
          await page.waitForTimeout(100);
          assert.deepEqual(await page.evaluate(marker => globalThis[marker], MARKER),
            [...bootstrapFiles, settingsFile, appearanceFile], 'Patched Appearance completes evaluation after Settings');
          assert.deepEqual(errors, [], 'Patched Appearance import must not raise renderer errors');
          assert.deepEqual(failedAssets, [], 'Patched Appearance import must resolve its local dependency graph');
        }
      } finally { await context.close(); }
    });
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
