// 开发模式启动器:
// 默认:并发启动 tsc --watch (main + preload) + vite + electron
// 参数:
//   --reset                删除 %APPDATA%/godot-launcher/ 下的 userData 后启动
//   --clean               删除 dist-main / dist-preload / dist-renderer 后启动
//   --debug               启用主进程 debug 日志(ELECTRON_ENABLE_LOGGING + DEBUG=* + VERBOSE)
//   --inspect             启用主进程 node --inspect-brk=9229 (等 DevTools attach)
//   --port <n>            自定义 vite 端口(默认 5173)
import { spawn } from 'node:child_process';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const isWindows = process.platform === 'win32';

// 解析 CLI 参数
const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const args = new Map();
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args.set(a.slice(2), next);
      i++;
    }
  }
}
const WANT_RESET = flags.has('--reset');
const WANT_CLEAN = flags.has('--clean');
const WANT_DEBUG = flags.has('--debug');
const WANT_INSPECT = flags.has('--inspect');
const VITE_PORT = args.get('port') || '5173';

// userData 目录(与 src/main/utils/path.ts 保持一致)
function getUserDataDir() {
  if (process.env.APPDATA) return path.join(process.env.APPDATA, 'godot-launcher');
  return path.join(os.homedir(), '.godot-launcher');
}

function color(s, c) {
  const codes = { red: 31, green: 32, yellow: 33, blue: 34, magenta: 35, cyan: 36, bold: 1 };
  const code = codes[c] || 0;
  return `\x1b[${code}m${s}\x1b[0m`;
}

function info(msg) {
  console.log(color('[dev]', 'cyan') + ' ' + msg);
}

function warn(msg) {
  console.warn(color('[dev]', 'yellow') + ' ' + msg);
}

function die(msg, exitCode = 1) {
  console.error(color('[dev]', 'red') + ' ' + msg);
  process.exit(exitCode);
}

/**
 * Windows 上,直接 spawn npx.cmd / npm.cmd 等 .cmd shim 会触发 EINVAL。
 * 用 cmd.exe /c 包装,既能正确传递参数,又能兼容 .cmd/.bat。
 */
function spawnCmd(cmd, args, opts = {}) {
  const fullCmd = isWindows ? 'cmd.exe' : cmd;
  const fullArgs = isWindows ? ['/c', cmd, ...args] : args;
  return spawn(fullCmd, fullArgs, { stdio: 'inherit', ...opts });
}

function waitForVite(url, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise(async (resolve, reject) => {
    while (Date.now() - start < timeoutMs) {
      const ok = await new Promise((r) => {
        const req = http.get(url, (res) => {
          r(res.statusCode === 200);
          res.resume();
        });
        req.on('error', () => r(false));
        req.setTimeout(1000, () => {
          req.destroy();
          r(false);
        });
      });
      if (ok) return resolve(true);
      await new Promise((r) => setTimeout(r, 500));
    }
    reject(new Error('vite 启动超时'));
  });
}

/**
 * 启动前检测目标端口是否被占;若被占,通过 killport.ps1 杀掉占用进程。
 * 解决 "Port 5173 is already in use" 问题(常见于上次 dev Ctrl+C 没正常退)。
 * 仅在 Windows 上有效。
 */
async function precheckPortAndCleanup(port) {
  if (!isWindows) return;
  if (await isPortFree(port)) return;
  warn('port ' + port + ' is already in use, killing stale processes ...');
  try {
    const { execSync } = await import('node:child_process');
    const psScript = path.join(__dirname, 'killport.ps1');
    execSync('powershell -NoProfile -ExecutionPolicy Bypass -File ' + JSON.stringify(psScript) + ' ' + String(port), { stdio: "ignore" });
    info('killed stale processes');
  } catch (err) {
    warn('killport.ps1 failed: ' + (err && err.message || err));
  }
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 250));
    if (await isPortFree(port)) return;
  }
  warn('port ' + port + ' still busy; continuing anyway');
}

