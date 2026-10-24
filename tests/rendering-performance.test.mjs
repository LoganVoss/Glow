import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRAME = '[data-neon-codex-frame]';
// Behavioral paint/geometry regressions, not hardware-dependent CPU thresholds.
// All content belongs to this isolated fixture; the installed app is untouched.
test('Glow renderer sleeps without repaints and preserves its geometry and clock', { timeout: 30_000 }, async t => {
  const server = createServer(async (request, response) => {
    try {
      const name = new URL(request.url, 'http://localhost').pathname;
      if (name === '/fixture') { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end('<!doctype html><html></html>'); return; }
      if (!/^\/src\/[a-z0-9.-]+\.(?:js|css)$/.test(name)) throw new Error('Fixture assets only');
      response.writeHead(200, { 'Content-Type': name.endsWith('.js') ? 'text/javascript' : 'text/css' });
      response.end(await readFile(path.join(ROOT, name)));
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  let browser;
  try {
    browser = await chromium.launch({ headless: true, chromiumSandbox: true,
      executablePath: process.env.NEON_TEST_BROWSER || (existsSync(chrome) ? chrome : undefined) });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    const origin = `http://127.0.0.1:${server.address().port}`;
    await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    await page.goto(origin + '/fixture');
    await page.setContent(`<html data-codex-window-type="electron"><head><link rel="stylesheet" href="${origin}/src/glow.css"></head>
      <body style="margin:0"><div data-app-shell-frame data-app-shell-page-surface="true">
      <div data-app-shell-workspace-row style="position:fixed;inset:0">
      <div class="_PageSurface_azz1c_2" style="position:absolute;inset:56px 8px 8px 64px;border-radius:16px"></div>
      </div></div></body></html>`);
    await page.evaluate(async origin => {
      const { createGlowLayer } = await import(origin + '/src/glow-layer.js');
      const makeOverlay = () => {
        const node = document.createElement('div'); node.dataset.neonCodexFrame = '';
        node.innerHTML = '<div class="neon-glow-blur"><div class="neon-glow-color"></div></div><div class="neon-glow-edge"></div><div class="neon-glow-depth"></div>';
        return node;
      };
      window.layer = createGlowLayer(window, { makeOverlay, getTheme: () => 'light', applyOverlay(node) {
        node.dataset.pattern = 'prism'; node.dataset.enabled = 'true'; node.dataset.rendering = 'active';
      } });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, origin);

    await t.test('unchanged geometry reconciliation performs no DOM writes', async () => {
      const writes = await page.evaluate(async () => {
        const frame = window.layer.getFrame(); let writes = 0;
        const observer = new MutationObserver(records => { writes += records.length; });
        observer.observe(frame, { attributes: true, subtree: true, childList: true });
        for (let i = 0; i < 100; i++) window.layer.reconcile();
        await new Promise(resolve => requestAnimationFrame(resolve)); observer.disconnect();
        return writes;
      });
      assert.equal(writes, 0, 'Idempotent anchor state and style setters avoid redundant observer work');
      const positions = await page.evaluate(async () => {
        document.querySelector('._PageSurface_azz1c_2').style.left = '80px';
        window.layer.reconcile();
        return [window.layer.getFrame().getBoundingClientRect().left,
          document.querySelector('._PageSurface_azz1c_2').getBoundingClientRect().left];
      });
      assert.deepEqual(positions, [80, 80], 'Real geometry changes still align immediately');
    });

    await t.test('paused Bloom, Pulse, and Ping stop animation-driven style updates and paint', async () => {
      const cdp = await page.context().newCDPSession(page); await cdp.send('Performance.enable');
      for (const pattern of ['prism', 'pulse', 'signal']) {
        await page.evaluate(pattern => {
          const frame = window.layer.getFrame(); frame.dataset.pattern = pattern; frame.dataset.rendering = 'active';
        }, pattern);
        await page.waitForTimeout(80);
        await page.locator(FRAME).evaluate(frame => { frame.dataset.rendering = 'paused'; });
        await page.waitForTimeout(120);
        const before = await page.locator(FRAME).evaluate(frame => ({
          time: frame.getAnimations()[0].currentTime, phase: getComputedStyle(frame).getPropertyValue('--neon-phase'),
          paint: getComputedStyle(frame.querySelector('.neon-glow-color')).backgroundImage,
        }));
        const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(({ name, value }) => [name, value]));
        const events = []; cdp.on('Tracing.dataCollected', ({ value }) => events.push(...value));
        await cdp.send('Tracing.start', { categories: 'devtools.timeline', options: 'record-continuously' });
        const start = await metrics(); await page.waitForTimeout(400); const end = await metrics();
        const finished = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
        await cdp.send('Tracing.end'); await finished; cdp.removeAllListeners('Tracing.dataCollected');
        const after = await page.locator(FRAME).evaluate(frame => ({
          time: frame.getAnimations()[0].currentTime, phase: getComputedStyle(frame).getPropertyValue('--neon-phase'),
          paint: getComputedStyle(frame.querySelector('.neon-glow-color')).backgroundImage,
        }));
        assert.deepEqual(after, before, `${pattern} freezes the same image and phase`);
        assert.equal(end.LayoutCount - start.LayoutCount, 0);
        assert.ok(end.RecalcStyleCount - start.RecalcStyleCount <= 1, `${pattern} does not continually restyle while paused`);
        assert.equal(events.filter(event => event.name === 'Paint').length, 0, `${pattern} does not repaint while paused`);
        const restart = await page.locator(FRAME).evaluate(frame => {
          frame.dataset.rendering = 'active'; return frame.getAnimations()[0].currentTime;
        });
        assert.ok(Math.abs(restart - after.time) < 1, 'Resume preserves the frozen position, without a loop restart');
        await page.waitForTimeout(80);
        const resumed = await page.locator(FRAME).evaluate(frame => frame.getAnimations()[0].currentTime);
        assert.ok(resumed > after.time, 'The resumed clock advances again');
      }
    });

    await t.test('utility suspension releases a removed surface even while its shell stays connected', async () => {
      await page.evaluate(async () => {
        const surface = document.querySelector('._PageSurface_azz1c_2');
        window.detachedSurface = new WeakRef(surface);
        document.documentElement.dataset.codexWindowType = 'utility';
        surface.remove(); window.layer.reconcile();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      const cdp = await page.context().newCDPSession(page);
      for (let i = 0; i < 3; i++) {
        await cdp.send('HeapProfiler.collectGarbage');
        await page.waitForTimeout(30);
      }
      assert.equal(await page.evaluate(() => window.detachedSurface.deref() === undefined), true);
      assert.equal(await page.locator(FRAME).evaluate(frame => getComputedStyle(frame).visibility), 'hidden');
      await page.evaluate(() => {
        const surface = document.createElement('div'); surface.className = '_PageSurface_azz1c_2';
        surface.style.cssText = 'position:absolute;inset:56px 8px 8px 80px;border-radius:16px';
        document.querySelector('[data-app-shell-workspace-row]').append(surface);
        document.documentElement.dataset.codexWindowType = 'electron'; window.layer.reconcile();
      });
      assert.equal(await page.locator(FRAME).evaluate(frame => getComputedStyle(frame).visibility), 'visible');
      assert.equal(await page.locator(FRAME).evaluate(frame => frame.getBoundingClientRect().left), 80);
      await cdp.detach();
    });

    await t.test('route gaps retain the border but release detached native shell trees', async () => {
      const before = await page.locator(FRAME).evaluate(frame => frame.getBoundingClientRect().toJSON());
      await page.evaluate(async () => {
        const shell = document.querySelector('[data-app-shell-frame]');
        window.detachedShell = new WeakRef(shell);
        shell.remove(); window.layer.reconcile();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      assert.equal(await page.locator(FRAME).getAttribute('data-neon-anchor-state'), 'retained');
      assert.deepEqual(await page.locator(FRAME).evaluate(frame => frame.getBoundingClientRect().toJSON()), before);
      const cdp = await page.context().newCDPSession(page);
      for (let i = 0; i < 3; i++) {
        await cdp.send('HeapProfiler.collectGarbage');
        await page.waitForTimeout(30);
      }
      assert.equal(await page.evaluate(() => window.detachedShell.deref() === undefined), true,
        'Neither remembered geometry nor observers retain the removed native shell');
      await cdp.detach();
    });

    await t.test('reduced motion and destroy remove animation work and decorations', async () => {
      await page.evaluate(() => { document.documentElement.dataset.reducedMotion = 'true'; });
      await page.waitForTimeout(100);
      assert.equal(await page.locator(FRAME).evaluate(frame => frame.getAnimations().length), 0);
      await page.evaluate(() => { window.layer.destroy(); window.layer.reconcile(); });
      assert.equal(await page.locator(FRAME).count(), 0);
    });
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
});
