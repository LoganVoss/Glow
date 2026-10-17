import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = `<!doctype html><html data-codex-window-type="electron" data-theme="light"><head>
<link rel="stylesheet" href="/src/theme-transition.css"><style>
:root { --background: rgb(250, 250, 250); --foreground: rgb(20, 20, 20); }
:root[data-theme=dark], body[data-theme=dark] { --background: rgb(20, 20, 20); --foreground: rgb(240, 240, 240); }
@media (prefers-color-scheme:dark) { :root:not([data-theme]) { --background: rgb(20,20,20); --foreground:rgb(240,240,240); } }
body, [data-app-shell-main-surface] { background:var(--background); color:var(--foreground); }
button { background:var(--background); color:var(--foreground); border:1px solid currentColor; }
button[data-moving=true] { transform:translateX(120px); }
main { padding:32px; width:600px; height:400px; }
</style></head><body><section data-app-shell-frame><main data-app-shell-main-surface>
<h1>Appearance</h1><button id="button" style="transition:transform 600ms linear, opacity 160ms ease">Theme</button>
<input id="input" value="Still interactive"><div id="mount"></div>
</main></section><script type="module">
import {createThemeTransition} from '/src/theme-transition.js';
window.transition = createThemeTransition(window);
// Native System mode resolves to an explicit data-theme value, rather than
// changing app colors directly in a prefers-color-scheme CSS query.
window.systemTheme = false;
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
  if (window.systemTheme) document.documentElement.dataset.theme = event.matches ? 'dark' : 'light';
});
window.ready = true;
</script></body></html>`;
const channel = value => Number(value.match(/[\d.]+/)[0]);

