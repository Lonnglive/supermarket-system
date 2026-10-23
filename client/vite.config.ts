import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const API_PORT = 5000;
const serverDir = path.resolve(__dirname, '../server');

type GlobalWithApi = typeof globalThis & { __supermarketApi?: ChildProcess };

// Starts the Express API alongside the Vite dev server so /api requests work
// in environments (like the v0 preview) that only run `npm run dev` in client/.
function devApiServer(mode: string): Plugin {
  return {
    name: 'dev-api-server',
    apply: 'serve',
    configureServer() {
      if (process.env.SKIP_DEV_API === '1') return;

      const g = globalThis as GlobalWithApi;
      g.__supermarketApi?.kill();

      if (!existsSync(path.join(serverDir, 'node_modules/.bin/tsx'))) {
        console.log('[dev-api] Installing server dependencies...');
        spawnSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: serverDir, stdio: 'inherit' });
      }

      const env = {
        ...process.env,
        ...loadEnv(mode, path.resolve(__dirname, '..'), ''),
        ...loadEnv(mode, __dirname, ''),
        PORT: String(API_PORT),
      };

      const child = spawn(path.join(serverDir, 'node_modules/.bin/tsx'), ['src/index.ts'], {
        cwd: serverDir,
        env,
        stdio: 'inherit',
      });
      g.__supermarketApi = child;

      const stop = () => child.kill();
      process.once('exit', stop);
      process.once('SIGINT', () => { stop(); process.exit(0); });
      process.once('SIGTERM', () => { stop(); process.exit(0); });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), devApiServer(mode)],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://localhost:${API_PORT}`,
        changeOrigin: true,
      },
    },
  },
}));
