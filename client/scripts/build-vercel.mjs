// Produces Vercel Build Output API v3: static client + bundled Express API function.
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const clientDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = resolve(clientDir, '../server');
const outDir = resolve(clientDir, '.vercel/output');
const funcDir = resolve(outDir, 'functions/api.func');

rmSync(outDir, { recursive: true, force: true });
mkdirSync(funcDir, { recursive: true });

cpSync(resolve(clientDir, 'dist'), resolve(outDir, 'static'), { recursive: true });

await build({
  entryPoints: [resolve(serverDir, 'src/vercel.cjs')],
  outfile: resolve(funcDir, 'index.js'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: ['pg-native'],
  nodePaths: [resolve(serverDir, 'node_modules')],
  logLevel: 'info',
});

writeFileSync(resolve(funcDir, 'package.json'), JSON.stringify({ type: 'commonjs' }));

writeFileSync(
  resolve(funcDir, '.vc-config.json'),
  JSON.stringify({ runtime: 'nodejs20.x', handler: 'index.js', launcherType: 'Nodejs', maxDuration: 30 }, null, 2)
);

writeFileSync(
  resolve(outDir, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '/api/(.*)', dest: '/api' },
        { handle: 'filesystem' },
        { src: '/(.*)', dest: '/index.html' },
      ],
    },
    null,
    2
  )
);

console.log('[build-vercel] Wrote', outDir);
