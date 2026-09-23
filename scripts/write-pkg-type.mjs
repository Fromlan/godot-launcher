#!/usr/bin/env node
/**
 * 在指定 dist 子目录写一个最小的 package.json, 用于覆盖 root 的 "type":"module"。
 *
 * Electron 主进程 / preload 走 CJS require(), 编译产物使用 require/module.exports。
 * 如果 root package.json 写 "type":"module", Node 会把 .js 当 ESM 解析,
 * 导致 `exports is not defined` 错误。
 *
 * 解决方案: 在每个 CJS 产物目录写局部 package.json "type":"commonjs",
 * Node 会按就近 package.json 的 type 字段加载。
 *
 * 用法:
 *   node scripts/write-pkg-type.mjs <dir> <commonjs|module>
 *
 * 例:
 *   node scripts/write-pkg-type.mjs dist-main commonjs
 *   node scripts/write-pkg-type.mjs dist-preload commonjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
const type = process.argv[3];

if (!dir || (type !== 'commonjs' && type !== 'module')) {
  console.error('usage: node scripts/write-pkg-type.mjs <dir> <commonjs|module>');
  process.exit(1);
}

mkdirSync(dir, { recursive: true });
const file = path.join(dir, 'package.json');
writeFileSync(file, JSON.stringify({ type }, null, 2) + '\n', 'utf-8');
console.log('[write-pkg-type] wrote', file, '(type=' + type + ')');