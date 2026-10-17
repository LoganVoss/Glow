import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRAME = '[data-neon-global="true"]';
const PANEL = '[data-neon-settings-root]';
const SAMPLE = '.neon-glow-sample';

// Isolated fixture only. These assertions cover work scheduling and resource
// ownership, not hardware performance or native macOS window occlusion.
test('Glow suspends invisible animation and releases runtime resources', { timeout: 90_000 }, async t => {
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      assert.match(pathname, /^\/(?:src|preview)\/[a-z0-9.-]+\.(?:js|css|html)$/i);
      response.writeHead(200, { 'Content-Type': pathname.endsWith('.js') ? 'text/javascript' : pathname.endsWith('.css') ? 'text/css' : 'text/html' });
      response.end(await readFile(path.join(ROOT, pathname)));
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const localChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.NEON_TEST_BROWSER || (existsSync(localChrome) ? localChrome : undefined), chromiumSandbox: true });
    async function fixture({ instrument = false } = {}) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1800 } });
      await context.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
      const page = await context.newPage(), errors = [];
      page.setDefaultTimeout(5_000);
      page.on('pageerror', error => errors.push(error.message));
      if (instrument) await page.addInitScript(() => {
        window.__NEON_CODEX_DISABLE_AUTOBOOT__ = true;
        const observers = Object.fromEntries(['MutationObserver', 'ResizeObserver', 'IntersectionObserver'].map(name => [name, new Set()]));
        for (const [name, active] of Object.entries(observers)) {
          const Native = window[name];
          window[name] = class extends Native {
            observe(...args) { active.add(this); return super.observe(...args); }
            disconnect() { active.delete(this); return super.disconnect(); }
          };
        }
        const listeners = [];
        const add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener;
        const capture = options => typeof options === 'boolean' ? options : Boolean(options?.capture);
        const tracked = target => target === window || target === document || target === visualViewport || target instanceof MediaQueryList;
        EventTarget.prototype.addEventListener = function(type, handler, options) {
          if (tracked(this) && !listeners.some(item => item.target === this && item.type === type && item.handler === handler && item.capture === capture(options))) {
            listeners.push({ target: this, type, handler, capture: capture(options) });
          }
          return add.call(this, type, handler, options);
        };
        EventTarget.prototype.removeEventListener = function(type, handler, options) {
          const index = listeners.findIndex(item => item.target === this && item.type === type && item.handler === handler && item.capture === capture(options));
          if (index >= 0) listeners.splice(index, 1);
          return remove.call(this, type, handler, options);
        };
        window.__resourceCounts = () => ({
          observers: Object.fromEntries(Object.entries(observers).map(([name, active]) => [name, active.size])),
          listeners: listeners.length,
          frames: document.querySelectorAll('[data-neon-codex-frame]').length,
          panels: document.querySelectorAll('[data-neon-settings-root]').length,
        });
      });
      await page.goto(`${origin}/preview/index.html`);
      await page.evaluate(async () => { window.__startRuntime = (await import('/src/neon-codex.js')).startNeonCodex; });
      // Initialize Playwright's own injected wait helpers before measuring
      // application-owned resources; their document listeners are persistent.
      await page.waitForFunction(() => Boolean(window.__startRuntime));
      if (!instrument) await page.waitForFunction(selector => document.querySelector(selector)?.dataset.rendering === 'active', FRAME);
      return { page, async close() { assert.deepEqual(errors, []); await context.close(); } };
    }
    const twoFrames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    async function state(page, selector, expected) {
      await page.waitForFunction(([selector, expected]) => {
        const nodes = [...document.querySelectorAll(selector)];
        return nodes.length > 0 && nodes.every(node => node.dataset.rendering === expected &&
          node.getAnimations().some(animation => animation.animationName === 'neon-glow-orbit' && !animation.pending &&
            animation.playState === (expected === 'active' ? 'running' : 'paused')));
      }, [selector, expected]);
    }

    await t.test('repeated start, mount, detach, and destroy release observers and global listeners', async () => {
      const f = await fixture({ instrument: true }), { page } = f;
      try {
        const baseline = await page.evaluate(() => window.__resourceCounts());
        assert.equal(baseline.observers.IntersectionObserver, 0);
        assert.equal(baseline.observers.ResizeObserver, 0);
        assert.equal(baseline.frames, 0); assert.equal(baseline.panels, 0);
        for (let iteration = 0; iteration < 12; iteration++) {
          await page.evaluate(() => { localStorage.clear(); window.__startRuntime(); });
          await state(page, FRAME, 'active');
          const mounted = await page.evaluate(() => window.__resourceCounts());
          assert.equal(mounted.observers.IntersectionObserver, 1, 'All five frames share one visibility observer');
          assert.equal(mounted.frames, 5); assert.equal(mounted.panels, 1);
          assert.ok(mounted.observers.MutationObserver > 0 && mounted.observers.ResizeObserver > 0);
          await page.evaluate(() => {
            const runtime = window.__neonCodexRuntime;
            for (let i = 0; i < 10; i++) {
              const old = document.querySelector('[data-neon-settings-slot]'), next = old.cloneNode(false);
              old.replaceWith(next); runtime.mountAppearance(next);
            }
          });
          await twoFrames(page);
          assert.deepEqual(await page.evaluate(() => window.__resourceCounts()), mounted, 'Route remounts must not accumulate observers, listeners, or controls');
          await page.evaluate(() => {
            // Leave both a deferred save and a pending fade-out behind.
            document.querySelector('[data-neon-settings-root] [role="switch"]').click();
            window.__neonCodexRuntime.destroy();
          });
          await twoFrames(page);
          assert.deepEqual(await page.evaluate(() => window.__resourceCounts()), baseline);
        }
      } finally { await f.close(); }
    });

    await t.test('destroy during a late native-window transition cannot recreate a border or retain its observer', async () => {
      const f = await fixture({ instrument: true }), { page } = f;
      try {
        const baseline = await page.evaluate(() => window.__resourceCounts());
        await page.evaluate(() => {
          document.documentElement.dataset.codexWindowType = 'utility';
          const runtime = window.__startRuntime();
          document.documentElement.dataset.codexWindowType = 'electron';
          // Destroy before the attribute observer sees the newly eligible shell.
          // Sidebar disposal must not create a layer after layer cleanup ran.
          runtime.destroy();
        });
        await twoFrames(page);
        assert.deepEqual(await page.evaluate(() => window.__resourceCounts()), baseline);
        assert.equal(await page.locator(FRAME).count(), 0);
      } finally { await f.close(); }
    });

    await t.test('unrelated host styles and streamed content do not rewrite the settings panel', async () => {
      const f = await fixture(), { page } = f;
      try {
        await state(page, SAMPLE, 'active'); await twoFrames(page);
        const result = await page.evaluate(async selector => {
          const root = document.querySelector(selector), frame = document.querySelector('[data-neon-global]');
          document.querySelector('.page-surface').style.transform = 'translateX(var(--neon-test-offset, 0px))';
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const initial = frame.getBoundingClientRect();
          let writes = 0;
          const observer = new MutationObserver(records => { writes += records.length; });
          observer.observe(root, { attributes: true, childList: true, characterData: true, subtree: true });
          const stream = document.createElement('article'); document.querySelector('#workspace-view').append(stream);
          const token = document.createTextNode(''); stream.append(token);
          for (let i = 0; i < 20; i++) {
            document.body.style.setProperty('--unrelated-native-progress', String(i));
            document.documentElement.classList.toggle('unrelated-native-state', i % 2 === 0);
            token.data += ' token';
            const paragraph = document.createElement('p'); paragraph.textContent = 'New content'; stream.append(paragraph);
            await new Promise(resolve => requestAnimationFrame(resolve));
          }
          // A host transform can change screen geometry without ResizeObserver.
          // The no-op theme fast path must still reconcile the border's bounds.
          document.documentElement.style.setProperty('--neon-test-offset', '11px');
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const translated = frame.getBoundingClientRect().left - initial.left;
          observer.disconnect(); stream.remove();
          return { writes, translated };
        }, PANEL);
        assert.equal(result.writes, 0, 'Unchanged appearance must not rewrite controls or restart their transitions');
        assert.ok(Math.abs(result.translated - 11) < .1, 'Host geometry changes must still move the border');
      } finally { await f.close(); }
    });

    await t.test('off and zero intensity stop the clock after the dissolve, without losing its phase', async () => {
      const f = await fixture(), { page } = f;
      try {
        await state(page, FRAME, 'active');
        await page.evaluate(() => { const frame = document.querySelector('[data-neon-global]'); window.__clock = frame.getAnimations().find(animation => animation.animationName === 'neon-glow-orbit'); });
        const before = await page.evaluate(() => window.__clock.currentTime);
        await page.getByRole('switch', { name: 'Glow', exact: true }).click();
        await state(page, FRAME, 'paused');
        assert.equal(await page.locator(FRAME).evaluate(node => Number(getComputedStyle(node).opacity)), 0);
        const pausedTime = await page.evaluate(() => window.__clock.currentTime);
        await twoFrames(page);
        assert.equal(await page.evaluate(() => window.__clock.currentTime), pausedTime);
        assert.ok(pausedTime >= before);
        await page.getByRole('switch', { name: 'Glow', exact: true }).click();
        await state(page, FRAME, 'active');
        assert.equal(await page.locator(FRAME).evaluate(node => node.getAnimations().includes(window.__clock)), true);
        await page.getByRole('slider', { name: 'Intensity', exact: true }).fill('0');
        await state(page, '[data-neon-codex-frame]', 'paused');
        assert.equal(await page.evaluate(() => window.__neonCodexRuntime.getPreferences().enabled), true, 'Zero intensity must not silently switch Glow off');
        await page.getByRole('slider', { name: 'Intensity', exact: true }).fill('0.65');
        await state(page, FRAME, 'active');
      } finally { await f.close(); }
    });

    await t.test('rapid toggle reversals keep the animation instance and cancel the pending suspension', async () => {
      const f = await fixture(), { page } = f;
      try {
        const result = await page.evaluate(async () => {
          const frame = document.querySelector('[data-neon-global]'), toggle = document.querySelector('[data-neon-settings-root] [role="switch"]');
          const clock = frame.getAnimations().find(animation => animation.animationName === 'neon-glow-orbit');
          const started = clock.currentTime;
          for (let i = 0; i < 4; i++) {
            toggle.click(); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); toggle.click();
          }
          window.__clock = clock;
          return { same: frame.getAnimations().includes(clock), started, ended: clock.currentTime };
        });
        assert.equal(result.same, true); assert.ok(result.ended >= result.started);
        await state(page, FRAME, 'active');
        // Cross the pending-dissolve deadline to catch a stale timeout pausing
        // an already re-enabled border; this is behavior, not a speed budget.
        await page.waitForTimeout(800);
        assert.equal(await page.evaluate(() => window.__clock.playState), 'running');
        assert.equal(await page.locator(FRAME).evaluate(node => node.getAnimations().includes(window.__clock)), true);
      } finally { await f.close(); }
    });

    await t.test('offscreen and detached previews sleep while the visible border keeps running', async () => {
      const f = await fixture(), { page } = f;
      try {
        await state(page, SAMPLE, 'active');
        await page.evaluate(() => {
          const space = document.createElement('div'); space.id = 'offscreen-test-space'; space.style.height = '2400px';
          document.querySelector('#appearance-view').append(space);
          document.querySelector('.main').scrollTop = 10000;
        });
        await state(page, SAMPLE, 'paused'); await state(page, FRAME, 'active');
        await page.evaluate(() => { document.querySelector('.main').scrollTop = 0; });
        await state(page, SAMPLE, 'active');
        const preferences = await page.evaluate(() => window.__neonCodexRuntime.getPreferences());
        await page.evaluate(() => {
          window.__detachedPanel = document.querySelector('[data-neon-settings-root]');
          const slot = document.querySelector('[data-neon-settings-slot]'); window.__slotParent = slot.parentElement; slot.remove();
        });
        await page.waitForFunction(() => !window.__detachedPanel.isConnected && [...window.__detachedPanel.querySelectorAll('[data-neon-codex-frame]')].every(node => node.dataset.rendering === 'paused'));
        await state(page, FRAME, 'active');
        await page.evaluate(() => {
          const slot = document.createElement('div'); slot.dataset.neonSettingsSlot = 'v1'; window.__slotParent.prepend(slot);
          window.__neonCodexRuntime.mountAppearance(slot);
        });
        await state(page, SAMPLE, 'active');
        assert.deepEqual(await page.evaluate(() => window.__neonCodexRuntime.getPreferences()), preferences);
      } finally { await f.close(); }
    });

    await t.test('utility window suspension follows geometry visibility and resumes the same clock', async () => {
      const f = await fixture(), { page } = f;
      try {
        await page.evaluate(() => {
          window.__clock = document.querySelector('[data-neon-global]').getAnimations().find(animation => animation.animationName === 'neon-glow-orbit');
          document.documentElement.dataset.codexWindowType = 'utility';
        });
        await state(page, FRAME, 'paused');
        assert.equal(await page.locator(FRAME).evaluate(node => getComputedStyle(node).visibility), 'hidden');
        const time = await page.evaluate(() => window.__clock.currentTime);
        await twoFrames(page);
        assert.equal(await page.evaluate(() => window.__clock.currentTime), time);
        await page.evaluate(() => { document.documentElement.dataset.codexWindowType = 'electron'; });
        await state(page, FRAME, 'active');
        assert.equal(await page.locator(FRAME).evaluate(node => getComputedStyle(node).visibility), 'visible');
        assert.equal(await page.locator(FRAME).evaluate(node => node.getAnimations().includes(window.__clock)), true);
      } finally { await f.close(); }
    });

    await t.test('document visibility suspends all clocks and flourishes, then restores the saved appearance', async () => {
      const f = await fixture(), { page } = f;
      try {
        await state(page, SAMPLE, 'active');
        const preferences = await page.evaluate(() => window.__neonCodexRuntime.getPreferences());
        await page.getByRole('button', { name: 'Shuffle color selection', exact: true }).click();
        const shuffled = await page.evaluate(() => window.__neonCodexRuntime.getPreferences());
        assert.notDeepEqual(shuffled.profiles.light.colors, preferences.profiles.light.colors);
        // Chromium headless does not expose native macOS visibility. Explicitly
        // simulate the browser property/event boundary consumed by the runtime.
        await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
        await state(page, '[data-neon-codex-frame]', 'paused');
        assert.equal(await page.locator('.neon-color-dots').getAttribute('data-constellation'), null);
        const times = await page.locator('[data-neon-codex-frame]').evaluateAll(nodes => nodes.map(node => node.getAnimations().find(animation => animation.animationName === 'neon-glow-orbit').currentTime));
        await twoFrames(page);
        assert.deepEqual(await page.locator('[data-neon-codex-frame]').evaluateAll(nodes => nodes.map(node => node.getAnimations().find(animation => animation.animationName === 'neon-glow-orbit').currentTime)), times);
        await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
        await state(page, '[data-neon-codex-frame]', 'active');
        assert.deepEqual(await page.evaluate(() => window.__neonCodexRuntime.getPreferences()), shuffled);
      } finally { await f.close(); }
    });
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
});
