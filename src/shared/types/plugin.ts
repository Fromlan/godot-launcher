/**
 * AssetLib/Godot Asset Store 新版数据契约。
 *
 * 数据源:https://store.godotengine.org/api/v1
 * 关键变化:
 *   - 资源 ID 由整数 → slug 二元组 {publisherSlug, assetSlug}
 *   - downloadUrl 不在列表/详情里;只在 /releases/{pub}/{slug}/ 中下发给 presign URL(10 分钟有效)
 *   - 不再有单字段 godotVersion/category/supportsMono;改用 tags[] 推断
 *   - 描述是 BBCode + HTML 双形式;列表只读 description,详情展示 body_html
 */

/** Asset 类型(对应 /asset-types/ 端点) */
export type AssetTypeId = 0 | 1;
export const ASSET_TYPE_ADDON: AssetTypeId = 0;
export const ASSET_TYPE_PROJECT: AssetTypeId = 1;
export const ASSET_TYPE_LABEL: Record<AssetTypeId, string> = {
  0: 'Addon',
  1: 'Full Project'
};

/** 单个 tag(featured=true 用于 Plugins 页顶部 tab) */
export interface AssetTag {
  slug: string;
  displayName: string;
  featured: boolean;
}

/** 许可信息 */
export interface AssetLicense {
  type: string;
  url: string;
}

/**
 * Plugins 页与搜索结果共享的 asset 形状。
 *
 * 故意不包含 downloadUrl:详情阶段的 release 由主进程内部从 /releases 拉取,
 * 这样既贴合 IPC contract(plugins.install(item) 入参不带 URL),
 * 也避免前端拿到一个 10 分钟就过期的 presign URL 后又得二次刷新。
 */
export interface AssetLibItem {
  /** 复合主键;与 publisherSlug 一起构成全局唯一 */
  publisherSlug: string;
  assetSlug: string;

  /** 显示名(API 字段名) */
  name: string;
  /** 发布者展示名 */
  publisherName: string;
  /** 简介;可能为 ''(getAsset/detail 会带回更详细的 body_html) */
  description: string;

  /** 0=Addon, 1=Full project(templates/demos) */
  type: AssetTypeId;
  /** 结构化标签(API 字段 tags) */
  tags: AssetTag[];
  /** 许可 */
  license: AssetLicense;
  /** 0 起步;越高越受认可 */
  reviewsScore: number;
  /** 商店精选 */
  featured: boolean;
  /** 缩略图(默认 /static/images/share-image.webp) */
  thumbnailUrl: string;
  /** 商店详情页(可跳转) */
  storeUrl: string;
  /** 外部源(GitHub/Codeberg 等);可能为空 */
  sourceUrl?: string;

  /** 由 tags 推断:C# / Mono 项目显示 mono 角标 */
  supportsMono: boolean;
  /** 最近一次 release 的 created(ISO date) */
  lastUpdated: string;
}

/** 单个 release(= 一份可下载 zip + Godot 版本兼容信息) */
export interface AssetLibRelease {
  id: number;
  version: string;
  stable: boolean;
  /** 兆字节(MB),浮点 */
  sizeMb: number;
  /** ISO date,如 '2026-04-23' */
  created: string;
  /** 主版本 min,次版本 max,如 '4.4' 或 '4.5.1' */
  minGodotVersion?: string;
  maxGodotVersion?: string;
  /** 版本说明(可空) */
  notes?: string;
  /** S3 presigned URL,默认 10 分钟内有效 */
  downloadUrl: string;
}

export type AssetLibSearchSort = 'relevance' | 'updated' | 'rating';

export interface AssetLibSearchQuery {
  keyword?: string;
  page?: number;
  pageSize?: number;
  /** 单一 featured tag 的 slug,与 Plugins 页顶部 tab 对齐 */
  tag?: string;
  /** 项目的 Godot 版本;主进程映射到 API 参数 compatibility */
  godotVersion?: string;
  sort?: AssetLibSearchSort;
  /** false = 含未发布 release 的 demo 资源,默认 true 要求至少有 release */
  requireRelease?: boolean;
}

export interface AssetLibSearchResult {
  items: AssetLibItem[];
  page: number;
  pageSize: number;
  /** total 是字符串(Manticore scroll API 风格) */
  total: string;
  /** 深度分页 cursor(透传上一次响应) */
  scrollToken?: string;
}

/** Plugins 页内置 featured tag 列表(不每次启动 fetch) */
export const FEATURED_TAGS = ['2d', '3d', 'audio', 'template', 'vfx'] as const;
export type FeaturedTagSlug = (typeof FEATURED_TAGS)[number];

/**
 * 由 AssetLibItem.tags 推断是否支持 .NET / Mono
 * - csharp / mono / csharpdotnet 任意命中即视为支持
 */
export function deriveMono(item: { tags: AssetTag[] }): boolean {
  const slugs = new Set(item.tags.map((t) => t.slug.toLowerCase()));
  return slugs.has('csharp') || slugs.has('mono') || slugs.has('csharpdotnet');
}

/** 本地已安装插件(由 addons/<name>/plugin.cfg 解析) */
export interface PluginEntry {
  name: string;
  path: string;
  displayName: string;
  description: string;
  author: string;
  version: string;
  script?: string;
  enabled: boolean;
}

/** 主进程抛出的无兼容 release 错误名(IPC detail 用) */
export const ERR_NO_COMPATIBLE_RELEASE = 'NoCompatibleReleaseError';
