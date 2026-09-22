/** 项目内已安装的插件(addons/<name>/plugin.cfg 解析) */
export interface PluginEntry {
  /** addons 下的目录名 */
  name: string;
  /** 完整路径 */
  path: string;
  /** 来自 plugin.cfg 的 [plugin] name 字段 */
  displayName: string;
  /** 来自 plugin.cfg 的 description */
  description: string;
  /** 作者 */
  author: string;
  /** 版本 */
  version: string;
  /** 脚本文件 */
  script?: string;
  /** 当前是否启用(plugin.cfg 存在且未被改名为 .disabled) */
  enabled: boolean;
}

/** 官方 AssetLib 单个资源 */
export interface AssetLibItem {
  /** 资源 id(整数字符串) */
  id: string;
  /** 标题 */
  title: string;
  /** 作者 */
  author: string;
  /** 描述 */
  description: string;
  /** Godot 兼容版本,例如 ['4.4','4.3'] */
  godotVersions: string[];
  /** 是否支持 .NET */
  supportsMono: boolean;
  /** 分类 */
  category: string;
  /** 下载 URL(zip) */
  downloadUrl?: string;
  /** 最新版本号 */
  version: string;
  /** 修改时间 ISO */
  modifyDate: string;
}

/** AssetLib 搜索结果 */
export interface AssetLibSearchResult {
  items: AssetLibItem[];
  page: number;
  total: number;
  pageSize: number;
}

/** AssetLib 搜索参数 */
export interface AssetLibSearchQuery {
  keyword?: string;
  /** 限定 Godot 版本(例如 '4.4');不传则不过滤 */
  godotVersion?: string;
  category?: string;
  page?: number;
  pageSize?: number;
}
