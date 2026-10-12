import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// Fresh browser context: only our standalone fixture, never the installed app.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QA = path.join(ROOT, '.local/qa');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const FRAME = '[data-neon-codex-frame][data-neon-global="true"]';
const SETTINGS = '[data-neon-settings-root]';
const KEY = 'neon-codex:preferences:v1';

test('Glow: balanced color controls, fluid palettes, and native lifecycle', { timeout: 180_000 }, async t => {
  await mkdir(QA, { recursive: true });
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      assert.match(pathname, /^\/(preview|src)\/[a-z0-9.-]+$/i);
      const bytes = await readFile(path.join(ROOT, pathname));
      response.writeHead(200, { 'Content-Type': MIME[path.extname(pathname)] || 'text/plain', 'Cache-Control': 'no-store' });
      response.end(bytes);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const localChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const executablePath = process.env.NEON_TEST_BROWSER || (existsSync(localChrome) ? localChrome : undefined);
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath, chromiumSandbox: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1530 }, deviceScaleFactor: 1 });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const origin = `http://127.0.0.1:${server.address().port}`;
    await context.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    await page.goto(`${origin}/preview/index.html`);
    const ready = () => page.getByRole('heading', { name: 'Glow', exact: true }).waitFor();
    await ready();
    const frame = page.locator(FRAME), panel = page.locator(SETTINGS);
    const slider = label => page.getByRole('slider', { name: label, exact: true });
    const computed = property => frame.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name).trim(), property);
    const current = () => page.evaluate(() => window.__neonCodexRuntime.getPreferences());
    const reset = () => page.evaluate(() => window.__neonCodexRuntime.reset());
    const setSlider = async (label, value) => slider(label).fill(String(value));
    const colorDice = () => panel.getByRole('button', { name: 'Shuffle color selection', exact: true });
    const solo = () => panel.getByRole('button', { name: 'Select one color', exact: true });
    const paletteBrowser = () => panel.getByRole('button', { name: 'Color Slider', exact: true });
    const appearance = p => Object.fromEntries(['thickness','spread','intensity','saturation','hue','depth','gloss','speed'].map(k => [k,p[k]]));
    const pattern = name => panel.locator(`button[data-pattern="${name}"]`);
    const palette = name => panel.locator(`button[data-palette="${name}"]`);
    const theme = async value => {
      await page.locator(`#${value}-theme`).click();
      await page.waitForFunction(([selector, value]) => document.querySelector(selector).dataset.theme === value, [FRAME, value]);
    };
    const tabTheme = async value => {
      await page.getByRole('tab', { name: value === 'light' ? 'Light' : 'Dark', exact: true }).click();
      await page.waitForFunction(([selector, value]) => document.documentElement.dataset.theme === value && document.querySelector(selector).dataset.theme === value, [FRAME, value]);
    };
    const save = () => page.waitForFunction(key => JSON.stringify(window.__neonCodexRuntime.getPreferences()) === localStorage.getItem(key), KEY);
    const assertNeutralHue = async () => {
      const prefs = await current();
      assert.equal(prefs.profiles.light.hue, 0); assert.equal(prefs.profiles.dark.hue, 0);
      const rendered = await page.locator('[data-neon-codex-frame]').evaluateAll(nodes => nodes.map(node => {
        const style = getComputedStyle(node);
        return [style.getPropertyValue('--neon-hue').trim(), style.filter];
      }));
      assert.ok(rendered.length >= 5, 'Audit the live border, preview and animation cards');
      for (const [hue, filter] of rendered) { assert.equal(hue, '0deg'); assert.match(filter, /hue-rotate\(0deg\)/); }
    };

    await t.test('three animations, two vibes, visible controls, and centered profile tabs', async () => {
      assert.equal(await frame.count(), 1); assert.equal(await panel.count(), 1);
      assert.equal(await computed('--neon-thickness'), '1.2px');
      assert.equal(await computed('pointer-events'), 'none');
      assert.equal(await panel.locator('select,input[type="color"],input[type="text"],.neon-color-summary').count(), 0);
      const sections = await panel.evaluate(node => [...node.querySelectorAll('[role="group"]')].map(n => n.getAttribute('aria-label')));
      assert.ok(sections.indexOf('Vibe') < sections.indexOf('Animation'));
      assert.deepEqual(await panel.locator('button[data-pattern]').allTextContents(), ['Pulse', 'Bloom', 'Ping']);
      assert.deepEqual(await panel.locator('button[data-palette]').allTextContents(), ['Soft', 'Neon']);
      assert.deepEqual((await current()).profiles.light, (await current()).profiles.dark);
      assert.equal(await frame.getAttribute('data-pattern'), 'prism');
      assert.equal(await computed('--neon-spread'), '7.5px');
      assert.equal(await computed('--neon-hue'), '0deg');
      await assertNeutralHue();
      assert.equal(await panel.locator('.neon-custom-drawer,.neon-custom-toggle,.neon-reverse,.neon-hue-slider').count(), 0);
      assert.equal(await panel.getByRole('slider').count(), 6);
      assert.deepEqual(await panel.locator('.neon-range-caption').allTextContents(), ['Thickness', 'Spread', 'Intensity', 'Saturation', 'Gloss', 'Animation Speed']);
      assert.equal(await slider('Hue Offset').count(), 0); assert.equal(await slider('3D Depth').count(), 0);
      assert.equal(await panel.locator('.neon-custom-editor').isVisible(), true);
      assert.equal(await colorDice().getAttribute('title'), 'Shuffle color selection');
      assert.equal(await panel.locator('.neon-settings-dice,.neon-tuning-heading').count(), 0);
      assert.equal(await solo().textContent(), '1');
      assert.equal(await solo().getAttribute('title'), 'Select one color');
      assert.equal(await paletteBrowser().getAttribute('title'), 'Color Slider');
      assert.equal(await paletteBrowser().getAttribute('aria-expanded'), 'false');
      assert.equal((await panel.textContent()).includes('Glow settings'), false);
      assert.equal(await panel.getByRole('button', { name: 'Reset', exact: true }).count(), 0);
      for (const text of ['A little light', 'Light in the details', 'currently active', 'Saved on this device', 'Reset this appearance', 'Reverse direction', 'Pause animation', 'Loop duration']) assert.equal((await panel.textContent()).includes(text), false, text);
      assert.ok(await panel.locator('.neon-preview-bloom path').count() > 0);
      const centers = await panel.evaluate(node => {
        const p = node.getBoundingClientRect(), tabs = node.querySelector('.neon-profile-tabs').getBoundingClientRect();
        return [p.x + p.width / 2, tabs.x + tabs.width / 2];
      });
      assert.ok(Math.abs(centers[0] - centers[1]) < 2);
      await page.screenshot({ path: path.join(QA, 'appearance-light.png'), fullPage: true, animations: 'disabled' });
      await theme('dark');
      await page.waitForTimeout(700);
      assert.equal(await page.getByRole('tab', { name: 'Dark', exact: true }).getAttribute('aria-selected'), 'true');
      await page.screenshot({ path: path.join(QA, 'appearance-dark.png'), fullPage: true, animations: 'disabled' });
      await theme('light');
    });

    await t.test('unboxed color controls span the settings width and reserve their slider without shifting layout', async () => {
      for (const width of [1440, 768, 390]) {
        await page.setViewportSize({ width, height: 1530 });
        await paletteBrowser().scrollIntoViewIfNeeded();
        const result = await panel.evaluate(async root => {
          const console = root.querySelector('.neon-color-selection');
          const stage = root.querySelector('.neon-dot-stage'), dock = root.querySelector('.neon-color-actions');
          const space = root.querySelector('.neon-palette-browser-space'), ranges = root.querySelector('.neon-range-grid');
          const vibe = root.querySelector('.neon-palette-section'), animation = root.querySelector('.neon-pattern-section');
          const button = root.querySelector('.neon-palette-browser-button');
          const rect = node => { const r = node.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; };
          const geometry = () => [rect(stage), rect(dock), rect(space), rect(vibe), rect(animation), rect(ranges)];
          const before = geometry(), samples = [];
          const collect = ms => new Promise(resolve => {
            const start = performance.now();
            const tick = now => { samples.push(geometry()); if (now - start < ms) requestAnimationFrame(tick); else resolve(); };
            requestAnimationFrame(tick);
          });
          button.click(); await collect(500); button.click(); await collect(500);
          const center = r => r[0] + r[2] / 2;
          const box = console.getBoundingClientRect(), style = getComputedStyle(console);
          const buttons = [...dock.children].map(node => {
            const r = node.getBoundingClientRect(), s = getComputedStyle(node);
            return { x: r.x, right: r.right, width: r.width, height: r.height, radius: parseFloat(s.borderRadius), border: parseFloat(s.borderTopWidth), background: s.backgroundColor, image: s.backgroundImage };
          });
          const sections = [console, vibe, animation, ranges].map(node => node.getBoundingClientRect());
          return {before, samples, labels: [...dock.children].map(n => n.getAttribute('aria-label')),
            sectionOrder: [...root.querySelector('.neon-custom-editor').children].map(n => n.className),
            stacked: sections.slice(1).every((r, i) => r.top >= sections[i].bottom),
            actionSpacer: before[1][1] - (before[0][1] + before[0][3]),
            centered: Math.abs(center(before[0]) - center(before[1])) < 2,
            below: before[1][1] >= before[0][1] + before[0][3],
            fullWidth: [box.width, before[0][2], before[1][2]].every(width => Math.abs(width - before[5][2]) < 2),
            chrome: { background: style.backgroundColor, image: style.backgroundImage, border: parseFloat(style.borderTopWidth), shadow: style.boxShadow, backdrop: style.backdropFilter },
            buttons,
            inside: [stage, dock, space].every(node => {
              const r = node.getBoundingClientRect();
              return console.contains(node) && r.left >= box.left && r.right <= box.right && r.top >= box.top && r.bottom <= box.bottom;
            }),
            fitted: space.scrollWidth <= space.clientWidth && root.scrollWidth <= root.clientWidth};
        });
        assert.deepEqual(result.sectionOrder, ['neon-color-selection', 'neon-palette-section', 'neon-pattern-section', 'neon-range-grid']);
        assert.equal(result.stacked, true, 'Color controls, Vibe, Animation, and tuning must follow the same visual order without overlaps');
        assert.ok(result.actionSpacer >= 28, `The dots need a generous spacer before their actions: ${result.actionSpacer}px`);
        assert.deepEqual(result.labels, ['Select one color', 'Color Slider', 'Shuffle color selection']);
        assert.ok(result.centered && result.below && result.fitted && result.inside);
        assert.equal(result.fullWidth, true, 'The dots and action rail should align with the settings sliders');
        assert.deepEqual(result.chrome, { background: 'rgba(0, 0, 0, 0)', image: 'none', border: 0, shadow: 'none', backdrop: 'none' });
        assert.ok(result.buttons.every(button => button.width >= 44 && button.height >= 44 && button.radius >= 8 && button.border >= 1 && (button.background !== 'rgba(0, 0, 0, 0)' || button.image !== 'none')), 'Each action needs a persistent box and a usable target');
        assert.ok(Math.max(...result.buttons.map(b => b.width)) - Math.min(...result.buttons.map(b => b.width)) < 1, 'Action boxes should share the width equally');
        const gaps = result.buttons.slice(1).map((button, i) => button.x - result.buttons[i].right);
        assert.ok(gaps.every(gap => gap >= 6) && Math.abs(gaps[0] - gaps[1]) < 1, 'Action boxes should have uniform spacing');
        assert.ok(result.samples.every(sample => JSON.stringify(sample) === JSON.stringify(result.before)), 'Opening the color browser must not move any settings');
        assert.equal(await paletteBrowser().getAttribute('aria-expanded'), 'false');
      }
      await page.setViewportSize({ width: 1440, height: 1530 });
      await solo().focus();
      await page.keyboard.press('Tab');
      assert.equal(await paletteBrowser().evaluate(node => node === document.activeElement), true);
      await page.keyboard.press('Tab');
      assert.equal(await colorDice().evaluate(node => node === document.activeElement), true);
      for (const control of [palette('soft'), palette('vivid'), pattern('pulse'), pattern('prism'), pattern('signal'), slider('Thickness')]) {
        await page.keyboard.press('Tab');
        assert.equal(await control.evaluate(node => node === document.activeElement), true, 'Keyboard navigation should follow the visible color, Vibe, Animation, and slider order');
      }
      const input = panel.locator('.neon-palette-slider');
      assert.equal(await input.isDisabled(), true);
      assert.equal(await input.evaluate(node => Boolean(node.closest('[inert]'))), true);
      await paletteBrowser().focus(); await paletteBrowser().press('Enter');
      assert.equal(await paletteBrowser().getAttribute('aria-expanded'), 'true');
      assert.equal(await input.isEnabled(), true);
      assert.equal(await input.evaluate(node => node === document.activeElement), true);
      assert.equal(await input.getAttribute('aria-label'), 'Color selection');
      assert.equal(await input.getAttribute('aria-valuetext'), null);
      assert.equal(await panel.locator('.neon-palette-browser-caption,.neon-palette-option-label,.neon-palette-option-position').count(), 0);
      assert.equal((await panel.locator('.neon-palette-browser').textContent()).trim(), '');
      await input.press('ArrowRight');
      await input.press('Escape');
      assert.equal(await paletteBrowser().getAttribute('aria-expanded'), 'false');
      assert.equal(await paletteBrowser().evaluate(node => node === document.activeElement), true);
      assert.equal(await input.isDisabled(), true);
      await page.evaluate(() => document.documentElement.dataset.reducedMotion = 'true');
      await paletteBrowser().click();
      assert.ok(await panel.locator('.neon-palette-browser').evaluate(node => getComputedStyle(node).transitionDuration.split(',').every(s => parseFloat(s) <= .15)));
      await paletteBrowser().click();
      await page.evaluate(() => document.documentElement.dataset.reducedMotion = 'false');
      await reset();
    });

    await t.test('palette browsing preserves tuning and vibe, works with single color, and survives reload', async () => {
      await setSlider('Thickness', 2.6); await setSlider('Intensity', .47); await setSlider('Gloss', .73);
      await paletteBrowser().click();
      const combinations = slider('Color selection');
      for (const vibe of ['soft', 'vivid']) {
        await palette(vibe).click();
        assert.equal(await paletteBrowser().getAttribute('aria-expanded'), 'true');
        const before = (await current()).profiles.light;
        const max = Number(await combinations.getAttribute('max'));
        assert.ok(max >= 23, 'A palette browser should offer many distinct combinations');
        await combinations.fill('0'); const first = (await current()).profiles.light;
        await combinations.fill(String(max)); const last = (await current()).profiles.light;
        assert.notDeepEqual(first.colors, last.colors);
        assert.equal(first.palette, vibe); assert.equal(last.palette, vibe);
        assert.deepEqual(appearance(first), appearance(before)); assert.deepEqual(appearance(last), appearance(before));
        assert.equal(last.pattern, before.pattern); assert.equal(last.solo, false);
        assert.equal(await combinations.getAttribute('aria-valuetext'), null);
      }
      await solo().click();
      const beforeSolo = (await current()).profiles.light;
      assert.equal(await paletteBrowser().getAttribute('aria-expanded'), 'true');
      await combinations.fill('0'); const first = (await current()).profiles.light;
      await combinations.press('End'); const last = (await current()).profiles.light;
      assert.equal(last.solo, true); assert.equal(last.hue, 0); assert.equal(last.palette, 'vivid');
      assert.notEqual(last.colors[last.soloIndex], first.colors[first.soloIndex]);
      assert.deepEqual(appearance(last), appearance(beforeSolo));
      const chosenColor = last.colors[last.soloIndex];
      assert.equal(await panel.locator('.neon-color-dot').evaluateAll((dots, color) => dots.every(dot => dot.style.getPropertyValue('--neon-swatch') === color), chosenColor), true);
      const chosenPosition = await combinations.inputValue();
      await save(); await page.reload(); await ready();
      assert.deepEqual((await current()).profiles.light, last);
      await paletteBrowser().click(); assert.equal(await slider('Color selection').inputValue(), chosenPosition);
      await colorDice().click();
      const shuffled = (await current()).profiles.light;
      assert.equal(shuffled.palette, 'vivid'); assert.equal(shuffled.solo, true); assert.deepEqual(appearance(shuffled), appearance(last));
      assert.equal(await paletteBrowser().getAttribute('aria-expanded'), 'true');
      await paletteBrowser().click(); await reset();
    });

    await t.test('all three rendered patterns blend palettes without restarting their orbit or popping when retargeted', async () => {
      await reset(); await page.waitForTimeout(660);
      for (const name of ['prism', 'pulse', 'signal']) {
        await pattern(name).click(); await palette('soft').click();
        await page.waitForTimeout(460);
        const result = await page.evaluate(async ([frameSelector, panelSelector]) => {
          const frame = document.querySelector(frameSelector), panel = document.querySelector(panelSelector);
          const clock = frame.getAnimations().find(a => a.animationName === 'neon-glow-orbit');
          clock.pause(); clock.currentTime = 1200;
          const tick = () => new Promise(resolve => requestAnimationFrame(resolve));
          const colors = () => Array.from({ length: 6 }, (_, i) => getComputedStyle(frame).getPropertyValue(`--neon-color-${i + 1}`).trim());
          const snapshot = () => ({ colors: colors(), paint: getComputedStyle(frame.querySelector('.neon-glow-color')).backgroundImage,
            edge: getComputedStyle(frame.querySelector('.neon-glow-edge')).backgroundImage, opacity: getComputedStyle(frame).opacity });
          const transitions = () => frame.getAnimations().filter(a => /^--neon-color-[1-6]$/.test(a.transitionProperty));
          await tick(); const before = snapshot();
          panel.querySelector('[data-palette="vivid"]').click();
          const blends = transitions(), durations = blends.map(a => a.effect.getTiming().duration);
          blends.forEach(a => { a.pause(); a.currentTime = 0; });
          await tick(); const initial = snapshot();
          blends.forEach(a => a.currentTime = a.effect.getTiming().duration / 2);
          await tick(); const middle = snapshot();
          panel.querySelector('[data-palette="soft"]').click();
          const retargets = transitions();
          retargets.forEach(a => { a.pause(); a.currentTime = 0; });
          await tick(); const retargeted = snapshot();
          retargets.forEach(a => a.finish());
          await tick(); const returned = snapshot();
          panel.querySelector('[data-palette="vivid"]').click();
          transitions().forEach(a => a.finish());
          await tick(); const final = snapshot();
          const sameClock = frame.getAnimations().includes(clock) && clock.currentTime === 1200;
          clock.play();
          return { before, initial, middle, retargeted, returned, final, durations, count: blends.length, sameClock };
        }, [FRAME, SETTINGS]);
        assert.equal(result.count, 6, `${name}: all six colors should blend`);
        assert.ok(result.durations.every(duration => duration >= 300 && duration <= 500));
        assert.deepEqual(result.initial, result.before, `${name}: a palette change should start from the current image`);
        assert.ok(result.middle.colors.every((color, i) => color !== result.before.colors[i] && color !== result.final.colors[i]), `${name}: every hue must have an intermediate color`);
        assert.notEqual(result.middle.paint, result.before.paint); assert.notEqual(result.middle.paint, result.final.paint);
        assert.notEqual(result.middle.edge, result.before.edge); assert.notEqual(result.middle.edge, result.final.edge);
        assert.deepEqual(result.retargeted, result.middle, `${name}: rapid changes must continue from the currently rendered palette`);
        assert.deepEqual(result.returned, result.before);
        assert.equal(result.middle.opacity, result.before.opacity); assert.equal(result.sameClock, true);
      }
      await palette('soft').click(); await page.waitForTimeout(460);
      const dots = await panel.evaluate(async root => {
        const nodes = [...root.querySelectorAll('.neon-color-dot')];
        const tick = () => new Promise(resolve => requestAnimationFrame(resolve));
        const colors = () => nodes.map(node => getComputedStyle(node).backgroundColor);
        const before = colors();
        root.querySelector('[data-palette="vivid"]').click();
        const blends = nodes.flatMap(node => node.getAnimations().filter(a => a.transitionProperty === '--neon-swatch'));
        blends.forEach(a => { a.pause(); a.currentTime = 0; }); await tick(); const initial = colors();
        blends.forEach(a => a.currentTime = a.effect.getTiming().duration / 2); await tick(); const middle = colors();
        blends.forEach(a => a.finish()); await tick();
        return { before, initial, middle, final: colors(), count: blends.length };
      });
      assert.equal(dots.count, 6); assert.deepEqual(dots.initial, dots.before);
      assert.ok(dots.middle.every((color, i) => color !== dots.before[i] && color !== dots.final[i]), 'The visible dot materials should blend with the border');
      await page.evaluate(() => document.documentElement.dataset.reducedMotion = 'true');
      await palette('soft').click();
      const durations = await frame.evaluate(node => node.getAnimations().filter(a => /^--neon-color-[1-6]$/.test(a.transitionProperty)).map(a => a.effect.getTiming().duration));
      assert.ok(durations.every(duration => duration <= 100), 'Reduce Motion should keep color changes brief');
      await page.evaluate(() => document.documentElement.dataset.reducedMotion = 'false');
      await reset();
    });

    await t.test('color dice keeps its vibe and tuning while dots animate and settle without layout shift', async () => {
      await setSlider('Spread', 9.5);
      for (const vibe of ['soft', 'vivid']) {
        await palette(vibe).click();
        const before = (await current()).profiles.light;
        const result = await page.evaluate(async panelSelector => {
          const panel = document.querySelector(panelSelector), dots = [...panel.querySelectorAll('.neon-color-dot')];
          const editor = panel.querySelector('.neon-custom-editor');
          const shape = () => dots.map(n => { const r = n.getBoundingClientRect(); return [r.x, r.y]; });
          const before = shape(), height = editor.getBoundingClientRect().height;
          panel.querySelector('[aria-label="Shuffle color selection"]').click();
          await new Promise(resolve => setTimeout(resolve, 100));
          const during = shape(), animations = dots.flatMap(n => n.getAnimations({subtree:true})).length;
          await new Promise(resolve => setTimeout(resolve, 1100));
          return { before, during, after: shape(), animations, height, afterHeight: editor.getBoundingClientRect().height };
        }, SETTINGS);
        const after = (await current()).profiles.light;
        assert.equal(after.palette, vibe); assert.equal(await palette(vibe).getAttribute('aria-pressed'), 'true');
        assert.notDeepEqual(after.colors, before.colors); assert.deepEqual(appearance(after), appearance(before));
        assert.equal(after.pattern, before.pattern); assert.ok(result.animations > 0);
        assert.notDeepEqual(result.during, result.before); assert.deepEqual(result.after, result.before);
        assert.equal(result.afterHeight, result.height);
      }
      await page.evaluate(() => {
        const button = document.querySelector('[aria-label="Shuffle color selection"]');
        for (let i = 0; i < 8; i++) button.click();
      });
      await page.waitForFunction(() => [...document.querySelectorAll('.neon-color-dot')].every(n => n.getAnimations({subtree:true}).length === 0));
      await page.evaluate(() => document.documentElement.dataset.reducedMotion = 'true');
      await colorDice().click();
      assert.equal(await panel.locator('.neon-color-dot').evaluateAll(nodes => nodes.flatMap(n => n.getAnimations({subtree:true})).length), 0);
      await page.evaluate(() => document.documentElement.dataset.reducedMotion = 'false');
      await save(); await page.reload(); await ready();
      assert.equal((await current()).profiles.light.palette, 'vivid'); assert.equal(await slider('Spread').inputValue(), '9.5');
      await reset();
    });

    await t.test('dot choreography stays inside its stage through every formation, rapid reshuffles and resize', async () => {
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1530 });
        await panel.locator('.neon-dot-stage').scrollIntoViewIfNeeded();
        const result = await panel.evaluate(async root => {
          const stage = root.querySelector('.neon-dot-stage'), dots = [...root.querySelectorAll('.neon-color-dot')];
          const dice = root.querySelector('[aria-label="Shuffle color selection"]');
          const actions = root.querySelector('.neon-color-actions'), editor = root.querySelector('.neon-custom-editor');
          const tick = () => new Promise(resolve => requestAnimationFrame(resolve));
          const failures = [], shapes = [], smileGaps = [], smileSpreads = [], motionSamples = [];
          const audit = label => {
            const box = stage.getBoundingClientRect(), rail = actions.getBoundingClientRect();
            dots.forEach((dot, i) => {
              const r = dot.getBoundingClientRect();
              if (r.left < box.left + 1 || r.right > box.right - 1 || r.top < box.top + 1 || r.bottom > box.bottom - 1) failures.push({label, i, issue:'outside stage'});
              if (r.left < rail.right && r.right > rail.left && r.top < rail.bottom && r.bottom > rail.top) failures.push({label, i, issue:'action overlap'});
            });
          };
          for (let click = 0; click < 9; click++) {
            dice.click(); shapes.push(root.querySelector('.neon-color-dots').dataset.constellation);
            const animations = dots.flatMap(dot => dot.getAnimations().filter(a => a.effect.getKeyframes().some(k => 'transform' in k)));
            animations.forEach(a => a.pause());
            const motion = [];
            for (let step = 0; step <= 16; step++) {
              animations.forEach(a => a.currentTime = a.effect.getTiming().duration * step / 16);
              await tick(); audit(`${click}:${step}`);
              const rects = dots.map(dot => dot.getBoundingClientRect());
              if (shapes.at(-1) === 'smile' && step === 8) {
                smileGaps.push(Math.min(...rects.slice(2).map(r => r.top)) - Math.max(...rects.slice(0,2).map(r => r.bottom)));
                const centers = rects.map(r => [r.x + r.width / 2, r.y + r.height / 2]);
                smileSpreads.push({ eyes: centers[1][0] - centers[0][0], mouth: Math.min(...centers.slice(2,5).map((c,i) => Math.hypot(c[0]-centers[i+3][0], c[1]-centers[i+3][1]))) });
              }
              if (step === 7 || step === 10) motion.push(rects.map(r => [r.x, r.y, r.width, r.height]));
            }
            if (shapes.at(-1) !== 'smile') motionSamples.push({ shape: shapes.at(-1), before: motion[0], after: motion[1] });
          }
          for (let click = 0; click < 8; click++) {
            dice.click();
            const animations = dots.flatMap(dot => dot.getAnimations().filter(a => a.effect.getKeyframes().some(k => 'transform' in k)));
            animations.forEach(a => { a.pause(); a.currentTime = a.effect.getTiming().duration * .24; });
            await tick(); audit(`rapid:${click}`);
          }
          const box = stage.getBoundingClientRect(), rail = actions.getBoundingClientRect(), card = editor.getBoundingClientRect();
          return {failures, shapes, smileGaps, smileSpreads, motionSamples, height: box.height, centerDelta: Math.abs((card.left + card.width / 2) - (rail.left + rail.width / 2)), belowStage: rail.top >= box.bottom};
        });
        assert.deepEqual(result.failures, []);
        assert.ok(result.height >= 128 && result.height <= 160, 'The stage should remain roomy and compact'); assert.ok(result.centerDelta < 2); assert.equal(result.belowStage, true);
        assert.ok(result.shapes.filter(name => name === 'smile').length >= 6);
        assert.ok(result.shapes.includes('orbit')); assert.ok(result.shapes.includes('flower')); assert.ok(result.shapes.includes('wave'));
        assert.ok(result.smileGaps.every(gap => gap >= 26), `Eye-to-mouth spacing: ${result.smileGaps}`);
        assert.ok(result.smileSpreads.every(s => s.eyes >= 56 && s.eyes <= 64 && s.mouth >= 55), `Smiley spacing: ${JSON.stringify(result.smileSpreads)}`);
        for (const motion of result.motionSamples) assert.ok(motion.before.some((point, i) => point.some((v, j) => Math.abs(v - motion.after[i][j]) > 1)), `${motion.shape} should move within its formation`);
        // Resize a partially assembled formation, including across the dot-size breakpoint.
        await page.setViewportSize({ width: width === 1440 ? 390 : 1440, height: 1530 });
        const afterResize = await panel.evaluate(async root => {
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const stage = root.querySelector('.neon-dot-stage').getBoundingClientRect();
          return [...root.querySelectorAll('.neon-color-dot')].every(dot => {
            const r = dot.getBoundingClientRect();
            return r.left >= stage.left && r.right <= stage.right && r.top >= stage.top && r.bottom <= stage.bottom && !dot.getAnimations().some(a => a.effect.getKeyframes().some(k => 'transform' in k));
          });
        });
        assert.equal(afterResize, true);
      }
      await page.setViewportSize({ width: 1440, height: 1530 });
      const containerResize = await panel.evaluate(async root => {
        const tick = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        root.style.width = '381px'; await tick();
        const stage = root.querySelector('.neon-dot-stage'), dots = [...root.querySelectorAll('.neon-color-dot')];
        const before = {stage: stage.clientWidth, dot: dots[0].offsetWidth};
        root.querySelector('[aria-label="Shuffle color selection"]').click();
        const forming = dot => dot.getAnimations().some(a => a.effect.getKeyframes().some(k => 'transform' in k));
        const started = dots.some(forming);
        root.style.width = '379px'; await tick();
        const after = {stage: stage.clientWidth, dot: dots[0].offsetWidth};
        const settled = dots.every(dot => !forming(dot) && getComputedStyle(dot).transform === 'none');
        root.style.removeProperty('width'); await tick();
        return { before, after, started, settled };
      });
      assert.equal(containerResize.started, true); assert.equal(containerResize.settled, true);
      assert.ok(containerResize.before.stage > 0 && containerResize.after.stage > 0);
      assert.notEqual(containerResize.before.dot, containerResize.after.dot);
      await reset();
    });

    await t.test('theme tabs change the actual appearance and native mode changes synchronize back', async () => {
      await setSlider('Thickness', 2.4);
      await tabTheme('dark');
      assert.equal(await slider('Thickness').inputValue(), '2.4');
      assert.equal((await current()).setup.complete, true);
      await setSlider('Thickness', 3.1);
      await tabTheme('light');
      assert.equal(await slider('Thickness').inputValue(), '2.4'); assert.equal(await computed('--neon-thickness'), '2.4px');
      await theme('dark');
      assert.equal(await page.getByRole('tab', { name: 'Dark', exact: true }).getAttribute('aria-selected'), 'true');
      assert.equal(await slider('Thickness').inputValue(), '3.1');
      await theme('light'); await reset();
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
      await page.waitForFunction(selector => document.querySelector(selector).dataset.editingTheme === 'dark', SETTINGS);
      await page.emulateMedia({ colorScheme: 'light' });
      await page.waitForFunction(selector => document.querySelector(selector).dataset.editingTheme === 'light', SETTINGS);
      await theme('light');
    });

    await t.test('editing Dark first copies to Light once then saves each appearance independently', async () => {
      await reset(); await tabTheme('dark'); await setSlider('Thickness', 2.8);
      assert.equal(await computed('--neon-thickness'), '2.8px');
      await tabTheme('light');
      assert.equal(await computed('--neon-thickness'), '2.8px'); assert.equal((await current()).setup.complete, true);
      await setSlider('Thickness', 1.7); assert.equal((await current()).profiles.dark.thickness, 2.8);
      await save(); await page.reload(); await ready();
      assert.equal((await current()).profiles.light.thickness, 1.7); assert.equal((await current()).profiles.dark.thickness, 2.8);
      await tabTheme('dark'); assert.equal(await computed('--neon-thickness'), '2.8px');
      await tabTheme('light'); await reset();
    });

    await t.test('native async setter callback commits persisted appearance and rejected writes leave mode unchanged', async () => {
      const nativePage = await context.newPage();
      try {
        await nativePage.addInitScript(() => {
          document.addEventListener('DOMContentLoaded', () => {
            const mode = localStorage.getItem('neon-test:native-appearance');
            if (mode === 'light' || mode === 'dark') document.documentElement.dataset.theme = mode;
          }, { once: true });
        });
        await nativePage.goto(`${origin}/preview/index.html`);
        await nativePage.getByRole('heading', { name: 'Glow', exact: true }).waitFor();
        await nativePage.evaluate(() => {
          window.__nativeCalls = [];
          window.__neonCodexRuntime.mountAppearance(document.querySelector('[data-neon-settings-slot]'), {
            setTheme: async mode => {
              window.__nativeCalls.push(mode);
              await new Promise(resolve => setTimeout(resolve, 60));
              localStorage.setItem('neon-test:native-appearance', mode);
              document.documentElement.dataset.theme = mode;
            },
          });
        });
        await nativePage.getByRole('tab', { name: 'Light', exact: true }).click();
        await nativePage.waitForFunction(() => localStorage.getItem('neon-test:native-appearance') === 'light');
        await nativePage.getByRole('tab', { name: 'Dark', exact: true }).click();
        await nativePage.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
        assert.deepEqual(await nativePage.evaluate(() => window.__nativeCalls), ['light', 'dark']);
        assert.equal(await nativePage.evaluate(() => localStorage.getItem('neon-test:native-appearance')), 'dark');
        await nativePage.reload();
        await nativePage.waitForFunction(selector => document.querySelector(selector)?.dataset.editingTheme === 'dark', SETTINGS);
        await nativePage.evaluate(() => {
          window.__rejectedCalls = [];
          window.__neonCodexRuntime.mountAppearance(document.querySelector('[data-neon-settings-slot]'), {
            setTheme: async mode => { window.__rejectedCalls.push(mode); throw new Error('Fixture refused appearance write'); },
          });
        });
        await nativePage.getByRole('tab', { name: 'Light', exact: true }).click();
        await nativePage.getByText('Appearance could not be changed. Try again.', { exact: true }).waitFor();
        assert.deepEqual(await nativePage.evaluate(() => window.__rejectedCalls), ['light']);
        assert.equal(await nativePage.evaluate(() => document.documentElement.dataset.theme), 'dark');
        assert.equal(await nativePage.getByRole('tab', { name: 'Dark', exact: true }).getAttribute('aria-selected'), 'true');
      } finally { await nativePage.close(); }
    });

    await t.test('native writes serialize and rapid requests finish with the latest theme', async () => {
      const nativePage = await context.newPage();
      try {
        await nativePage.goto(`${origin}/preview/index.html`);
        await nativePage.getByRole('heading', { name: 'Glow', exact: true }).waitFor();
        await nativePage.evaluate(() => {
          window.__nativeCalls = []; window.__nativeResolve = [];
          window.__neonCodexRuntime.mountAppearance(document.querySelector('[data-neon-settings-slot]'), {
            setTheme: mode => new Promise(resolve => {
              window.__nativeCalls.push(mode);
              window.__nativeResolve.push(() => { document.documentElement.dataset.theme = mode; resolve(); });
            }),
          });
          const tabs = [...document.querySelectorAll('[role=tab]')];
          tabs.find(b => b.textContent === 'Light').click();
          tabs.find(b => b.textContent === 'Dark').click();
          tabs.find(b => b.textContent === 'Light').click();
          tabs.find(b => b.textContent === 'Dark').click();
        });
        assert.deepEqual(await nativePage.evaluate(() => window.__nativeCalls), ['light']);
        await nativePage.evaluate(() => window.__nativeResolve[0]());
        await nativePage.waitForFunction(() => window.__nativeCalls.length === 2);
        assert.deepEqual(await nativePage.evaluate(() => window.__nativeCalls), ['light', 'dark']);
        await nativePage.evaluate(() => window.__nativeResolve[1]());
        await nativePage.waitForFunction(selector => document.querySelector(selector).dataset.theme === 'dark', FRAME);
        assert.equal(await nativePage.getByRole('tab', { name: 'Dark', exact: true }).getAttribute('aria-selected'), 'true');
      } finally { await nativePage.close(); }
    });

    await t.test('keyboard editing persists and animation speed preserves phase', async () => {
      await slider('Thickness').focus(); await slider('Thickness').press('End');
      await save(); await page.reload(); await ready();
      assert.equal(await computed('--neon-thickness'), '6px');
      await slider('Animation Speed').focus(); await slider('Animation Speed').press('End');
      assert.equal(await computed('--neon-duration'), '6s');
      await slider('Animation Speed').press('Home'); assert.equal(await computed('--neon-duration'), '144s');
      const phase = await page.evaluate(selector => {
        const frame = document.querySelector(selector), animation = frame.getAnimations().find(a => a.animationName === 'neon-glow-orbit');
        animation.currentTime = 47_123; const before = animation.effect.getComputedTiming().progress;
        const input = document.querySelector('input[id$="-speed"]'); input.value = '3'; input.dispatchEvent(new Event('input', { bubbles: true }));
        return { before, after: animation.effect.getComputedTiming().progress, same: frame.getAnimations().includes(animation), time: animation.currentTime };
      }, FRAME);
      assert.ok(Math.abs(phase.before - phase.after) < .003); assert.equal(phase.same, true); assert.ok(phase.time >= 0);
      await reset();
    });

    await t.test('animation and vibe choices preserve all characteristic tuning', async () => {
      for (const [label, value] of [['Thickness', 2.7], ['Spread', 13], ['Intensity', .83], ['Saturation', 1.27], ['Gloss', .62], ['Animation Speed', 2.2]]) await setSlider(label, value);
      const initial = (await current()).profiles.light;
      for (const name of ['prism', 'pulse', 'signal']) {
        await pattern(name).click(); const p = (await current()).profiles.light;
        assert.equal(p.pattern, name); assert.deepEqual(p.colors, initial.colors); assert.deepEqual(appearance(p), appearance(initial));
        assert.equal(await frame.getAttribute('data-pattern'), name);
        assert.notEqual(await frame.locator('.neon-glow-color').evaluate(e => getComputedStyle(e).backgroundImage), 'none');
      }
      for (const name of ['soft', 'vivid']) {
        await palette(name).click(); const p = (await current()).profiles.light;
        assert.equal(p.pattern, 'signal'); assert.equal(p.palette, name); assert.deepEqual(appearance(p), appearance(initial));
      }
      await save(); await page.reload(); await ready();
      assert.equal((await current()).profiles.light.palette, 'vivid'); assert.equal(await slider('Thickness').inputValue(), '2.7');
      await reset();
    });

    await t.test('dots remain purely visual and hue stays neutral through single-color, shuffle and reload', async () => {
      await palette('soft').click();
      const before = (await current()).profiles.light;
      const dots = panel.locator('.neon-color-dot');
      assert.equal(await dots.count(), 6);
      assert.equal(await panel.locator('.neon-color-dots button,.neon-color-dots [tabindex],.neon-color-dots [aria-pressed]').count(), 0);
      assert.deepEqual(await dots.evaluateAll(nodes => nodes.map(n => [n.tagName, n.getAttribute('aria-hidden'), n.title])), Array(6).fill(['SPAN', 'true', '']));
      async function clickEveryDotWithoutChange() {
        const prefs = await current();
        for (let i = 0; i < 6; i++) await dots.nth(i).click({ force: true });
        assert.deepEqual(await current(), prefs);
      }
      await clickEveryDotWithoutChange();
      await solo().click();
      assert.equal(await solo().getAttribute('aria-pressed'), 'true');
      let p = (await current()).profiles.light;
      assert.equal(p.solo, true); assert.equal(p.hue, 0);
      assert.equal(await computed('--neon-hue'), '0deg');
      assert.deepEqual(p.colors, before.colors);
      const allSameColor = async color => {
        await page.waitForFunction(([selector, expected]) => [...document.querySelectorAll(`${selector} .neon-color-dot`)].every(dot =>
          dot.style.getPropertyValue('--neon-swatch') === expected && Number(getComputedStyle(dot).opacity) === 1), [SETTINGS, color]);
      };
      await allSameColor(p.colors[p.soloIndex]); await clickEveryDotWithoutChange();
      const soloBeforeShuffle = p;
      await colorDice().click(); p = (await current()).profiles.light;
      assert.equal(p.solo, true); assert.equal(p.palette, 'soft'); await allSameColor(p.colors[p.soloIndex]);
      assert.deepEqual(appearance(p), appearance(soloBeforeShuffle));
      assert.equal(await computed('--neon-hue'), '0deg');
      await save(); await page.reload(); await ready();
      assert.equal(await solo().getAttribute('aria-pressed'), 'true');
      assert.equal((await current()).profiles.light.hue, 0);
      await allSameColor((await current()).profiles.light.colors[(await current()).profiles.light.soloIndex]);
      await solo().click();
      assert.equal((await current()).profiles.light.hue, 0); await clickEveryDotWithoutChange();
      await save(); await page.reload(); await ready();
      assert.equal((await current()).profiles.light.hue, 0);
      await reset();
    });

    await t.test('saved hue rotations are neutralized for both profiles through every color control and native mode change', async () => {
      await save();
      await page.evaluate(key => {
        const stale = window.__neonCodexRuntime.getPreferences();
        stale.setup = { source: 'light', complete: true };
        stale.profiles.light.hue = 263; stale.profiles.light.solo = false;
        stale.profiles.dark.hue = 155; stale.profiles.dark.solo = true;
        localStorage.setItem(key, JSON.stringify(stale));
      }, KEY);
      await page.reload(); await ready(); await assertNeutralHue();
      for (const mode of ['light', 'dark']) {
        await theme(mode); await assertNeutralHue();
        for (const vibe of ['soft', 'vivid']) {
          await palette(vibe).click(); await assertNeutralHue();
          await colorDice().click(); await assertNeutralHue();
          await solo().click(); await assertNeutralHue();
          await paletteBrowser().click();
          const colors = slider('Color selection');
          await colors.press('End'); await assertNeutralHue();
          await solo().click(); await assertNeutralHue();
          await colors.press('Home'); await assertNeutralHue();
          await paletteBrowser().click();
        }
        await save();
        const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
        assert.equal(stored.profiles.light.hue, 0); assert.equal(stored.profiles.dark.hue, 0);
      }
      await tabTheme('light'); await assertNeutralHue();
      await tabTheme('dark'); await assertNeutralHue();
      await save(); await page.reload(); await ready(); await assertNeutralHue();
      await theme('light'); await reset();
    });

    await t.test('Appearance mounts synchronously and route gaps retain the same visible border', async () => {
      await page.waitForFunction(selector => Number(getComputedStyle(document.querySelector(selector)).opacity) > .64, FRAME);
      const result = await page.evaluate(async ([frameSelector, panelSelector]) => {
        const frame = document.querySelector(frameSelector), runtime = window.__neonCodexRuntime;
        const oldPanel = document.querySelector(panelSelector);
        const oldSlot = oldPanel.parentElement, newSlot = oldSlot.cloneNode(false);
        oldSlot.replaceWith(newSlot);
        runtime.mountAppearance(newSlot);
        const synchronous = newSlot.querySelector(panelSelector) === oldPanel;
        const animation = frame.getAnimations().find(a => a.animationName === 'neon-glow-orbit');
        const before = animation.currentTime;
        const shell = document.querySelector('[data-app-shell-frame]');
        const parent = shell.parentElement, sibling = shell.nextSibling;
        const samples = [];
        const capture = () => samples.push({ connected: frame.isConnected, opacity: +getComputedStyle(frame).opacity,
          visibility: getComputedStyle(frame).visibility, count: document.querySelectorAll(frameSelector).length });
        shell.remove();
        for (let i = 0; i < 4; i++) await new Promise(resolve => requestAnimationFrame(() => { capture(); resolve(); }));
        parent.insertBefore(shell, sibling);
        shell.dataset.appShellPageSurface = 'false';
        for (let i = 0; i < 2; i++) await new Promise(resolve => requestAnimationFrame(() => { capture(); resolve(); }));
        shell.dataset.appShellPageSurface = 'true';
        await new Promise(resolve => requestAnimationFrame(() => { capture(); resolve(); }));
        return { synchronous, samples, sameNode: document.querySelector(frameSelector) === frame,
          sameAnimation: frame.getAnimations().includes(animation), elapsed: animation.currentTime - before };
      }, [FRAME, SETTINGS]);
      assert.equal(result.synchronous, true);
      assert.ok(result.samples.every(s => s.connected && s.opacity > .6 && s.visibility === 'visible' && s.count === 1));
      assert.equal(result.sameNode, true); assert.equal(result.sameAnimation, true); assert.ok(result.elapsed > 0);
    });

    await t.test('toggle dissolves both ways and reverses mid-fade without restarting animation', async () => {
      const result = await page.evaluate(async selector => {
        const frame = document.querySelector(selector);
        const input = document.querySelector('[role="switch"]');
        const samples = [];
        const sample = () => ({ opacity: +getComputedStyle(frame).opacity, display: getComputedStyle(frame).display });
        const collect = duration => new Promise(resolve => {
          const start = performance.now();
          function tick(now) { samples.push(sample()); if (now - start < duration) requestAnimationFrame(tick); else resolve(); }
          requestAnimationFrame(tick);
        });
        const animation = frame.getAnimations().find(a => a.animationName === 'neon-glow-orbit');
        const initialTime = animation.currentTime;
        input.click(); await collect(780); const off = sample().opacity;
        input.click(); await collect(780); const on = sample().opacity;
        input.click(); await collect(140); const turning = sample().opacity;
        input.click(); const reversal = sample().opacity; await collect(780);
        return { samples, off, on, turning, reversal, final: sample().opacity,
          sameAnimation: frame.getAnimations().includes(animation), elapsed: animation.currentTime - initialTime };
      }, FRAME);
      assert.equal(result.off, 0); assert.ok(result.on > .64);
      assert.ok(result.samples.some(s => s.opacity > .05 && s.opacity < .65));
      assert.ok(result.samples.every(s => s.display !== 'none'));
      assert.ok(Math.abs(result.turning - result.reversal) < .04);
      assert.ok(result.final > .64); assert.equal(result.sameAnimation, true); assert.ok(result.elapsed > 1500);
    });

    await t.test('Pulse breathes without rotating its colors or interrupting frame intensity', async () => {
      await reset(); await theme('light'); await pattern('pulse').click();
      const result = await frame.evaluate(async element => {
        const animation = element.getAnimations().find(a => a.animationName === 'neon-glow-orbit');
        animation.pause();
        const duration = animation.effect.getComputedTiming().duration;
        const edge = element.querySelector('.neon-glow-edge'), blur = element.querySelector('.neon-glow-blur');
        const samples = [];
        for (const fraction of [0, .25, .5, 1]) {
          animation.currentTime = duration * fraction;
          await new Promise(resolve => requestAnimationFrame(resolve));
          const e = getComputedStyle(edge), b = getComputedStyle(blur);
          samples.push({ edge: Number(e.opacity), frame: Number(getComputedStyle(element).opacity), background: e.backgroundImage, filter: b.filter });
        }
        animation.play(); return samples;
      });
      assert.ok(Math.abs(result[0].edge - .46) < .001); assert.ok(Math.abs(result[1].edge - 1) < .001);
      assert.ok(Math.abs(result[2].edge - .46) < .001); assert.deepEqual(result[0], result[3]);
      for (const sample of result) { assert.equal(sample.background, result[0].background); assert.ok(Math.abs(sample.frame - .65) < .001); }
      assert.notEqual(result[0].filter, result[1].filter);
    });

    await t.test('all patterns move, retain clean maximum-spread corners, and respect Reduce Motion', async () => {
      await theme('dark');
      await setSlider('Thickness', 6); await setSlider('Spread', 24);
      await setSlider('Intensity', 1); await setSlider('Saturation', 1.4); await setSlider('Animation Speed', 2);
      await page.getByRole('button', { name: 'Show workspace', exact: true }).click();
      for (const name of ['prism', 'pulse', 'signal']) {
        await page.getByRole('button', { name: 'Show Appearance settings' }).click();
        await pattern(name).click();
        await page.getByRole('button', { name: 'Show workspace', exact: true }).click();
        const before = await computed('--neon-phase');
        await page.waitForFunction(([selector, previous]) => getComputedStyle(document.querySelector(selector)).getPropertyValue('--neon-phase').trim() !== previous, [FRAME, before]);
        await page.screenshot({ path: path.join(QA, `pattern-${name}-dark.png`), fullPage: true });
      }
      const geometry = await frame.evaluate(element => {
        const style = getComputedStyle(element), row = document.querySelector('[data-app-shell-workspace-row]').getBoundingClientRect(), r = element.getBoundingClientRect();
        return { bottom: row.bottom - r.bottom, right: row.right - r.right, radius: style.borderRadius, overflow: style.overflow };
      });
      assert.deepEqual(geometry, { bottom: 0, right: 0, radius: '12px', overflow: 'hidden' });
      await page.locator('#reduce-motion').click();
      await page.waitForFunction(selector => getComputedStyle(document.querySelector(selector)).animationName === 'none', FRAME);
      assert.ok(parseFloat(await computed('transition-duration')) < .15);
      await page.locator('#reduce-motion').click();
      await page.waitForFunction(selector => getComputedStyle(document.querySelector(selector)).animationName === 'neon-glow-orbit', FRAME);
      await page.getByRole('button', { name: 'Show Appearance settings' }).click();
      await reset(); await theme('light');
    });

    await t.test('typing, dialogs, route remounts, and frame repair remain intact', async () => {
      await page.getByRole('button', { name: 'Show workspace', exact: true }).click();
      await page.getByLabel('Try typing through the glow').fill('The glow leaves the workspace usable.');
      assert.equal(await page.getByLabel('Try typing through the glow').inputValue(), 'The glow leaves the workspace usable.');
      await page.getByRole('button', { name: 'Test dialog' }).click();
      assert.equal(await page.getByRole('dialog').isVisible(), true);
      await page.getByRole('button', { name: 'Done', exact: true }).click();
      assert.equal(await page.getByRole('dialog').isVisible(), false);
      await page.getByRole('button', { name: 'Show Appearance settings' }).click();
      await frame.evaluate(node => node.remove());
      await page.waitForFunction(selector => document.querySelectorAll(selector).length === 1, FRAME);
      await panel.evaluate(node => node.remove()); await ready();
      await page.locator('[data-neon-settings-slot]').evaluate(slot => slot.replaceWith(slot.cloneNode(false))); await ready();
      assert.equal(await panel.count(), 1);
      await page.locator('[data-app-shell-frame]').evaluate(node => node.dataset.appShellPageSurface = 'false');
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await frame.count(), 1);
      assert.equal(await computed('visibility'), 'visible');
      await page.locator('[data-app-shell-frame]').evaluate(node => node.dataset.appShellPageSurface = 'true');
      await page.waitForFunction(selector => document.querySelectorAll(selector).length === 1, FRAME);
    });

    await t.test('upgrades existing 0.4 preferences without resetting the favorite Prism look', async () => {
      await save();
      await page.evaluate(key => {
        const old = { version: 1, enabled: true, profiles: {
          light: { thickness: 2.2, spread: 11, intensity: .8, saturation: 1.1, hue: 28, depth: .33, gloss: .51, duration: 6,
            pattern: 'prism', palette: 'custom', colors: ['#ff2233', '#dd44bb', '#3355cc', '#22ccbb', '#aadd22', '#ffaa33'], paused: true, reverse: true },
          dark: { thickness: 1.8, duration: 44, pattern: 'aurora' }
        } };
        localStorage.setItem(key, JSON.stringify(old));
      }, KEY);
      await page.reload(); await ready();
      const p = (await current()).profiles.light;
      assert.equal(p.thickness, 2.2); assert.equal(p.pattern, 'prism'); assert.equal(p.speed, 6);
      assert.equal(p.gloss, .51); assert.equal(p.colors[0], '#ff2233');
      await assertNeutralHue();
      await theme('dark'); await assertNeutralHue(); await theme('light');
      assert.equal(await computed('animation-play-state'), 'running');
      assert.equal(await computed('animation-direction'), 'normal');
      assert.equal(await slider('Animation Speed').inputValue(), '6');
      await reset(); await save();
    });

    await t.test('remote updates preserve a local slider edit waiting to save', async () => {
      await save();
      await page.evaluate(key => {
        const remote = window.__neonCodexRuntime.getPreferences();
        const input = [...document.querySelectorAll('input[type="range"]')].find(i => i.id.endsWith('-intensity'));
        input.value = '.31'; input.dispatchEvent(new Event('input', { bubbles: true }));
        remote.profiles.dark.gloss = .67;
        const value = JSON.stringify(remote);
        localStorage.setItem(key, value);
        window.dispatchEvent(new StorageEvent('storage', { key, newValue: value, storageArea: localStorage }));
      }, KEY);
      await save();
      const saved = await current();
      assert.equal(saved.profiles.light.intensity, .31);
      assert.equal(saved.profiles.dark.gloss, .67);
    });

    await t.test('native surface geometry follows shell zoom and ignores utility surfaces', async () => {
      const geometryPage = await context.newPage();
      try {
        await geometryPage.goto(`${origin}/preview/index.html`);
        await geometryPage.evaluate(() => window.__neonCodexRuntime?.destroy());
        const css = await readFile(path.join(ROOT, 'src/glow.css'), 'utf8');
        await geometryPage.setContent(`<html data-codex-window-type="electron"><head><style>${css}body{margin:0}</style></head><body></body></html>`);
        const result = await geometryPage.evaluate(async () => {
          const { createGlowLayer } = await import('/src/glow-layer.js');
          const makeOverlay = () => {
            const node = document.createElement('div'); node.dataset.neonCodexFrame = '';
            node.innerHTML = '<div class="neon-glow-blur"><div class="neon-glow-color"></div></div><div class="neon-glow-edge"></div><div class="neon-glow-depth"></div>';
            return node;
          };
          const options = { makeOverlay, applyOverlay(node) { node.dataset.pattern = 'prism'; node.dataset.enabled = 'true'; }, getTheme: () => 'light' };
          const layer = createGlowLayer(window, options), emptyUtility = layer.getFrame() === null;
          const shell = document.createElement('div');
          shell.dataset.appShellFrame = ''; shell.dataset.appShellPageSurface = 'true';
          // Matches the reviewed native scope: zoom belongs to the shell, not body.
          shell.style.cssText = 'position:absolute;left:32px;top:40px;width:640px;height:400px;zoom:1.25';
          shell.innerHTML = '<div data-app-shell-workspace-row style="position:relative;width:100%;height:100%"><div class="_PageSurface_yl8z4_2" style="position:absolute;inset:44px 0 0 48px;border-radius:16px"></div></div>';
          document.body.append(shell); layer.reconcile();
          const frame = layer.getFrame(), surface = shell.querySelector('._PageSurface_yl8z4_2');
          const rect = node => { const r = node.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; };
          const expected = rect(surface), actual = rect(frame), radius = getComputedStyle(frame).borderTopLeftRadius;
          const animation = frame.getAnimations().find(a => a.animationName === 'neon-glow-orbit');
          const twoFrames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          await twoFrames(); const before = animation.currentTime;
          shell.remove(); layer.reconcile(); await twoFrames();
          const gap = { same: layer.getFrame() === frame, animation: frame.getAnimations().includes(animation),
            bounds: rect(frame), visibility: getComputedStyle(frame).visibility, elapsed: animation.currentTime - before };
          document.body.append(shell); layer.reconcile();
          document.documentElement.dataset.codexWindowType = 'browser'; layer.reconcile();
          const browserHidden = getComputedStyle(frame).visibility === 'hidden';
          layer.destroy(); shell.remove();
          document.documentElement.dataset.codexWindowType = 'electron';
          const dialog = document.createElement('div'); dialog.setAttribute('role', 'dialog'); dialog.append(shell); document.body.append(dialog);
          const utility = createGlowLayer(window, options), dialogIgnored = utility.getFrame() === null;
          utility.destroy(); dialog.remove();
          return { expected, actual, radius, gap, emptyUtility, browserHidden, dialogIgnored,
            remaining: document.querySelectorAll('[data-neon-global="true"]').length };
        });
        assert.deepEqual(result.actual, result.expected);
        assert.equal(result.radius, '20px');
        assert.deepEqual(result.gap.bounds, result.expected);
        assert.ok(result.gap.same && result.gap.animation && result.gap.elapsed > 0);
        assert.equal(result.gap.visibility, 'visible');
        assert.ok(result.emptyUtility && result.browserHidden && result.dialogIgnored);
        assert.equal(result.remaining, 0);
      } finally { await geometryPage.close(); }
    });

    await t.test('cross-window preferences and storage reset synchronize; narrow cards fit', async () => {
      const second = await context.newPage(); await second.goto(`${origin}/preview/index.html`);
      await second.getByRole('heading', { name: 'Glow', exact: true }).waitFor();
      await second.getByRole('switch', { name: 'Glow', exact: true }).uncheck();
      await page.waitForFunction(selector => document.querySelector(selector).dataset.enabled === 'false', FRAME);
      await second.getByRole('switch', { name: 'Glow', exact: true }).check();
      await page.waitForFunction(selector => document.querySelector(selector).dataset.enabled === 'true', FRAME);
      await second.evaluate(() => localStorage.clear());
      await page.waitForFunction(() => window.__neonCodexRuntime.getPreferences().profiles.light.intensity === .65);
      assert.equal((await current()).profiles.dark.gloss, 1);
      await second.close();
      await page.setViewportSize({ width: 390, height: 844 }); await theme('dark');
      await page.screenshot({ path: path.join(QA, 'appearance-narrow.png'), fullPage: true, animations: 'disabled' });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await panel.evaluate(node => node.scrollWidth <= node.clientWidth), true);
      await slider('Animation Speed').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(QA, 'appearance-narrow-controls.png'), fullPage: true, animations: 'disabled' });
    });
    assert.deepEqual(errors, []);
    await context.close();
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
