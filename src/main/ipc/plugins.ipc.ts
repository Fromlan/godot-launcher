import { ipcMain } from 'electron';
import { IPC_CHANNELS, type IpcResult } from '../../shared/types/ipc';
import type {
  PluginEntry,
  AssetLibSearchQuery,
  AssetLibSearchResult,
  AssetLibItem
} from '../../shared/types/plugin';
import * as plugins from '../services/pluginManager';
import * as assetLib from '../services/assetLibClient';
import * as projects from '../services/projectManager';
import { getPluginCacheDir } from '../utils/path';
import { toIpc } from './result';

export function bindPluginsIpc(): void {
  ipcMain.handle(
    IPC_CHANNELS.pluginsList,
    async (_e, args: { projectId: string }): Promise<IpcResult<PluginEntry[]>> => {
      return toIpc(async () => {
        const list = await projects.listProjects();
        const p = list.find((x) => x.id === args.projectId);
        if (!p) throw new Error('项目不存在');
        return plugins.listLocalPlugins(p.path);
      });
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.pluginsToggle,
    async (_e, args: { projectId: string; pluginName: string }): Promise<IpcResult<PluginEntry>> => {
      return toIpc(async () => {
        const list = await projects.listProjects();
        const p = list.find((x) => x.id === args.projectId);
        if (!p) throw new Error('项目不存在');
        return plugins.togglePlugin(p.path, args.pluginName);
      });
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.pluginsAssetLibSearch,
    (_e, q: AssetLibSearchQuery): Promise<IpcResult<AssetLibSearchResult>> =>
      toIpc(() => assetLib.search(q))
  );

  /** slug 二元组作为详情入参(取代旧整数 id) */
  ipcMain.handle(
    IPC_CHANNELS.pluginsAssetLibDetail,
    (_e, args: { publisherSlug: string; assetSlug: string }): Promise<IpcResult<AssetLibItem>> =>
      toIpc(() => assetLib.getAsset(args.publisherSlug, args.assetSlug))
  );

  /**
   * 主进程 install 内部:
   *   1) 再读一次项目,拿到 godotVersion 用于 release 选择
   *   2) 调 installFromAssetLib(item, {projectGodotVersion}) 由主进程自行拉 release
   */
  ipcMain.handle(
    IPC_CHANNELS.pluginsInstallFromAssetLib,
    async (
      _e,
      args: { projectId: string; item: AssetLibItem }
    ): Promise<IpcResult<PluginEntry>> => {
      return toIpc(async () => {
        const list = await projects.listProjects();
        const p = list.find((x) => x.id === args.projectId);
        if (!p) throw new Error('项目不存在');
        return plugins.installFromAssetLib({
          projectPath: p.path,
          item: args.item,
          cacheDir: getPluginCacheDir(),
          projectGodotVersion: p.godotVersion
        });
      });
    }
  );
}
