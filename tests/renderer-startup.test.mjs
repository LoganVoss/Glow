import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// A fresh browser and a minimal local shell exercise the module-import order.
// No installed application, native account data, or private vendor code is used.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = ['unset', 'browser', 'utility', 'electron'];
const BORDER = '[data-neon-global="true"]';

function fixture(type) {
  assert.ok(TYPES.includes(type));
  const attribute = type === 'unset' ? '' : ` data-codex-window-type="${type}"`;
  return `<!doctype html><html${attribute}><head><meta charset="utf-8">
    <link rel="stylesheet" href="/src/glow.css">
    <style>
      [data-app-shell-frame] { width:900px;height:600px;position:relative; }
      [data-app-shell-workspace-row] { width:100%;height:100%;display:flex; }
    </style>
    <script type="module" src="/host-startup.js"></script></head><body>
    <div id="host-status">Loading</div>
    <div data-app-shell-frame data-app-shell-page-surface="true"><div data-app-shell-workspace-row>
      <main>Workspace</main>
    </div></div></body></html>`;
}

test('Glow imports must not block host startup before its window type is initialized', { timeout: 45_000 }, async t => {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname === '/') {
        response.writeHead(200, { 'Content-Type': 'text/html' });
        response.end(fixture(url.searchParams.get('type')));
      } else if (url.pathname === '/host-startup.js') {
        response.writeHead(200, { 'Content-Type': 'text/javascript' });
        // A deliberately stricter harness imports Glow before continuing host
        // execution. Native startup loads Glow independently; both must work.
        response.end('import "/src/neon-codex.js"; document.querySelector("#host-status").textContent = "Ready";');
      } else {
        assert.match(url.pathname, /^\/src\/[a-z0-9.-]+\.(?:js|css)$/);
        response.writeHead(200, { 'Content-Type': url.pathname.endsWith('.js') ? 'text/javascript' : 'text/css' });
        response.end(await readFile(path.join(ROOT, url.pathname)));
      }
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.NEON_TEST_BROWSER || (existsSync(chrome) ? chrome : undefined), chromiumSandbox: true });
    for (const type of TYPES) await t.test(`host startup with ${type} window type`, async () => {
      const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
      try {
        await context.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
        const page = await context.newPage(), errors = [];
        page.setDefaultTimeout(3_000);
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`${origin}/?type=${type}`);
        assert.deepEqual(errors, [], 'An optional Glow import must not throw before host startup');
        assert.equal(await page.locator('#host-status').textContent(), 'Ready', 'The host must finish evaluating its startup module');
        assert.equal(await page.evaluate(() => Boolean(window.__neonCodexRuntime)), true);
        if (type !== 'electron') {
          assert.equal(await page.locator(BORDER).count(), 0, 'Only a main electron window creates its border');
          // Codex establishes this attribute only after evaluating its entry.
          await page.evaluate(() => document.documentElement.setAttribute('data-codex-window-type', 'electron'));
        }
        await page.locator(`${BORDER}[data-neon-anchor-state="active"]`).waitFor({ timeout: 2_000 });
        await page.evaluate(selector => { window.__testBorder = document.querySelector(selector); }, BORDER);
        // Switching window types suspends only the decoration, retaining the
        // same layer when the host returns to its main window.
        await page.evaluate(() => document.documentElement.setAttribute('data-codex-window-type', 'utility'));
        await page.waitForFunction(selector => document.querySelector(selector)?.dataset.neonAnchorState === 'suspended', BORDER, { timeout: 2_000 });
        assert.equal(await page.locator(BORDER).isVisible(), false);
        await page.evaluate(() => document.documentElement.setAttribute('data-codex-window-type', 'electron'));
        await page.locator(`${BORDER}[data-neon-anchor-state="active"]`).waitFor({ timeout: 2_000 });
        assert.equal(await page.evaluate(selector => window.__testBorder === document.querySelector(selector), BORDER), true);
        assert.equal(await page.locator(BORDER).count(), 1);
        assert.equal(await page.locator('#host-status').textContent(), 'Ready');
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    });
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
