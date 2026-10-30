import assert from 'node:assert/strict';
import path from 'node:path';

// Build 22943 uses a hash-only stylesheet name. Select the actual stylesheet
// link, never a preload, comment, asset catalog, or incidental filename mention.
export function discoverRendererStylesheet({ files, html }) {
  // Only the reviewed document-head layout is supported. Consume whole quoted
  // attributes and raw-text elements so strings containing tags are not links.
  const markup = html.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|title)\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/\1\s*>/gi, '');
  const heads = [...markup.matchAll(/<head\s*>([\s\S]*?)<\/head\s*>/gi)];
  assert.equal(heads.length, 1, 'Expected exactly one renderer head');
  const links = [];
  for (const [tag, name] of heads[0][1].matchAll(/<([a-z][\w:-]*)(?:[^>"']|"[^"]*"|'[^']*')*>/gi)) {
    assert.ok(/^(?:meta|link)$/i.test(name), 'Unreviewed renderer head element');
    if (name.toLowerCase() !== 'link') continue;
    const attributes = new Map();
    let rest = tag.slice(5, -1);
    while (rest.trim()) {
      if (rest.trim() === '/') break;
      const match = rest.match(/^\s+([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/);
      assert.ok(match, 'Malformed renderer link attributes');
      const key = match[1].toLowerCase();
      assert.ok(!attributes.has(key), `Duplicate stylesheet link ${key} attribute`);
      attributes.set(key, match[2] ?? match[3] ?? match[4] ?? null);
      rest = rest.slice(match[0].length);
    }
    if (attributes.get('rel')?.toLowerCase() !== 'stylesheet') continue;
    assert.ok([...attributes.keys()].every(key => ['rel', 'href', 'crossorigin'].includes(key)), 'Unreviewed stylesheet link attributes');
    links.push(attributes);
  }
  assert.equal(links.length, 1, 'Expected exactly one referenced shared stylesheet');
  const href = links[0].get('href');
  assert.match(href ?? '', /^\.\/assets\/(?:app-shared-)?[a-f0-9]+\.css$/, 'Unexpected renderer stylesheet link');
  const cssPath = `webview/${href.slice(2)}`;
  assert.ok(files.map(file => file.replace(/^\//, '')).includes(cssPath), 'Missing referenced renderer stylesheet');
  return cssPath;
}

// Literal imports only. Vite preload catalogs and source-map names are not
// dependency edges and must never select the renderer that Glow patches.
export function importPaths(source, { dynamic = false } = {}) {
  const expression = dynamic
    ? /\bimport\((["'`])(\.\/[^"'`]+\.js)\1\)/g
    : /\bimport\s*(?:\{[^}]*\}\s*from\s*)?["'](\.\/[^"']+\.js)["']/g;
  return [...source.matchAll(expression)].map(match => match[dynamic ? 2 : 1]);
}

export function discoverRendererLayout({ files, readFile, html }) {
  const names = files.map(file => file.replace(/^\//, ''));
  const one = (values, label) => {
    assert.equal(values.length, 1, `Expected exactly one ${label}`);
    return values[0];
  };
  const read = file => {
    assert.ok(names.includes(file), `Missing renderer asset: ${file}`);
    return readFile(file).toString();
  };
  const linked = (source, pattern, label, dynamic = false) => {
    const imports = importPaths(source, { dynamic }).map(file => path.posix.normalize(`webview/assets/${file}`));
    const file = one(imports.filter(file => pattern.test(file)), label);
    read(file);
    return file;
  };
  const entry = one([...html.matchAll(/<script\s+type="module"[^>]*\bsrc="(\.\/assets\/[^"/]+\.js)"/g)], 'native entry module');
  const entryPath = path.posix.normalize(`webview/${entry[1]}`);
  const entrySource = read(entryPath);
  if (importPaths(entrySource).some(file => /^\.\/app-initial-[a-f0-9]+\.js$/.test(file))) {
    const initialPath = linked(entrySource, /^webview\/assets\/app-initial-[a-f0-9]+\.js$/, 'linked native initial renderer');
    return { entryPath, initialPath, sidebarPath: initialPath };
  }

  const mainPath = linked(entrySource, /^webview\/assets\/app-main-[a-f0-9]+\.js$/, 'native main renderer import', true);
  const mainSource = read(mainPath);
  const initialPath = linked(mainSource, /^webview\/assets\/app-initial-[a-f0-9]+\.js$/, 'linked native initial renderer');
  // Earlier builds also ship app-primary assets, but keep the command in
  // app-initial. Select the layout through imports, never filenames alone.
  if (!importPaths(mainSource, { dynamic: true }).some(file => /^\.\/app-runtime-[a-f0-9]+\.js$/.test(file))) {
    return { entryPath, initialPath, mainPath, sidebarPath: initialPath };
  }
  // Reviewed 21828 split: entry -> main -> runtime -> primary. Keep the
  // initial renderer independently pinned and byte-identical in this layout.
  const primaryPath = one(names.filter(file => /^webview\/assets\/app-primary-[a-f0-9]+\.js$/.test(file)), 'native primary renderer');
  const runtimePath = linked(mainSource, /^webview\/assets\/app-runtime-[a-f0-9]+\.js$/, 'native runtime renderer import', true);
  assert.equal(linked(read(runtimePath), /^webview\/assets\/app-primary-[a-f0-9]+\.js$/, 'linked native primary renderer'), primaryPath, 'Native primary renderer linkage changed');
  return { entryPath, initialPath, mainPath, runtimePath, primaryPath, sidebarPath: primaryPath };
}
