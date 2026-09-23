#!/usr/bin/env node
/**
 * 从 resources/icon-source.png 生成:
 *   - resources/icon.ico  (16/32/48/64/128/256 多分辨率 Windows 应用图标)
 *   - resources/tray.ico  (16/32 托盘图标)
 *
 * 实现:
 *   - sharp 生成各分辨率 PNG(透明背景、保持长宽比)
 *   - png-to-ico 把 PNG buffer 合并为单文件 .ico
 *
 * 用法:
 *   node scripts/build-icon.mjs
 *
 * 前置条件:
 *   - resources/icon-source.png 存在(>=256x256,推荐 RGBA)
 *
 * 不会写入除 resources/icon.ico 与 resources/tray.ico 外的任何文件。
 */
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const src = path.join(root, 'resources', 'icon-source.png');
const iconIco = path.join(root, 'resources', 'icon.ico');
const trayIco = path.join(root, 'resources', 'tray.ico');

function die(msg, code = 1) {
  console.error('[build-icon] ' + msg);
  process.exit(code);
}

function info(msg) {
  console.log('[build-icon] ' + msg);
}

if (!existsSync(src)) {
  die('source PNG not found: ' + src + '\n请先准备 resources/icon-source.png(>=256x256,RGBA,透明背景)。');
}
const srcStat = statSync(src);
info('source: ' + src + ' (' + srcStat.size + ' bytes)');

async function loadDeps() {
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    die('sharp not installed. Run: npm install --save-dev sharp');
  }
  let pngToIco;
  try {
    pngToIco = (await import('png-to-ico')).default;
  } catch {
    die('png-to-ico not installed. Run: npm install --save-dev png-to-ico');
  }
  return { sharp, pngToIco };
}

async function resizeToPng(sharp, srcPath, size) {
  return await sharp(srcPath)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

function report(file) {
  const stat = statSync(file);
  info('wrote ' + path.relative(root, file) + ' (' + stat.size + ' bytes)');
}

async function main() {
  const { sharp, pngToIco } = await loadDeps();
  info('using sharp + png-to-ico');

  // icon.ico (16/32/48/64/128/256)
  const appSizes = [16, 32, 48, 64, 128, 256];
  const appBuffers = await Promise.all(appSizes.map((s) => resizeToPng(sharp, src, s)));
  const appBuf = await pngToIco(appBuffers);
  const { writeFileSync } = await import('node:fs');
  writeFileSync(iconIco, appBuf);

  // tray.ico (16/32)
  const traySizes = [16, 32];
  const trayBuffers = await Promise.all(traySizes.map((s) => resizeToPng(sharp, src, s)));
  const trayBuf = await pngToIco(trayBuffers);
  writeFileSync(trayIco, trayBuf);

  report(iconIco);
  report(trayIco);
  info('done');
}

main().catch((err) => die(err && err.message ? err.message : String(err)));