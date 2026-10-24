import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { extractFile, listPackage } from '@electron/asar';
import { chromium } from 'playwright';
import { patchSidebarCycle, SIDEBAR_VARIANTS } from '../scripts/sidebar-cycle-patch.mjs';
import { discoverRendererLayout, importPaths } from '../scripts/renderer-layout.mjs';

// Opt-in, read-only verification of a locally prepared app archive. No vendor
// code is checked in or written to disk. Only webview assets are served to a
// fresh browser; native bridges, account data and external network are absent.
// This proves module startup, not a successful native sign-in or conversation.
// In the split renderer, index/main launch host services immediately. Test the
// actual initial + primary module graph with an isolated entry instead, and
// separately require the native launchers to remain byte-for-byte unchanged.
const archive = process.env.NEON_TEST_APP_ASAR;
const originalArchive = process.env.NEON_TEST_ORIGINAL_ASAR;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.wasm': 'application/wasm' };
const FAILURE = 'Glow bootstrap failure intentionally injected by its isolated test';
const MARKER = '__glowNativeBootstrapCompleted';

test('prepared native renderer modules evaluate independently of the optional Glow entry', {
  skip: !archive && 'Set NEON_TEST_APP_ASAR to a prepared app.asar to run this read-only test',
  timeout: 60_000,
}, async t => {
  assert.ok(path.isAbsolute(archive), 'NEON_TEST_APP_ASAR must be an absolute path');
  assert.ok(existsSync(archive), 'Prepared archive must exist');
  const html = extractFile(archive, 'webview/index.html').toString();
  assert.ok(html.includes('./assets/neon-codex.js'), 'Test a Glow-patched archive');
  assert.doesNotMatch(html.match(/<html\b[^>]*>/i)?.[0] || '', /data-codex-window-type=/,
    'Exercise the real initial state before Codex establishes its window type');
  const packageFiles = listPackage(archive).map(file => file.replace(/^\//, ''));
  const read = file => extractFile(archive, file).toString();
  const glowTag = '<script type="module" src="./assets/neon-codex.js"></script>';
  assert.equal(html.split(glowTag).length - 1, 1, 'Expected exactly one independent Glow entry');
  const layout = discoverRendererLayout({ files: packageFiles,
    readFile: file => extractFile(archive, file), html: html.replace(glowTag, '') });
  const split = Boolean(layout.primaryPath);
  const bootstrapFiles = split ? [layout.initialPath, layout.primaryPath] : [layout.initialPath, layout.entryPath];
  const linked = (source, pattern, { dynamic = false } = {}) => {
    const paths = importPaths(source, { dynamic }).map(file => path.posix.normalize(`webview/assets/${file}`)).filter(file => pattern.test(file));
    assert.equal(paths.length, 1, 'Expected one linked native Settings module');
    assert.ok(packageFiles.includes(paths[0]), 'Linked native Settings module exists');
    return paths[0];
  };
  const settingsLoader = split ? linked(read(layout.runtimePath), /^webview\/assets\/settings-page-lazy-[a-f0-9]+\.js$/) : layout.initialPath;
  const settingsFile = linked(read(settingsLoader), /^webview\/assets\/settings-page-[a-f0-9]+\.js$/, { dynamic: true });
  const sidebarSource = read(layout.sidebarPath);
  const settingsSource = extractFile(archive, settingsFile).toString();
  const appearanceFiles = packageFiles.filter(file => /^webview\/assets\/appearance-settings-[\w-]+\.js$/.test(file));
  assert.equal(appearanceFiles.length, 1, 'Expected one patched native Appearance module');
  const appearanceFile = appearanceFiles[0];
  const bridgeCount = SIDEBAR_VARIANTS.reduce((total, variant) =>
    total + sidebarSource.split(variant.bridge).length - 1, 0);
  assert.equal(bridgeCount, 1, 'The native command must contain exactly one reviewed optional bridge');
  const matchingHooks = SIDEBAR_VARIANTS.reduce((total, variant) =>
    total + sidebarSource.split(patchSidebarCycle(variant.hook)).length - 1, 0);
  assert.equal(matchingHooks, 1, 'The native command must match one complete reviewed patched hook');
  assert.doesNotMatch(settingsSource, /__neon(?:Rail|Settings)|data-neon-rail|data-neon-settings-(?:home|navigation|loading)/,
    'Native Settings stays untouched; optional Home belongs to the independent Glow runtime');
  const nativeFiles = [...new Set([layout.entryPath, layout.initialPath, layout.mainPath,
    layout.runtimePath, layout.primaryPath, settingsLoader, settingsFile].filter(Boolean))];
  for (const file of nativeFiles) {
    const source = read(file);
    assert.doesNotMatch(source, /(?:import|from)\s*[(]?\s*["'`]\.\/(?:neon-codex|sidebar-cycle)\.js/,
      'Native navigation must not statically depend on optional Glow initialization');
  }
  if (originalArchive) {
    assert.ok(path.isAbsolute(originalArchive) && existsSync(originalArchive), 'Original archive must exist at an absolute path');
    assert.equal(sidebarSource, patchSidebarCycle(extractFile(originalArchive, layout.sidebarPath).toString()),
      'Native sidebar renderer changes must be exactly the reviewed optional command bridge');
    for (const file of nativeFiles.filter(file => file !== layout.sidebarPath)) {
      assert.deepEqual(extractFile(archive, file), extractFile(originalArchive, file),
        `Native launcher, initial renderer and Settings modules must remain byte-for-byte identical: ${file}`);
    }
  }
  const observed = new Set([...bootstrapFiles, settingsFile, appearanceFile]);
  const harnessPath = 'webview/assets/__glow-isolated-bootstrap.js';
  const entryAttribute = `src="./${layout.entryPath.slice('webview/'.length)}"`;
  if (split) assert.equal(html.split(entryAttribute).length - 1, 1, 'Native entry replacement is exact and unique');
  const harness = split ? Buffer.from(bootstrapFiles.map(file => `await import("./${path.posix.basename(file)}");`).join('\n')) : null;

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
      let content = split && file === harnessPath ? harness : extractFile(archive, file);
      if (split && file === 'webview/index.html') {
        // This is an explicitly isolated module test, not native launcher execution.
        content = Buffer.from(html.replace(entryAttribute, 'src="./assets/__glow-isolated-bootstrap.js"'));
      }
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
    for (const mode of ['normal', 'throws', 'missing']) await t.test(`${split ? 'isolated initial/primary' : 'native initial/entry'} modules finish with ${mode} Glow entry`, async () => {
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
          'The actual native modules under test complete in dependency order');
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
