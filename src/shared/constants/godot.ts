/**
 * Godot 相关的远端源信息
 */

/** Godot 官方 GitHub 仓库(mirror of godot-builds) */
export const GODOT_RELEASES_REPO = {
  owner: 'godotengine',
  repo: 'godot-builds'
} as const;

/** Godot 官方 AssetLib API */
export const ASSET_LIB_BASE = 'https://godotengine.org/asset-library/api';

/** releases 缓存有效期 */
export const RELEASES_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

/** AssetLib 默认页大小 */
export const ASSET_LIB_PAGE_SIZE = 24;

/** AssetLib 每页最大条目 */
export const ASSET_LIB_MAX_PAGES = 50;

/** Godot 编辑器启动基础参数 */
export const GODOT_DEFAULT_ARGS: string[] = ['--editor'];

/** Godot 文件名模式(用于从 zip 中识别) */
export const GODOT_EXE_NAMES = {
  win64: 'Godot_v4.exe',
  win64Template: 'Godot_v4.windows.template_release.x86_64.exe'
} as const;

/** Godot 平台标识 */
export type GodotPlatform = 'win64';

/** Godot 构建通道 */
export type GodotChannel = 'stable' | 'mono';

/** 当前支持的 Godot 大版本号(Godot 4.x) */
export const GODOT_MAJOR_VERSION = 4 as const;