async function isPortFree(port) {
  const net = await import('node:net');
  return await new Promise((resolve) => {
    const sock = net.createServer();
    sock.unref();
    sock.once('error', () => resolve(false));
    sock.once('listening', () => sock.close(() => resolve(true)));
    sock.listen(port, '127.0.0.1');
  });
}
// 1. 清理 dist 产物
async function cleanDist() {
  for (const d of ['dist-main', 'dist-preload', 'dist-renderer']) {
    try {
      await fs.rm(path.join(root, d), { recursive: true, force: true });
      info('cleaned ' + d);
    } catch {}
  }
}

// 2. 重置 userData(Electron 持有 lockfile 时先 kill 残留进程)
async function killElectronProcesses() {
  if (!isWindows) return;
  try {
    const { execSync } = await import('node:child_process');
    execSync('taskkill /F /IM electron.exe /T', { stdio: 'ignore' });
    info('killed existing electron.exe processes');
    await new Promise((r) => setTimeout(r, 500));
  } catch {}
}

async function resetUserData() {
  await killElectronProcesses();
  const dir = getUserDataDir();
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
      info('reset userData at ' + dir);
      return;
    } catch (err) {
      warn('reset userData attempt ' + attempt + ' failed: ' + err.message);
      if (attempt < 3) {
        await killElectronProcesses();
        await new Promise((r) => setTimeout(r, 800));
      }
    }
  }
}

async function main() {
  info('cwd=' + root);
  if (WANT_CLEAN) await cleanDist();
  await precheckPortAndCleanup(VITE_PORT);
  if (WANT_RESET) await resetUserData();

  info('flags: ' + (WANT_RESET ? '[reset] ' : '') + (WANT_CLEAN ? '[clean] ' : '') + (WANT_DEBUG ? '[debug] ' : '') + (WANT_INSPECT ? '[inspect] ' : '') + '[port=' + VITE_PORT + ']');

  const env = { ...process.env, VITE_DEV_SERVER_URL: 'http://localhost:' + VITE_PORT };
  if (WANT_DEBUG) {
    env.ELECTRON_ENABLE_LOGGING = '1';
    env.DEBUG = '*';
  }

  // 1. tsc --watch(主进程 + preload),持续运行不退出
  info('starting tsc --watch (main + preload)');
  const tscMain = spawnCmd('npx', ['tsc', '-p', 'tsconfig.node.json', '--watch'], { cwd: root, env });
  const tscPreload = spawnCmd('npx', ['tsc', '-p', 'tsconfig.preload.json', '--watch'], { cwd: root, env });

  // 2. vite
  info('starting vite on ' + env.VITE_DEV_SERVER_URL);
  const vite = spawnCmd('npx', ['vite'], { cwd: root, env });

  // 3. 等 vite ready
  try {
    await waitForVite(env.VITE_DEV_SERVER_URL);
  } catch (err) {
    tscMain.kill();
    tscPreload.kill();
    vite.kill();
    die(err.message);
  }

  // 4. 启动 electron(可选用 inspect)
  info('starting electron' + (WANT_INSPECT ? ' with --inspect-brk=9229' : ''));
  const electronArgs = ['electron', '.'];
  if (WANT_INSPECT) {
    // 通过 NODE_OPTIONS 注入 inspect(对 spawn 的 Node 生效;electron 主进程会复用)
    env.NODE_OPTIONS = '--inspect-brk=9229';
  }
  const electron = spawnCmd('npx', electronArgs, { cwd: root, env });

  // electron 退出后清理所有 watch 进程并退出
  const cleanup = (code = 0) => {
    try { tscMain.kill(); } catch {}
    try { tscPreload.kill(); } catch {}
    try { vite.kill(); } catch {}
    process.exit(code);
  };
  electron.on('exit', (code) => {
    info('electron exited with code=' + code);
    cleanup(code ?? 0);
  });
  electron.on('error', () => cleanup(1));

  // SIGINT / SIGTERM / Ctrl+C
  process.on('SIGINT', () => cleanup(0));
  process.on('SIGTERM', () => cleanup(0));
  if (isWindows && process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.on('data', (data) => {
      if (data.length === 1 && data[0] === 0x03) cleanup(0);
    });
  }
}

main().catch((err) => {
  die(err.message || String(err));
});

