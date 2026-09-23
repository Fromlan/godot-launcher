# Dev 启动 ESM/CJS Bug Fix

> v0.3 — 修复 `npm run dev` 启动时 Electron 主进程加载失败的隐藏 bug。

## 现象

`npm run dev` 启动后,终端报错:

    App threw an error during load
    ReferenceError: exports is not defined in ES module scope
    This file is being treated as an ES module because it has a ".js" file extension and
    "D:\UGit\Godot-Launcher\package.json" contains "type": "module".
    To treat it as a CommonJS script, rename it to use the ".cjs" file extension.
    at file:///D:/UGit/Godot-Launcher/dist-main/main/index.js:5:23

## 根因

1. 根 `package.json` 写 `"type": "module"`
2. `tsconfig.node.json` 默认编译输出 **CommonJS**(`tsc -p tsconfig.node.json` 输出 `require` / `exports`)
3. Node.js 按 [就近 package.json 的 type 字段](https://nodejs.org/api/packages.html#packagejson-fields) 加载 .js 文件;如果没有就近 `package.json`,沿目录树向上找到根 `package.json`,得到 `"type": "module"`
4. **结果**:Node 把 `dist-main/main/index.js`(CJS 语法)当 ESM 解析,`exports` 未定义 → 加载失败

## 为什么之前能跑

`npm run build` 脚本会显式写 `dist-main/package.json` 和 `dist-preload/package.json`,标记 `"type": "commonjs"`:

    "build:main": "tsc -p tsconfig.node.json && node scripts/write-pkg-type.mjs dist-main commonjs",
    "build:preload": "tsc -p tsconfig.preload.json && node scripts/write-pkg-type.mjs dist-preload commonjs"

但 `scripts/dev.mjs` 只跑 `tsc --watch`,**没有调用 `write-pkg-type.mjs`**。所以:

- 之前能跑 → 用户某次跑过 `npm run build`,留下了 `dist-main/package.json`
- 现在挂了 → 用户用 `--clean` 清理过 dist 或从未 build 过,启动 dev 时缺这个文件

## 修复

`scripts/dev.mjs` 在 Vite 就绪之后、启动 Electron 之前,**自动**调用 `write-pkg-type.mjs`:

    // 3.5 写 dist-main / dist-preload 的 package.json (type=commonjs)
    info("writing dist-main/dist-preload package.json (type=commonjs)");
    try {
      const { execSync } = await import("node:child_process");
      execSync("node scripts/write-pkg-type.mjs dist-main commonjs", { cwd: root, stdio: "ignore" });
      execSync("node scripts/write-pkg-type.mjs dist-preload commonjs", { cwd: root, stdio: "ignore" });
    } catch (err) {
      warn("write-pkg-type failed (continuing anyway): " + (err && err.message || err));
    }

## 经验

- `package.json` 的 `"type": "module"` 是隐式的,会影响所有不带 `.cjs` 后缀的 .js 文件
- TypeScript 编译输出的 module 格式取决于 `tsconfig.json` 的 `module` 字段,默认是 CommonJS
- 任何混合 CJS / ESM 的 Node 项目,产出物目录必须有就近 `package.json` 明确 type
- 一次性 `build` 容易漏掉 dev 模式的同样问题,凡是 `tsc --watch` 的 dev 流程都要同步处理

## 相关文件

- `scripts/write-pkg-type.mjs` — 写 `{"type":"commonjs"}` 的工具
- `scripts/dev.mjs` — dev 启动入口
- `package.json` — `"build:main"` / `"build:preload"` / `"build:renderer"` 脚本
