const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('next/dist/server/node-environment');
const { getRuntimeContext } = require('next/dist/server/web/sandbox');

async function main() {
  const distDir = path.resolve(process.argv[2] || '.next');
  const manifest = JSON.parse(fs.readFileSync(path.join(distDir, 'server/middleware-manifest.json'), 'utf8'));
  assert.ok(Object.keys(manifest.functions).length, 'No compiled Edge modules found');
  for (const [route, entry] of Object.entries(manifest.functions)) {
    const absoluteAssets = items => items?.map(item => ({ ...item, filePath: path.join(distDir, item.filePath) }));
    let timer;
    try {
      const runtime = await Promise.race([
        getRuntimeContext({
          name: entry.name, paths: entry.files.map(file => path.join(distDir, file)),
          edgeFunctionEntry: { ...entry, wasm: absoluteAssets(entry.wasm), assets: absoluteAssets(entry.assets) },
          distDir, useCache: false,
        }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Timed out loading ${route}`)), 15000); }),
      ]);
      const entrypoint = await runtime.context._ENTRIES[`middleware_${entry.name}`];
      assert.equal(typeof entrypoint.default, 'function');
      process.stdout.write(`${route}: compiled Edge modules load successfully.\n`);
    } finally {
      clearTimeout(timer);
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
