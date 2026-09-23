# 发布流程

本项目的发布全自动化，在 GitHub Actions 上完成。本地无需手动 bump 版本或打 tag。

## TL;DR

最常用的发布命令（minor 版本递增、正式发布）：

```bash
gh workflow run release.yml -f bump=minor
```

5–10 分钟后，[GitHub Releases](https://github.com/Fromlan/godot-launcher/releases) 自动出现新版本，附带安装包、SHA256SUMS 和自动生成的 changelog。

## 触发方式

### 方式 1: GitHub CLI（推荐）

```bash
# patch: 0.1.0 → 0.1.1
gh workflow run release.yml -f bump=patch

# minor: 0.1.0 → 0.2.0
gh workflow run release.yml -f bump=minor

# major: 0.1.0 → 1.0.0
gh workflow run release.yml -f bump=major

# prerelease (RC): 0.1.0 → 0.2.0-0
gh workflow run release.yml -f bump=preminor -f prerelease=true

# draft: 0.1.0 → 0.1.1，但先创建为草稿（发布前可手动编辑）
gh workflow run release.yml -f bump=patch -f draft=true

# none: 不 bump，仅重跑当前版本的 release
gh workflow run release.yml -f bump=none
```

### 方式 2: GitHub Web UI

打开 https://github.com/Fromlan/godot-launcher/actions/workflows/release.yml，点右上角 **Run workflow**，选择 main 分支，填表（bump 类型 / 是否 prerelease / 是否 draft），点击绿色 **Run workflow** 按钮。

### 方式 3: 手动 tag push（兜底 / CI 集成）

仅当 GitHub Actions 不可用时使用：

```bash
# 1. 本地 bump（npm version 自动 commit + tag）
npm version minor
# 2. push commit + tag
git push origin main --follow-tags
```

push `v*` tag 会触发同一个 workflow，自动跑 build + release。已在 GitHub 上存在同名 release 的 tag 会被跳过（幂等保护）。

## 自动执行的步骤

以 `gh workflow run release.yml -f bump=minor` 为例，workflow 会依次执行：

1. **bump 版本** — `npm version minor` 更新 `package.json`（如 `0.1.0` → `0.2.0`）
2. **同步 lock** — `npm install --package-lock-only` 更新 `package-lock.json`
3. **生成 changelog** — 读取上一次 tag 之后的所有 conventional commits，按类型分组写入 `CHANGELOG.md`
4. **提交** — bot commit `chore(release): vX.Y.Z` 推送到 main
5. **build** — `npm run package`（electron-builder 打包 Windows NSIS x64）
6. **SHA256SUMS** — 生成 `out/SHA256SUMS.txt`
7. **创建 Release** — 创建 tag `vX.Y.Z`、上传 `exe / latest.yml / latest.blockmap / SHA256SUMS.txt`，使用 changelog 内容作为发布说明

tag push 路径会跳过 1–4 步，从第 5 步开始。

## Conventional Commits

CHANGELOG 自动从 commit 标题识别类型，请确保 commit message 遵循约定：

| 类型 | 进入区块 | 例子 |
|---|---|---|
| `feat:` | Features | `feat(plugin-manager): 支持 store 安装` |
| `fix:` | Bug Fixes | `fix(dev): 修复 ESM/CJS 启动错误` |
| `perf:` | Performance | `perf: 启动速度优化` |
| `refactor:` | Refactors | `refactor(asset-store): 抽离 client` |
| `test:` | Tests | `test: 单元测试覆盖率提升` |
| `docs:` | Documentation | `docs: 同步 README` |
| `build:` | Build System | `build: 升级 vite 5` |
| `ci:` | CI | `ci: 修复 npm ci ERESOLVE` |
| `chore:` | Chores | `chore: 升级依赖` |
| `style:` | Styles | `style: 格式化` |
| `revert:` | Reverts | `revert: 回滚 #123` |
| 其他 / 不匹配 | Other | `Initial commit` |

带 `!` 的 commit（如 `feat(api)!: 重命名 endpoint`）会自动追加 **BREAKING** 标记。

## 本地调试

预览 changelog 生成结果（不写文件）：

```bash
node scripts/release-notes.mjs --print
```

强制覆盖写入：

```bash
node scripts/release-notes.mjs --write
```

脚本会同时产出 `CHANGELOG.md`（完整更新日志）和 `RELEASE_NOTES.md`（仅当前版本段，给 GitHub Release 用）。

## 权限与配置

| Secret | 用途 | 是否必须 |
|---|---|---|
| `GITHUB_TOKEN` | 创建 release、上传 artifacts（默认 workflow 自带 contents: write） | ✅ |
| `GH_TOKEN` | 自定义 PAT，可推回 main（兼容旧版） | 可选，缺省时用 `GITHUB_TOKEN` |

`workflow_dispatch` 触发的 run，bot commit 需要 `contents: write`（已在 workflow `permissions` 中声明）。

## 注意事项

- 同一时间只能跑一个 release job（`concurrency` 锁），新的会排队等待
- 已存在的同名 release 不会被覆盖（push: tags 路径有幂等保护）
- 第一次发版前，仓库可能需要先在 Settings → Actions → General 启用 "Read and write permissions"
- Windows runner 上单次 build 约 3–5 分钟，整流程 5–10 分钟