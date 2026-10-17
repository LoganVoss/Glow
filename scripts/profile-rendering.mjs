#!/usr/bin/env node
/** Isolated Chromium fixture profiling. Never opens or measures the installed app.
 * Example: node scripts/profile-rendering.mjs --root /path/to/source --output .local/profile.json
 * CPU timings and GPU submission events are not temperature, energy, GPU utilization,
 * or native-app measurements. Compare runs on the same machine without other tests.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!['--root', '--output', '--seconds', '--scenario', '--trace-dir'].includes(args[i]) || !args[i + 1]) {
    throw new Error('Use --root PATH --output PATH --seconds 5 --scenario all --trace-dir PATH (all optional)');
  }
  options[args[i].slice(2)] = args[i + 1];
}
const source = path.resolve(options.root || repository), seconds = Number(options.seconds || 5);
if (!Number.isFinite(seconds) || seconds < 1 || seconds > 60) throw new Error('--seconds must be between 1 and 60');
const allScenarios = ['workspace-bloom', 'workspace-pulse', 'workspace-ping', 'appearance', 'offscreen-previews', 'disabled', 'hidden-document-simulated', 'removed'];
const scenarios = options.scenario && options.scenario !== 'all' ? options.scenario.split(',') : allScenarios;
if (scenarios.some(value => !allScenarios.includes(value))) throw new Error(`Unknown scenario; use ${allScenarios.join(', ')}`);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer(async (request, response) => {
  try {
    const name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (!/^\/(?:src|preview)\/[a-z0-9.-]+$/i.test(name)) throw new Error('Fixture assets only');
    const contents = await readFile(path.join(source, name));
    response.writeHead(200, { 'Content-Type': mime[path.extname(name)] || 'text/plain', 'Cache-Control': 'no-store' });
    response.end(contents);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
let browser;
try {
  browser = await chromium.launch({ headless: true, chromiumSandbox: true,
    executablePath: process.env.NEON_TEST_BROWSER || (existsSync(chrome) ? chrome : undefined) });
  const report = { browser: await browser.version(), source, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2,
    secondsPerScenario: seconds, note: 'Isolated Chromium fixture; no native-app, temperature, energy, or GPU-memory claim. GPU trace durations measure submitted tasks, not GPU utilization.', scenarios: [] };
  for (const scenario of scenarios) {
    const context = await browser.newContext({ viewport: report.viewport, deviceScaleFactor: report.deviceScaleFactor });
    await context.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    try {
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const cdp = await context.newCDPSession(page);
      await cdp.send('Performance.enable');
      await page.goto(`${origin}/preview/index.html`);
      await page.locator('[data-neon-settings-root]').waitFor();
      await page.evaluate(scenario => {
        const names = { 'workspace-pulse': 'pulse', 'workspace-ping': 'signal' };
        if (names[scenario]) document.querySelector(`button[data-pattern="${names[scenario]}"]`).click();
        if (scenario === 'disabled') document.querySelector('[data-neon-settings-root] input[role="switch"]').click();
        if (scenario.startsWith('workspace-') || ['disabled', 'hidden-document-simulated', 'removed'].includes(scenario)) document.querySelector('#view-toggle').click();
        if (scenario === 'offscreen-previews') {
          // Extra blank fixture space makes every sample unambiguously offscreen
          // regardless of future panel height changes; the border stays visible.
          document.querySelector('#appearance-view').style.paddingBottom = '900px';
          document.querySelector('.main').scrollTop = 100_000;
        }
        if (scenario === 'hidden-document-simulated') {
          // Intentionally simulate the lifecycle signal rather than freeze the
          // browser: a frozen browser would conceal a missing Glow pause hook.
          Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
          Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
          document.dispatchEvent(new Event('visibilitychange'));
        }
        if (scenario === 'removed') window.__neonCodexRuntime.destroy();
      }, scenario);
      await page.waitForTimeout(1300);
      await cdp.send('HeapProfiler.collectGarbage');
      const frames = await page.locator('[data-neon-codex-frame]').evaluateAll(nodes => nodes.map(node => {
        const rect = node.getBoundingClientRect();
        return { global: node.dataset.neonGlobal === 'true', pattern: node.dataset.pattern, enabled: node.dataset.enabled,
          rendering: node.dataset.rendering || 'unmanaged', animationState: getComputedStyle(node).animationPlayState,
          visibleRect: rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight };
      }));
      if (scenario === 'removed' && frames.length !== 0) throw new Error('Removed scenario still has Glow frames');
      if (scenario === 'disabled' && frames.find(frame => frame.global)?.enabled !== 'false') throw new Error('Disabled scenario did not disable Glow');
      if (scenario.startsWith('workspace-') && frames.find(frame => frame.global)?.pattern !== ({ 'workspace-bloom': 'prism', 'workspace-pulse': 'pulse', 'workspace-ping': 'signal' })[scenario]) throw new Error('Wrong workspace pattern');
      if (scenario === 'offscreen-previews' && frames.some(frame => !frame.global && frame.visibleRect)) throw new Error('Offscreen scenario still has a visible sample');
      if (scenario === 'hidden-document-simulated' && !await page.evaluate(() => document.hidden)) throw new Error('Hidden signal was not applied');
      const events = [];
      cdp.on('Tracing.dataCollected', ({ value }) => events.push(...value));
      await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,cc', options: 'record-continuously' });
      const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(({ name, value }) => [name, value]));
      const before = await metrics();
      await page.waitForTimeout(seconds * 1000);
      const after = await metrics();
      const complete = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
      await cdp.send('Tracing.end'); await complete;
      const trace = {};
      for (const event of events) {
        if (!['Paint', 'RasterTask', 'UpdateLayoutTree', 'Layout', 'PrePaint', 'GPUTask'].includes(event.name)) continue;
        const item = trace[event.name] ||= { count: 0, durationMs: 0 };
        item.count++; item.durationMs += (event.dur || 0) / 1000;
      }
      const delta = {};
      for (const name of ['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'LayoutCount', 'RecalcStyleCount']) delta[name] = after[name] - before[name];
      const result = { name: scenario, elapsedSeconds: after.Timestamp - before.Timestamp, delta, trace, frames,
        heapBeforeBytes: before.JSHeapUsedSize, heapAfterBytes: after.JSHeapUsedSize, nodes: after.Nodes, listeners: after.JSEventListeners, errors };
      report.scenarios.push(result);
      const partialOutput = path.resolve(options.output || path.join(repository, '.local/rendering-profile.json'));
      await mkdir(path.dirname(partialOutput), { recursive: true });
      await writeFile(partialOutput, JSON.stringify(report, null, 2) + '\n');
      console.log(JSON.stringify({ scenario, taskMs: +(delta.TaskDuration * 1000).toFixed(2), styleUpdates: delta.RecalcStyleCount,
        paintEvents: trace.Paint?.count || 0, rasterTasks: trace.RasterTask?.count || 0,
        managedActiveFrames: frames.filter(frame => frame.rendering === 'active').length, errors }));
      if (options['trace-dir']) {
        await mkdir(options['trace-dir'], { recursive: true });
        await writeFile(path.join(options['trace-dir'], `${scenario}.json`), JSON.stringify({ traceEvents: events }));
      }
      if (errors.length) throw new Error(`Fixture errors in ${scenario}: ${errors.join('; ')}`);
    } finally { await context.close(); }
  }
  const output = path.resolve(options.output || path.join(repository, '.local/rendering-profile.json'));
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(`Report: ${output}`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
