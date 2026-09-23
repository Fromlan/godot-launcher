/**
 * AssetLib 兼容层 — 2026-09 store 切换后此处仅是把 `storeAssetClient` 的导出重命名一下,
 * 保留旧 import 路径以兼容 plugins.ipc.ts / tests。
 *
 * 历史版本从这里拉取整数 ID 的 godot-engine/asset-library API;
 * 现在已经切到 store.godotengine.org/api/v1,详见 storeAssetClient.ts。
 */
export {
  search,
  getAsset,
  listReleases,
  StoreApiError
} from './storeAssetClient';