test('native theme color dissolve keeps controls, layout motion, and cleanup intact', { timeout: 40_000 }, async t => {
  const server = createServer(async (request, response) => {
    if (request.url === '/') { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end(FIXTURE); return; }
    try {
      assert.match(request.url, /^\/(src|preview)\/[a-z0-9.-]+$/i);
      response.writeHead(200, { 'Content-Type': request.url.endsWith('.js') ? 'text/javascript' : request.url.endsWith('.html') ? 'text/html' : 'text/css' });
      response.end(await readFile(path.join(ROOT, request.url)));
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.NEON_TEST_BROWSER || (existsSync(chrome) ? chrome : undefined), chromiumSandbox: true });
    async function fixture(options = {}) {
      const context = await browser.newContext(options);
      await context.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(origin); await page.waitForFunction(() => window.ready);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      return { context, page, async close() { assert.deepEqual(errors, []); await context.close(); } };
    }
    const background = page => page.locator('main').evaluate(node => getComputedStyle(node).backgroundColor);

    await t.test('interpolates the actual colors in both directions and leaves input usable', async () => {
      const f = await fixture(), { page } = f;
      assert.equal(await page.locator('html').getAttribute('data-neon-theme-transition'), null, 'Do not dissolve on initial paint');
      assert.equal(channel(await background(page)), 250);
      await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
      await page.waitForTimeout(55);
      const mid = channel(await background(page));
      assert.ok(mid > 20 && mid < 245, `Dark should interpolate, not jump: ${mid}`);
      await page.locator('#input').fill('Editing during transition');
      assert.equal(await page.locator('#input').inputValue(), 'Editing during transition');
      await page.waitForTimeout(340);
      assert.equal(channel(await background(page)), 20);
      assert.equal(await page.locator('html').getAttribute('data-neon-theme-transition'), null, 'Temporary transition must be removed');
      await page.evaluate(() => document.documentElement.dataset.theme = 'light');
      await page.waitForTimeout(55);
      const reversed = channel(await background(page));
      assert.ok(reversed > 20 && reversed < 250);
      await page.waitForTimeout(340);
      assert.equal(channel(await background(page)), 250);
      await f.close();
    });

    await t.test('switches foregrounds immediately and finishes the surface response within 200ms', async () => {
      const f = await fixture(), { page } = f;
      const result = await page.evaluate(async () => {
        const root = document.documentElement;
        const nodes = [document.body, document.querySelector('main'), document.querySelector('h1'), document.querySelector('#button')];
        const sample = () => ({
          foregrounds: nodes.map(node => getComputedStyle(node).color),
          background: getComputedStyle(document.querySelector('main')).backgroundColor,
        });
        root.dataset.theme = 'dark';
        await new Promise(resolve => requestAnimationFrame(resolve));
        const first = sample();
        await new Promise(resolve => setTimeout(resolve, 55));
        const middle = sample();
        await new Promise(resolve => setTimeout(resolve, 145));
        const settled = sample();
        return { first, middle, settled, active: root.hasAttribute('data-neon-theme-transition'), selectedTheme: root.dataset.theme };
      });
      assert.equal(result.selectedTheme, 'dark', 'The native theme applies without waiting on motion');
      assert.deepEqual(result.first.foregrounds, Array(4).fill('rgb(240, 240, 240)'), 'Nested text must not chase an inherited color transition');
      assert.ok(channel(result.middle.background) > 20 && channel(result.middle.background) < 250, 'The large surface still softens the palette change');
      assert.equal(channel(result.settled.background), 20, 'The response finishes promptly rather than feeling like loading');
      assert.equal(result.active, false, 'Do not leave a delayed transition state behind');
      await f.close();
    });

    await t.test('rapid reversal starts at the visible shade instead of flashing to an endpoint', async () => {
      const f = await fixture(), { page } = f;
      const shades = await page.evaluate(async () => {
        const surface = document.querySelector('main');
        document.documentElement.dataset.theme = 'dark';
        await new Promise(resolve => setTimeout(resolve, 90));
        const before = getComputedStyle(surface).backgroundColor;
        document.documentElement.dataset.theme = 'light';
        await new Promise(resolve => requestAnimationFrame(resolve));
        const after = getComputedStyle(surface).backgroundColor;
        return [before, after];
      });
      assert.ok(Math.abs(channel(shades[0]) - channel(shades[1])) < 40, `Reverse must remain continuous: ${shades}`);
      await page.waitForTimeout(440);
      assert.equal(channel(await background(page)), 250);
      await f.close();
    });

    await t.test('keeps native transform/opacity transitions and original inline declarations', async () => {
      const f = await fixture(), { page } = f;
      const original = await page.locator('#button').evaluate(node => [node.style.getPropertyValue('transition'), node.style.getPropertyPriority('transition')]);
      await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; document.querySelector('#button').dataset.moving = 'true'; });
      await page.waitForTimeout(120);
      const motion = await page.locator('#button').evaluate(node => {
        const style = getComputedStyle(node);
        return { properties: style.transitionProperty, transform: new DOMMatrixReadOnly(style.transform).m41 };
      });
      assert.match(motion.properties, /transform/); assert.match(motion.properties, /opacity/); assert.match(motion.properties, /background-color/);
      assert.ok(motion.transform > 5 && motion.transform < 100, `Native movement must still interpolate: ${motion.transform}`);
      await page.waitForTimeout(540);
      assert.equal(await page.locator('#button').evaluate(node => new DOMMatrixReadOnly(getComputedStyle(node).transform).m41), 120);
      await page.evaluate(() => window.transition.destroy());
      assert.deepEqual(await page.locator('#button').evaluate(node => [node.style.getPropertyValue('transition'), node.style.getPropertyPriority('transition')]), original);
      assert.equal(await page.locator('[data-neon-theme-colors]').count(), 0);
      await f.close();
    });

    await t.test('system appearance changes dissolve while explicit mode keeps its choice', async () => {
      const f = await fixture({ colorScheme: 'light' }), { page } = f;
      await page.evaluate(() => window.systemTheme = true);
      await page.emulateMedia({ colorScheme: 'dark' }); await page.waitForTimeout(100);
      const mid = channel(await background(page));
      assert.ok(mid > 20 && mid < 250, `System appearance should interpolate: ${mid}`);
      await page.waitForTimeout(340);
      await page.evaluate(() => { window.systemTheme = false; document.documentElement.dataset.theme = 'light'; }); await page.waitForTimeout(440);
      await page.emulateMedia({ colorScheme: 'light' });
      assert.equal(await page.locator('html').getAttribute('data-neon-theme-transition'), null);
      assert.equal(channel(await background(page)), 250);
      await f.close();
    });

    await t.test('honors reduced motion immediately, including a mid-transition change', async () => {
      const f = await fixture({ reducedMotion: 'reduce' }), { page } = f;
      await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
      assert.equal(channel(await background(page)), 20);
      assert.equal(await page.locator('html').getAttribute('data-neon-theme-transition'), null);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.evaluate(() => document.documentElement.dataset.theme = 'light'); await page.waitForTimeout(70);
      await page.evaluate(() => document.documentElement.dataset.reducedMotion = 'true');
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(channel(await background(page)), 250);
      assert.equal(await page.locator('html').getAttribute('data-neon-theme-transition'), null);
      await f.close();
    });

    await t.test('streamed text never rescans the document and only new controls are prepared', async () => {
      const f = await fixture(), { page } = f;
      const result = await page.evaluate(async () => {
        let scans = 0, frames = 0;
        const query = document.querySelectorAll.bind(document), raf = requestAnimationFrame;
        document.querySelectorAll = (...args) => { scans++; return query(...args); };
        window.requestAnimationFrame = callback => { frames++; return raf(callback); };
        const mount = document.querySelector('#mount');
        for (let index = 0; index < 30; index++) {
          mount.replaceChildren(document.createTextNode(String(index)));
          await new Promise(resolve => setTimeout(resolve, 1));
        }
        await new Promise(resolve => setTimeout(resolve, 35));
        const streamed = { scans, frames };
        const button = document.createElement('button'); button.textContent = 'New control'; mount.append(button);
        await new Promise(resolve => setTimeout(resolve, 35));
        const prepared = button.hasAttribute('data-neon-theme-colors');
        button.remove(); await new Promise(resolve => setTimeout(resolve, 35));
        const restored = !button.hasAttribute('data-neon-theme-colors') && !button.style.getPropertyValue('--neon-theme-base-transition');
        document.querySelectorAll = query; window.requestAnimationFrame = raf;
        return { streamed, scans, prepared, restored };
      });
      assert.deepEqual(result.streamed, { scans: 0, frames: 0 }, 'Text-only changes must schedule no theme work');
      assert.equal(result.scans, 0, 'Mounting one new control must not traverse the existing document');
      assert.equal(result.prepared, true); assert.equal(result.restored, true);
      await f.close();
    });

    await t.test('removed subtrees release immediately with RAF suspended and do not scan surviving controls', async () => {
      const f = await fixture(), { page } = f;
      await page.evaluate(() => {
        const mount = document.querySelector('#mount');
        for (let i = 0; i < 200; i++) {
          const button = document.createElement('button'); button.className = 'retained-control'; mount.append(button);
        }
        const branch = document.createElement('div'); branch.id = 'removed-branch';
        const control = document.createElement('button'); control.id = 'removed-control';
        control.style.setProperty('--neon-theme-base-transition', 'opacity 70ms', 'important');
        branch.append(control); mount.append(branch);
        for (let i = 0; i < 50; i++) { const node = document.createElement('span'); node.className = 'streamed-markup'; mount.append(node); }
      });
      await page.waitForFunction(() => document.querySelector('#removed-control').hasAttribute('data-neon-theme-colors'));
      const result = await page.evaluate(async () => {
        let reads = 0, frames = 0;
        const connected = Object.getOwnPropertyDescriptor(Node.prototype, 'isConnected').get;
        for (const node of document.querySelectorAll('.retained-control')) {
          Object.defineProperty(node, 'isConnected', { configurable: true, get() { reads++; return connected.call(this); } });
        }
        const raf = window.requestAnimationFrame;
        // A background window may not get another animation frame for minutes.
        window.requestAnimationFrame = () => { frames++; return -frames; };
        const control = document.querySelector('#removed-control');
        // Cleanup cannot depend on Glow's marker still being present.
        control.removeAttribute('data-neon-theme-colors');
        document.querySelector('#removed-branch').remove();
        for (const node of document.querySelectorAll('.streamed-markup')) node.remove();
        await new Promise(resolve => setTimeout(resolve, 0));
        const restored = [control.style.getPropertyValue('--neon-theme-base-transition'), control.style.getPropertyPriority('--neon-theme-base-transition')];
        window.requestAnimationFrame = raf;
        return { reads, frames, restored };
      });
      assert.deepEqual(result, { reads: 0, frames: 0, restored: ['opacity 70ms', 'important'] },
        'Detaching markup must neither scan the live conversation nor wait for a visible-window frame to release controls');
      await f.close();
    });

    await t.test('moving a prepared control between native containers preserves its original transition', async () => {
      const f = await fixture(), { page } = f;
      const result = await page.evaluate(async () => {
        const button = document.querySelector('#button');
        const before = button.style.getPropertyValue('--neon-theme-base-transition');
        document.querySelector('#mount').append(button);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const after = button.style.getPropertyValue('--neon-theme-base-transition');
        const marked = button.getAttribute('data-neon-theme-colors');
        window.transition.destroy();
        return { before, after, marked, restored: button.style.getPropertyValue('--neon-theme-base-transition') };
      });
      assert.equal(result.before, result.after);
      assert.equal(result.marked, 'v1'); assert.equal(result.restored, '');
      await f.close();
    });

    await t.test('native PageSurface keeps its own layout transitions during the dissolve', async () => {
      const f = await fixture(), { page } = f;
      await page.evaluate(() => {
        const surface = document.createElement('section');
        surface.className = '_PageSurface_native_2';
        surface.id = 'native-surface';
        surface.style.cssText = 'width: 300px; height: 40px; background: var(--background); transition: width 600ms linear, opacity 160ms ease';
        document.querySelector('[data-app-shell-frame]').append(surface);
      });
      await page.waitForFunction(() => document.querySelector('#native-surface').hasAttribute('data-neon-theme-colors'));
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.evaluate(() => {
        document.documentElement.dataset.theme = 'dark';
        document.querySelector('#native-surface').style.width = '600px';
      });
      await page.waitForTimeout(110);
      const middle = await page.locator('#native-surface').evaluate(node => ({
        width: node.getBoundingClientRect().width,
        background: getComputedStyle(node).backgroundColor,
        properties: getComputedStyle(node).transitionProperty,
      }));
      assert.ok(middle.width > 310 && middle.width < 450, `Native width still interpolates: ${middle.width}`);
      assert.ok(channel(middle.background) > 20 && channel(middle.background) < 250, 'Native PageSurface color dissolves');
      assert.match(middle.properties, /width/); assert.match(middle.properties, /opacity/); assert.match(middle.properties, /background-color/);
      await page.waitForTimeout(550);
      assert.equal(await page.locator('#native-surface').evaluate(node => node.getBoundingClientRect().width), 600);
      await f.close();
    });

    await t.test('the integrated shell dissolves while ordinary resizing stays immediate', async () => {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      await context.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${origin}/preview/index.html`);
      await page.waitForFunction(() => window.__neonCodexRuntime && document.querySelector('.page-surface[data-neon-theme-colors="v1"]'));
      await page.getByRole('button', { name: 'Show workspace', exact: true }).click();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const result = await page.evaluate(async () => {
        const shell = document.querySelector('[data-app-shell-frame]');
        const surface = document.querySelector('.page-surface');
        const frame = document.querySelector('[data-neon-global="true"]');
        const sidebar = document.querySelector('.sidebar');
        const nodes = [document.body, shell, surface, sidebar];
        const colors = () => nodes.map(node => getComputedStyle(node).backgroundColor);
        const before = colors();
        const samples = [];
        document.documentElement.dataset.theme = 'dark';
        await new Promise(resolve => setTimeout(resolve, 110));
        const middle = colors();
        for (const width of [1200, 1160, 1110, 1060]) {
          shell.style.width = `${width}px`;
          sidebar.style.width = `${width / 5}px`;
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const surfaceRect = surface.getBoundingClientRect(), frameRect = frame.getBoundingClientRect();
          samples.push({ requested: width, shell: shell.getBoundingClientRect().width, sidebar: sidebar.getBoundingClientRect().width,
            surfaceX: surfaceRect.x, frameX: frameRect.x, surfaceWidth: surfaceRect.width, frameWidth: frameRect.width });
        }
        await new Promise(resolve => setTimeout(resolve, 340));
        const after = colors();
        return { before, middle, after, samples, marker: document.documentElement.getAttribute('data-neon-theme-transition') };
      });
      for (let index = 0; index < result.before.length; index++) {
        const before = channel(result.before[index]), middle = channel(result.middle[index]), after = channel(result.after[index]);
        assert.ok(middle > Math.min(before, after) && middle < Math.max(before, after), `Native surface ${index} must dissolve: ${before}, ${middle}, ${after}`);
      }
      for (const sample of result.samples) {
        assert.equal(sample.shell, sample.requested, 'Color dissolve adds no width transition to the shell');
        assert.ok(Math.abs(sample.sidebar - sample.requested / 5) < .1, 'Sidebar resizing remains immediate');
        assert.ok(Math.abs(sample.surfaceX - sample.frameX) < 1.25, 'Glow tracks the surface after resizing');
        assert.ok(Math.abs(sample.surfaceWidth - sample.frameWidth) < 1.25, 'Glow tracks the resized width');
      }
      assert.equal(result.marker, null);
      assert.deepEqual(errors, []); await context.close();
    });

    await t.test('supports body theme, late-mounted controls, and exact destroy cleanup', async () => {
      const f = await fixture(), { page } = f;
      await page.evaluate(() => {
        document.documentElement.removeAttribute('data-theme');
        const node = document.createElement('button'); node.id = 'late'; node.textContent = 'Late control';
        node.style.setProperty('--neon-theme-base-transition', 'opacity 70ms', 'important');
        document.querySelector('#mount').append(node);
      });
      await page.waitForFunction(() => document.querySelector('#late').hasAttribute('data-neon-theme-colors'));
      await page.evaluate(() => document.body.dataset.theme = 'dark'); await page.waitForTimeout(100);
      const mid = await page.locator('#late').evaluate(node => getComputedStyle(node).backgroundColor);
      assert.ok(channel(mid) > 20 && channel(mid) < 250);
      await page.evaluate(() => window.transition.destroy());
      assert.equal(await page.locator('html').getAttribute('data-neon-theme-transition'), null);
      assert.equal(await page.locator('[data-neon-theme-colors]').count(), 0);
      assert.deepEqual(await page.locator('#late').evaluate(node => [node.style.getPropertyValue('--neon-theme-base-transition'), node.style.getPropertyPriority('--neon-theme-base-transition')]), ['opacity 70ms', 'important']);
      await page.evaluate(() => document.body.dataset.theme = 'light');
      assert.equal(await page.locator('html').getAttribute('data-neon-theme-transition'), null);
      await f.close();
    });
  } finally {
    await browser?.close(); await new Promise(resolve => server.close(resolve));
  }
});
