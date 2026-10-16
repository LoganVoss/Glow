import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// Isolated public fixture only. No running application, private account or
// Keychain data is used; native module startup is covered separately.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BORDER = '[data-neon-global="true"]';
const HOME = '[data-neon-settings-home]';
const nextPaint = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const snapshot = page => page.evaluate(() => {
  const shell = document.querySelector('[data-app-shell-frame]');
  const surface = document.querySelector('.page-surface').getBoundingClientRect();
  const main = document.querySelector('.main').getBoundingClientRect();
  const rect = document.querySelector('#profile-settings').getBoundingClientRect();
  const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
  return { open: window.__neonPreviewSidebar.open, surfaceX: surface.x, surfaceWidth: surface.width,
    mainX: main.x, mainWidth: main.width, shellX: shell.getBoundingClientRect().x,
    profileHit: Boolean(hit?.closest('#profile-settings')), profileX: rect.x,
    homeCount: document.querySelectorAll('[data-neon-settings-home]').length,
    route: shell.dataset.previewRoute };
});

test('existing titlebar command cycles native chats, hidden icon rail, then normal layout', { timeout: 90_000 }, async t => {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      assert.match(url.pathname, /^\/(src|preview)\/[a-z0-9.-]+$/i);
      let bytes = await readFile(path.join(ROOT, url.pathname));
      if (url.pathname === '/preview/index.html' && url.searchParams.get('utility') === 'true') {
        bytes = Buffer.from(bytes.toString().replace('data-codex-window-type="electron"', 'data-codex-window-type="utility"'));
      }
      if (url.pathname === '/preview/index.html' && url.searchParams.get('surface') === 'legacy') {
        bytes = Buffer.from(bytes.toString().replace('_PageSurface_etoz9_2', '_PageSurface_yl8z4_2'));
      }
      response.writeHead(200, { 'Content-Type': url.pathname.endsWith('.html') ? 'text/html' : url.pathname.endsWith('.js') ? 'text/javascript' : 'text/css' });
      response.end(bytes);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  let browser;
  try {
    browser = await chromium.launch({ headless: true, chromiumSandbox: true,
      executablePath: process.env.NEON_TEST_BROWSER || (existsSync(chrome) ? chrome : undefined) });
    async function fixture({ utility = false, legacySurface = false, ...options } = {}) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ...options });
      await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      const page = await context.newPage(), errors = [];
      page.setDefaultTimeout(4_000);
      page.on('pageerror', error => errors.push(error.message));
      const query = new URLSearchParams({ utility: String(utility), surface: legacySurface ? 'legacy' : 'latest' });
      await page.goto(`${origin}/preview/index.html?${query}`);
      await page.waitForFunction(() => typeof window.__neonCodexRuntime?.cycleSidebar === 'function' && window.__neonPreviewSidebar);
      await page.getByRole('button', { name: 'Show workspace', exact: true }).click();
      await nextPaint(page);
      return { page, context, async close() { assert.deepEqual(errors, [], 'No renderer exceptions'); await context.close(); } };
    }
    const toggle = page => page.locator('#toggle-sidebar').click();
    const settle = page => page.waitForTimeout(600);
    async function hideRail(page) { await toggle(page); await toggle(page); await settle(page); }

    await t.test('first click preserves native behavior, second expands chats across the rail, third restores normal', async () => {
      const f = await fixture(), { page } = f;
      const initial = await snapshot(page);
      assert.equal(initial.open, true); assert.equal(initial.profileHit, true);
      await toggle(page); await settle(page);
      const first = await snapshot(page);
      assert.equal(first.open, false); assert.equal(first.surfaceX, initial.surfaceX);
      assert.ok(first.mainWidth > initial.mainWidth + 200, 'The first click hides only the native chat list');
      await toggle(page); await settle(page);
      const second = await snapshot(page);
      assert.equal(second.open, true, 'Chat list reopens as icon rail folds away');
      assert.ok(second.surfaceX < initial.surfaceX - 40, 'Glow surface gains the rail width');
      assert.ok(second.mainWidth > initial.mainWidth + 40 && second.mainWidth < first.mainWidth,
        'Chat list remains visible while the main view gains rail space');
      assert.equal(second.profileHit, true, 'Native account control remains clickable');
      await toggle(page); await settle(page);
      const third = await snapshot(page);
      assert.equal(third.open, true); assert.equal(third.surfaceX, initial.surfaceX); assert.equal(third.mainWidth, initial.mainWidth);
      assert.equal(third.profileHit, true); assert.equal(third.homeCount, 0);
      assert.equal(await page.getByRole('button', { name: 'Toggle Sidebar', exact: true }).count(), 1,
        'Use the original control without adding a duplicate');
      assert.equal(await page.locator('#toggle-sidebar').getAttribute('aria-pressed'), null,
        'Do not add an activated box state to the native control');
      await f.close();
    });

    await t.test('the expanded layout has its own titlebar icon without replacing the native toggle', async () => {
      const f = await fixture(), { page } = f;
      await page.evaluate(() => {
        window.__nativeSidebarButton = document.querySelector('#toggle-sidebar');
        window.__nativeSidebarSVG = window.__nativeSidebarButton.querySelector('svg');
      });
      const iconState = () => page.locator('#toggle-sidebar').evaluate(button => {
        const after = getComputedStyle(button, '::after');
        return { layout: button.dataset.neonSidebarLayout, content: after.content, mask: after.maskImage,
          nativeVisibility: getComputedStyle(button.querySelector('svg')).visibility,
          label: button.getAttribute('aria-label'), description: button.getAttribute('aria-description'),
          pressed: button.getAttribute('aria-pressed'), sameButton: button === window.__nativeSidebarButton,
          sameSVG: button.querySelector('svg') === window.__nativeSidebarSVG };
      });
      const initial = await iconState();
      assert.notEqual(initial.layout, 'expanded'); assert.equal(initial.nativeVisibility, 'visible');
      await toggle(page); await settle(page);
      const nativeCollapsed = await iconState();
      assert.notEqual(nativeCollapsed.layout, 'expanded'); assert.equal(nativeCollapsed.nativeVisibility, 'visible');
      await toggle(page); await settle(page);
      const expanded = await iconState();
      assert.equal(expanded.layout, 'expanded'); assert.notEqual(expanded.content, 'none'); assert.notEqual(expanded.mask, 'none');
      assert.equal(expanded.nativeVisibility, 'hidden'); assert.equal(expanded.description, 'Sidebar icons hidden');
      assert.equal(expanded.label, 'Toggle Sidebar'); assert.equal(expanded.pressed, null);
      assert.equal(expanded.sameButton, true); assert.equal(expanded.sameSVG, true);
      await toggle(page); await settle(page);
      const restored = await iconState();
      assert.notEqual(restored.layout, 'expanded'); assert.equal(restored.nativeVisibility, 'visible');
      assert.equal(restored.description, initial.description); assert.equal(restored.label, initial.label);
      assert.equal(restored.sameButton, true); assert.equal(restored.sameSVG, true);
      assert.equal((await snapshot(page)).open, true, 'The original native command still completes the cycle');
      await f.close();
    });

    await t.test('keeps the exact native profile and native Home action across Settings navigation', async () => {
      const f = await fixture(), { page } = f;
      await page.evaluate(() => { window.__originalProfile = document.querySelector('#profile-settings'); window.__homeCalls = 0;
        document.querySelector('#native-home').addEventListener('click', () => window.__homeCalls++); });
      await hideRail(page);
      const hidden = await snapshot(page);
      await page.locator('#profile-settings').click();
      await page.locator(HOME).waitFor(); await settle(page);
      const settings = await snapshot(page);
      assert.equal(settings.route, 'settings'); assert.equal(settings.surfaceX, hidden.surfaceX);
      assert.equal(settings.open, true); assert.equal(settings.homeCount, 1);
      assert.equal(await page.evaluate(() => document.querySelector('#profile-settings') === window.__originalProfile), true,
        'Never clone or replace the account button and its native handler');
      await page.locator(HOME).click(); await settle(page);
      assert.equal((await snapshot(page)).route, 'home'); assert.equal((await snapshot(page)).surfaceX, hidden.surfaceX);
      assert.equal(await page.evaluate(() => window.__homeCalls), 1, 'Settings Home invokes the existing native Home destination');
      assert.equal(await page.locator(HOME).count(), 0);
      await f.close();
    });

    await t.test('Settings Home never flashes a newly rendered native destination group while the rail is hidden', async () => {
      const f = await fixture(), { page } = f;
      await hideRail(page);
      const hidden = await snapshot(page);
      await page.locator('#profile-settings').click(); await page.locator(HOME).waitFor(); await settle(page);
      const frames = await page.evaluate(async () => {
        const originalProfile = document.querySelector('#profile-settings');
        const nativeHome = document.querySelector('#native-home');
        const destinations = nativeHome.closest('[data-neon-rail-icons]');
        const replacement = destinations.cloneNode(true);
        for (const node of [replacement, ...replacement.querySelectorAll('*')]) {
          for (const attribute of [...node.attributes]) {
            if (attribute.name.startsWith('data-neon-') || ['inert', 'aria-hidden'].includes(attribute.name)) node.removeAttribute(attribute.name);
          }
          for (const property of [...node.style]) if (property.startsWith('--neon-')) node.style.removeProperty(property);
        }
        // Native navigation can replace its destination wrapper during the
        // guarded Home action. The new nodes have no Glow decorations yet.
        nativeHome.addEventListener('click', () => destinations.replaceWith(replacement), { once: true });
        const values = [];
        function sample() {
          const shell = document.querySelector('[data-app-shell-frame]');
          const style = getComputedStyle(replacement), surface = document.querySelector('.page-surface').getBoundingClientRect();
          const profile = document.querySelector('#profile-settings'), rect = profile.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          values.push({ opacity: Number(style.opacity), visibility: style.visibility,
            hidden: shell.dataset.neonSidebarHidden, surfaceX: surface.x, width: surface.width,
            sameProfile: profile === originalProfile, profileHit: Boolean(hit?.closest('#profile-settings')) });
        }
        document.querySelector('[data-neon-settings-home]').click();
        sample(); // Force style resolution before MutationObserver delivery.
        const start = performance.now();
        await new Promise(resolve => {
          const frame = now => setTimeout(() => {
            sample();
            if (now - start < 480) requestAnimationFrame(frame); else resolve();
          }, 0);
          requestAnimationFrame(frame);
        });
        return values;
      });
      assert.ok(frames.length > 10, 'Inspect the immediate route frame and the complete settling interval');
      for (const frame of frames) {
        assert.equal(frame.opacity, 0, `New native navigation must already be invisible: ${JSON.stringify(frame)}`);
        assert.equal(frame.visibility, 'hidden'); assert.equal(frame.hidden, 'true');
        assert.ok(Math.abs(frame.surfaceX - hidden.surfaceX) < .1);
        assert.ok(Math.abs(frame.width - hidden.surfaceWidth) < .1);
        assert.equal(frame.sameProfile, true); assert.equal(frame.profileHit, true);
      }
      assert.equal((await snapshot(page)).route, 'home'); assert.equal(await page.locator(HOME).count(), 0);
      await f.close();
    });

    await t.test('a remounted native shell starts hidden without an expanded intermediate frame', async () => {
      const f = await fixture(), { page } = f;
      await page.evaluate(() => {
        // Keep a native-shaped replacement free of all decorations so this
        // cannot pass by accidentally cloning the old hidden-layout markers.
        const replacement = document.querySelector('[data-app-shell-frame]').cloneNode(true);
        for (const node of replacement.querySelectorAll('[data-neon-settings-root],[data-neon-settings-home]')) node.remove();
        for (const node of [replacement, ...replacement.querySelectorAll('*')]) {
          for (const attribute of [...node.attributes]) if (attribute.name.startsWith('data-neon-')) node.removeAttribute(attribute.name);
          for (const property of [...node.style]) if (property.startsWith('--neon-')) node.style.removeProperty(property);
        }
        window.__replacementShell = replacement;
      });
      await hideRail(page);
      const hidden = await snapshot(page);
      const result = await page.evaluate(async selector => {
        const original = document.querySelector('[data-app-shell-frame]');
        const border = document.querySelector(selector), marker = document.createComment('native route gap');
        original.replaceWith(marker);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const gap = { readyRemoved: !original.hasAttribute('data-neon-sidebar-ready'),
          sameBorder: border === document.querySelector(selector), visible: getComputedStyle(border).visibility };
        marker.replaceWith(window.__replacementShell);
        const frames = [], start = performance.now();
        await new Promise(resolve => {
          const sample = now => setTimeout(() => {
            const shell = document.querySelector('[data-app-shell-frame]');
            const surface = shell.querySelector('.page-surface').getBoundingClientRect();
            const frame = border.getBoundingClientRect();
            frames.push({ hidden: shell.dataset.neonSidebarHidden, moving: shell.hasAttribute('data-neon-sidebar-moving'),
              surfaceX: surface.x, surfaceWidth: surface.width,
              borderX: frame.x, borderWidth: frame.width, sameBorder: border === document.querySelector(selector) });
            if (now - start < 520) requestAnimationFrame(sample); else resolve();
          }, 0);
          requestAnimationFrame(sample);
        });
        return { gap, frames };
      }, BORDER);
      assert.deepEqual(result.gap, { readyRemoved: true, sameBorder: true, visible: 'visible' },
        'A real route gap disposes the old sidebar controller while retaining its Glow layer');
      assert.ok(result.frames.length > 10);
      for (const frame of result.frames) {
        assert.equal(frame.hidden, 'true'); assert.equal(frame.moving, false,
          'Remount must apply the existing layout immediately, without replaying its collapse transition');
        assert.equal(frame.sameBorder, true);
        assert.ok(Math.abs(frame.surfaceX - hidden.surfaceX) < .1);
        assert.ok(Math.abs(frame.surfaceWidth - hidden.surfaceWidth) < .1);
        assert.ok(Math.abs(frame.borderX - frame.surfaceX) < .1);
        assert.ok(Math.abs(frame.borderWidth - frame.surfaceWidth) < .1);
      }
      assert.equal((await snapshot(page)).profileHit, true);
      await f.close();
    });

    await t.test('Settings Home preserves the native guard and hidden destinations cannot receive focus', async () => {
      const f = await fixture(), { page } = f;
      await hideRail(page); await page.locator('#profile-settings').click(); await page.locator(HOME).waitFor();
      await page.locator('#native-home').evaluate(node => { node.disabled = true; });
      await page.locator(HOME).click();
      assert.equal((await snapshot(page)).route, 'settings', 'A disabled native Home action must not be bypassed');
      const safe = await page.locator('#native-home').evaluate(node => {
        node.focus();
        return { inert: Boolean(node.closest('[inert]')), focused: document.activeElement === node };
      });
      assert.deepEqual(safe, { inert: true, focused: false }, 'Hidden destinations stay out of keyboard navigation');
      await page.locator('#native-home').evaluate(node => { node.disabled = false; });
      await page.locator(HOME).click(); assert.equal((await snapshot(page)).route, 'home');
      await f.close();
    });

    await t.test('failed native setters and invalid calls safely decline the optional custom layout', async () => {
      const f = await fixture(), { page } = f;
      const initial = await snapshot(page);
      await toggle(page);
      const attempts = await page.evaluate(() => {
        const runtime = window.__neonCodexRuntime;
        return [runtime.cycleSidebar(), runtime.cycleSidebar({ open: false }),
          runtime.cycleSidebar({ open: false, setOpen() { throw new Error('Isolated native setter failure'); } })];
      });
      assert.deepEqual(attempts, [false, false, false]);
      await settle(page);
      assert.equal((await snapshot(page)).open, false);
      assert.equal((await snapshot(page)).surfaceX, initial.surfaceX);
      assert.equal((await snapshot(page)).profileHit, true);
      await f.close();
    });

    await t.test('rapid clicks and immediate reversal settle without losing the native open state', async () => {
      const f = await fixture(), { page } = f;
      const initial = await snapshot(page);
      await page.evaluate(() => { for (let i = 0; i < 9; i++) document.querySelector('#toggle-sidebar').click(); });
      await settle(page);
      let final = await snapshot(page);
      assert.equal(final.open, true); assert.equal(final.surfaceX, initial.surfaceX); assert.equal(final.profileHit, true);
      await page.evaluate(() => { document.querySelector('#toggle-sidebar').click(); document.querySelector('#toggle-sidebar').click(); });
      await page.waitForTimeout(70); await toggle(page); await settle(page);
      final = await snapshot(page);
      assert.equal(final.open, true); assert.equal(final.surfaceX, initial.surfaceX); assert.equal(final.mainWidth, initial.mainWidth);
      await f.close();
    });

    for (const legacySurface of [false, true]) {
      await t.test(`the ${legacySurface ? 'legacy' : 'latest'} reviewed surface keeps border geometry and corners through every cycle frame`, async () => {
        const f = await fixture({ legacySurface }), { page } = f;
        assert.equal(await page.locator('.page-surface').evaluate(node => node.classList.contains('_PageSurface_etoz9_2')), !legacySurface);
        await page.locator('.main').evaluate(node => {
          // Lookalike route content is not a native background or geometry anchor.
          const decoy = document.createElement('div'); decoy.id = 'nested-surface-decoy';
          decoy.className = '_PageSurface_etoz9_2 _PageSurface_yl8z4_2'; decoy.hidden = true; node.append(decoy);
        });
        await page.evaluate(selector => { window.__originalBorder = document.querySelector(selector); }, BORDER);
        const frames = await page.evaluate(async selector => {
          const result = [], button = document.querySelector('#toggle-sidebar');
          for (let click = 0; click < 3; click++) {
            button.click();
            const start = performance.now();
            await new Promise(resolve => {
              const sample = now => setTimeout(() => {
                // ResizeObserver synchronizes Glow after RAF callbacks but before
                // paint. Measure the completed rendering turn, not before that
                // native geometry delivery.
                const border = document.querySelector(selector), surface = document.querySelector('.page-surface');
                const a = border.getBoundingClientRect(), b = surface.getBoundingClientRect();
                const sa = getComputedStyle(border), sb = getComputedStyle(surface);
                result.push({ click, surfaceX: b.x, same: border === window.__originalBorder, visible: sa.visibility,
                  error: Math.max(...['x', 'y', 'width', 'height'].map(key => Math.abs(a[key] - b[key]))),
                  radius: ['TopLeft', 'TopRight', 'BottomLeft', 'BottomRight'].map(corner => [parseFloat(sa[`border${corner}Radius`]), parseFloat(sb[`border${corner}Radius`])]) });
                if (now - start < 560) requestAnimationFrame(sample); else resolve();
              }, 0);
              requestAnimationFrame(sample);
            });
          }
          return result;
        }, BORDER);
        assert.ok(frames.length > 20, 'Sample animated geometry over multiple frames');
        for (const click of [1, 2]) {
          const positions = new Set(frames.filter(frame => frame.click === click).map(frame => Math.round(frame.surfaceX * 10)));
          assert.ok(positions.size > 3, 'The actual native surface must travel smoothly through intermediate positions, not jump to its destination');
        }
        for (const frame of frames) {
          assert.equal(frame.same, true); assert.equal(frame.visible, 'visible');
          assert.ok(frame.error < 1.1, `Glow must match the moving surface, including first frame: ${JSON.stringify(frame)}`);
          for (const [a,b] of frame.radius) { assert.ok(a > 0); assert.ok(Math.abs(a-b) < .1); }
        }
        assert.equal(await page.locator('.page-surface').getAttribute('data-neon-sidebar-geometry'), 'v1');
        assert.equal(await page.locator('#nested-surface-decoy').getAttribute('data-neon-sidebar-geometry'), null,
          'Only direct workspace surfaces are decorated, never similarly named route descendants');
        await f.close();
      });
    }

    await t.test('reduced motion completes the cycle without a lingering geometry animation', async () => {
      const f = await fixture({ reducedMotion: 'reduce' }), { page } = f;
      const initial = await snapshot(page);
      await toggle(page); await toggle(page); await nextPaint(page);
      const second = await snapshot(page);
      assert.equal(second.open, true); assert.ok(second.surfaceX < initial.surfaceX - 40);
      const active = await page.evaluate(() => document.querySelector('[data-app-shell-frame]').getAnimations({ subtree: true })
        .filter(animation => animation.playState === 'running' && animation.effect?.getKeyframes().some(frame => 'width' in frame || 'paddingLeft' in frame || 'insetInlineStart' in frame)).length);
      assert.equal(active, 0, 'Respect reduced motion for sidebar movement');
      await toggle(page); await nextPaint(page);
      assert.equal((await snapshot(page)).surfaceX, initial.surfaceX);
      await f.close();
    });

    await t.test('missing native profile refuses custom collapse and falls back to the original command', async () => {
      const f = await fixture(), { page } = f;
      const initial = await snapshot(page);
      await page.locator('#profile-settings').evaluate(node => node.remove());
      await toggle(page); await toggle(page); await settle(page);
      assert.equal(await page.evaluate(() => window.__neonPreviewSidebar.open), true);
      assert.equal(await page.locator('.page-surface').evaluate(node => node.getBoundingClientRect().x), initial.surfaceX);
      assert.equal(await page.locator(HOME).count(), 0);
      await f.close();
    });

    await t.test('missing native Home refuses custom collapse to preserve Settings escape navigation', async () => {
      const f = await fixture(), { page } = f;
      const initial = await snapshot(page);
      await page.locator('#native-home').evaluate(node => node.remove());
      await toggle(page); await toggle(page); await settle(page);
      assert.equal((await snapshot(page)).open, true); assert.equal((await snapshot(page)).surfaceX, initial.surfaceX);
      assert.equal(await page.locator(HOME).count(), 0);
      await f.close();
    });

    await t.test('normal native peek widths remain untouched before the custom layout is requested', async () => {
      const f = await fixture(), { page } = f;
      await toggle(page);
      await page.evaluate(() => {
        const panel = document.querySelector('.app-shell-left-panel');
        const clip = panel.firstElementChild, content = clip.firstElementChild;
        panel.style.width = '52px';
        // Native peek can float a wider clipped content layer over a narrow rail.
        clip.style.flex = 'none'; clip.style.width = '340px';
        content.style.width = '340px'; content.style.minWidth = '340px';
      });
      await settle(page);
      const widths = await page.evaluate(() => {
        const panel = document.querySelector('.app-shell-left-panel'), clip = panel.firstElementChild;
        return { panel: panel.getBoundingClientRect().width, clip: clip.getBoundingClientRect().width,
          content: clip.firstElementChild.getBoundingClientRect().width,
          hidden: document.querySelector('[data-app-shell-frame]').dataset.neonSidebarHidden };
      });
      assert.deepEqual(widths, { panel: 52, clip: 340, content: 340, hidden: 'false' },
        'Optional Glow must not override native peek dimensions in the normal layout');
      await f.close();
    });

    await t.test('rail-only destinations suspend custom hiding and resume it when the native list returns', async () => {
      const f = await fixture(), { page } = f;
      const initial = await snapshot(page);
      await hideRail(page);
      await page.evaluate(() => {
        const panel = document.querySelector('.app-shell-left-panel'), content = panel.firstElementChild.firstElementChild;
        panel.style.width = '52px';
        content.style.width = '52px'; content.style.minWidth = '52px'; content.style.contain = 'layout paint';
      });
      await settle(page);
      const suspended = await snapshot(page);
      assert.equal(await page.locator('[data-app-shell-frame]').getAttribute('data-neon-sidebar-hidden'), 'false');
      assert.equal(suspended.surfaceX, initial.surfaceX); assert.equal(suspended.profileHit, true,
        'The original account button remains accessible on narrow native destinations');
      assert.deepEqual(await page.locator('.rail-destinations').evaluate(node => ({
        opacity: Number(getComputedStyle(node).opacity), visibility: getComputedStyle(node).visibility,
        inert: node.inert, hidden: node.getAttribute('aria-hidden'),
      })), { opacity: 0, visibility: 'hidden', inert: true, hidden: 'true' },
      'A narrow native panel can restore account space without revealing unwanted rail destinations');
      await page.evaluate(() => {
        const panel = document.querySelector('.app-shell-left-panel'), content = panel.firstElementChild.firstElementChild;
        panel.style.width = '276px'; content.style.width = '276px'; content.style.minWidth = '276px';
        content.style.removeProperty('contain');
      });
      await settle(page);
      assert.equal(await page.locator('[data-app-shell-frame]').getAttribute('data-neon-sidebar-hidden'), 'true');
      assert.ok((await snapshot(page)).surfaceX < initial.surfaceX - 40);
      assert.equal((await snapshot(page)).profileHit, true);
      await f.close();
    });

    await t.test('transient native panel widths do not reveal icons or lose the account control', async () => {
      const f = await fixture(), { page } = f;
      await hideRail(page);
      const frames = await page.evaluate(async () => {
        const panel = document.querySelector('.app-shell-left-panel'), content = panel.firstElementChild.firstElementChild;
        const icons = document.querySelector('.rail-destinations'), values = [];
        function width(value) {
          panel.style.width = `${value}px`; content.style.width = `${value}px`; content.style.minWidth = `${value}px`;
        }
        function sample() {
          const style = getComputedStyle(icons), profile = document.querySelector('#profile-settings');
          const box = profile.getBoundingClientRect(), hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
          values.push({ opacity: Number(style.opacity), visibility: style.visibility, inert: icons.inert,
            profileHit: Boolean(hit?.closest('#profile-settings')) });
        }
        width(52); sample();
        await new Promise(resolve => requestAnimationFrame(() => { sample(); requestAnimationFrame(resolve); }));
        width(276); sample();
        const start = performance.now();
        await new Promise(resolve => {
          const frame = now => setTimeout(() => {
            sample();
            if (now - start < 520) requestAnimationFrame(frame); else resolve();
          }, 0);
          requestAnimationFrame(frame);
        });
        return values;
      });
      assert.ok(frames.length > 10);
      for (const frame of frames) {
        assert.equal(frame.opacity, 0); assert.equal(frame.visibility, 'hidden'); assert.equal(frame.inert, true);
        assert.equal(frame.profileHit, true, `Account stays usable during native route settling: ${JSON.stringify(frame)}`);
      }
      assert.equal(await page.locator('#toggle-sidebar').getAttribute('data-neon-sidebar-layout'), 'expanded');
      await f.close();
    });

    await t.test('replacing the native Home node in place uses its new guarded action', async () => {
      const f = await fixture(), { page } = f;
      await hideRail(page); await page.locator('#profile-settings').click(); await page.locator(HOME).waitFor();
      await page.evaluate(() => {
        window.__oldHomeCalls = 0; window.__newHomeCalls = 0;
        const original = document.querySelector('#native-home');
        original.addEventListener('click', () => window.__oldHomeCalls++);
        const replacement = original.cloneNode(true);
        replacement.addEventListener('click', () => {
          window.__newHomeCalls++;
          document.querySelector('#view-toggle').click();
        });
        original.replaceWith(replacement);
      });
      await nextPaint(page); await page.locator(HOME).click();
      assert.deepEqual(await page.evaluate(() => [window.__oldHomeCalls, window.__newHomeCalls]), [0, 1]);
      assert.equal((await snapshot(page)).route, 'home');
      await f.close();
    });

    await t.test('theme dissolve and rail movement interpolate together in both directions', async () => {
      const f = await fixture(), { page } = f;
      await toggle(page); await settle(page);
      const values = await page.evaluate(async () => {
        const panel = document.querySelector('.app-shell-left-panel'), content = panel.firstElementChild.firstElementChild;
        const result = [];
        for (const theme of ['dark', 'light']) {
          document.documentElement.dataset.theme = theme;
          document.querySelector('#toggle-sidebar').click();
          await new Promise(resolve => setTimeout(resolve, 110));
          const a = getComputedStyle(panel), b = getComputedStyle(content);
          result.push({ margin: parseFloat(a.marginInlineEnd), width: content.getBoundingClientRect().width,
            panelTransition: a.transitionProperty, contentTransition: b.transitionProperty });
          await new Promise(resolve => setTimeout(resolve, 460));
        }
        return result;
      });
      for (const value of values) {
        assert.ok(value.margin < -1 && value.margin > -47, `Margin should interpolate during theme change: ${JSON.stringify(value)}`);
        assert.ok(value.width > 229 && value.width < 275, `Panel width should interpolate during theme change: ${JSON.stringify(value)}`);
        assert.match(value.panelTransition, /margin-inline-end/); assert.match(value.panelTransition, /background-color/);
        assert.match(value.contentTransition, /width/);
      }
      assert.equal((await snapshot(page)).open, true);
      await f.close();
    });

    await t.test('utility windows never take over the native sidebar command', async () => {
      const f = await fixture({ utility: true }), { page } = f;
      const initial = await snapshot(page);
      assert.equal(await page.locator(BORDER).count(), 0);
      await toggle(page); assert.equal((await snapshot(page)).open, false);
      await toggle(page); await settle(page);
      assert.equal((await snapshot(page)).open, true); assert.equal((await snapshot(page)).surfaceX, initial.surfaceX);
      assert.equal(await page.locator(HOME).count(), 0);
      await f.close();
    });

    await t.test('destroy restores original layout, profile and native command behavior', async () => {
      const f = await fixture(), { page } = f;
      const initial = await snapshot(page);
      await page.evaluate(() => { window.__originalProfile = document.querySelector('#profile-settings'); });
      await hideRail(page); await page.locator('#profile-settings').click(); await page.locator(HOME).waitFor();
      await page.evaluate(() => window.__neonCodexRuntime.destroy()); await settle(page);
      assert.equal((await snapshot(page)).surfaceX, initial.surfaceX); assert.equal((await snapshot(page)).profileHit, true);
      assert.equal(await page.evaluate(() => window.__originalProfile === document.querySelector('#profile-settings')), true);
      assert.equal(await page.locator(HOME).count(), 0); assert.equal(await page.locator(BORDER).count(), 0);
      assert.equal(await page.locator('[data-neon-rail],[data-neon-settings-navigation]').count(), 0);
      await page.locator('#native-home').click();
      await toggle(page); assert.equal((await snapshot(page)).open, false);
      await toggle(page); assert.equal((await snapshot(page)).open, true);
      await f.close();
    });
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
});
