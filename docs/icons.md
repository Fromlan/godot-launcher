# 图标系统 (Icon System)

> 截至 v0.3 — 全局统一使用内联 SVG 图标,色随父级 `color` 自动适配主题。

## 来源

项目图标来自 [addons/at-icons](https://godotengine.org/asset-library/asset/2311)(开源 Godot 编辑器图标集):

- **仓库**: `addons/at-icons/`
- **6 个分类 × 618 个图标 = 3 708 个 SVG**(完整包)
- **viewBox** 统一 `0 0 16 16`,矢量缩放无损
- **样式** 极简,Lucide 风格

Launcher 只精选 **19 个** 子集,完整复制到 `src/renderer/assets/icons/`。

## 已选图标清单

| 文件 | 视觉 | 用途 |
|------|------|------|
| `atom.svg` | 原子 | 侧栏·版本管理;空状态·版本列表 |
| `folder.svg` | 关闭的文件夹 | 侧栏·项目管理;空状态·项目 |
| `folder-open.svg` | 打开的文件夹 | 按钮·打开目录、导入本地编辑器 |
| `cog.svg` | 齿轮 | 侧栏·插件管理;空状态·本地插件 |
| `wrench.svg` | 扳手 | 侧栏·设置(与 cog 区分) |
| `palette.svg` | 调色板 | 侧栏底部·「主题」前缀 |
| `check.svg` | ✓ | Toast·成功 |
| `cross.svg` | ✕ | Toast·错误 |
| `cross-square.svg` | 方块 ✕ | (备用) |
| `lightning.svg` | 闪电 | Toast·警告;空状态·搜索失败 |
| `info-circle.svg` | ⓘ | Toast·信息;空状态·通用提示 |
| `refresh.svg` | 循环箭头 | 按钮·刷新、重下版本、检查更新 |
| `download.svg` | 云 + 下箭头 | 按钮·下载、安装、重下 |
| `play.svg` | 三角形 | 按钮·运行项目 |
| `trash.svg` | 垃圾桶 | 按钮·删除、移除、清空 |
| `pencil.svg` | 铅笔 | 按钮·重命名 |
| `link.svg` | 链接链 | 按钮·商店页外链 |
| `star.svg` | 五角星 | 评分·默认版本标记 |
| `search-empty.svg` | 放大镜 | 空状态·搜索无结果 |

## 图标实现

### 1. 文件位置

    src/renderer/assets/icons/*.svg    19 个精选 SVG (viewBox="0 0 16 16", fill="currentColor")

每个 SVG 已规范化(可在 `scripts/normalize-icons.mjs` 中重新生成):

- `fill="currentColor"` — 颜色由 CSS `color` 控制
- 移除 `width="16" height="16"` — 由 CSS `width` / `height` / `font-size` 决定
- 保留 `viewBox="0 0 16 16"` — path data 缩放参考

### 2. Icon 组件 (`src/renderer/components/Icon.tsx`)

**关键点:**

- 用 `import.meta.glob("../assets/icons/*.svg", { query: "?raw", eager: true })` 同步加载所有 SVG 为字符串
- 抽取每个 SVG 的 `viewBox` 和内部 path — **必须传 `viewBox` 到 React `<svg>`,否则 SVG 默认 `overflow: hidden` 会裁掉超出 width/height 范围的 path**
- 通过 `dangerouslySetInnerHTML` 注入 path — 比 React JSX 重写更轻量
- 强类型 `IconName` 联合类型保证拼写错误编译时失败
- 默认 `size: 16`,与 Godot 编辑器一致

**用法:**

    import Icon from "./components/Icon";

    // 默认 16px,继承父 color
    <Icon name="cog" />

    // 自定义 size
    <Icon name="refresh" size={14} />

    // 加语义色 class
    <Icon name="trash" size={13} className="icon-danger" />

### 3. CSS 工具类 (`src/renderer/styles/globals.css`)

    .icon { display: inline-block; vertical-align: -0.125em; fill: currentColor; flex-shrink: 0; pointer-events: none; }
    .icon-primary { color: var(--gd-primary); }
    .icon-success { color: var(--gd-success); }
    .icon-warning { color: var(--gd-warning); }
    .icon-danger  { color: var(--gd-danger); }
    .icon-muted   { color: var(--gd-text-muted); }

## 添加新图标

如果 Launcher 未来需要更多图标:

1. **找到合适 SVG**: 在 `addons/at-icons/control/` 找(每个图标一个文件),或在 [Lucide](https://lucide.dev) / [Heroicons](https://heroicons.com) 找风格一致的 16×16 SVG
2. **规范化**: 把 `fill="#xxx"` 替换为 `fill="currentColor"`,移除 `width="16" height="16"`
3. **复制到 `src/renderer/assets/icons/<name>.svg`**
4. **更新 `IconName` 联合类型** 在 `src/renderer/components/Icon.tsx` 加入新名字
5. **使用**: `<Icon name="<new-name>" />`

## 为什么不直接用整个 at-icons 包

完整包 3 708 个图标 ≈ ~600 KB,Launcher 只用 19 个 (~12 KB)。精选子集:

- 应用体积小
- 强制审查每个图标的语义是否合适(避免装个"随便的图标")
- 切换图标库时(比如换 Lucide)只需替换 19 个文件,影响可控

## 与原 Unicode 字符的对比

修复前:

    <NavLink><span>{"\u25C8"}</span>版本管理</NavLink>

修复后:

    <NavLink>
      <span className="sidebar-link-icon"><Icon name="atom" /></span>版本管理
    </NavLink>

**优点:**

- 矢量缩放无锯齿
- 色随主题(`color: currentColor`),hover / active / 不同主题色自动适配
- 视觉一致(同源图标库,风格统一)
- 可访问(`aria-hidden="true"`)
