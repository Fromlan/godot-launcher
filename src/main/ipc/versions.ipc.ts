import { ipcMain, BrowserWindow, dialog } from 'electron';
import { IPC_CHANNELS, IPC_EVENTS, type IpcResult } from '../../shared/types/ipc';
import type { GodotVersion, ReleaseInfo, DownloadProgress } from '../../shared/types/godot';
import * as godotMgr from '../services/godotManager';
import * as releaseSrc from '../services/godotReleaseSource';
import { toIpc } from './result';
import { createLogger } from '../utils/logger';

const log = createLogger('ipc:versions');

interface DownloadArgs {
  tag: string;
  channel: 'stable' | 'mono';
  force?: boolean;
}

let activeWindow: () => BrowserWindow | null = () => null;
export function bindVersionsIpc(getWindow: () => BrowserWindow | null): void {
  activeWindow = getWindow;

  ipcMain.handle(IPC_CHANNELS.versionsList, (): Promise<IpcResult<GodotVersion[]>> =>
    toIpc(() => godotMgr.listInstalled())
  );

  ipcMain.handle(
    IPC_CHANNELS.versionsReleases,
    (_e, args: { forceRefresh?: boolean } = {}): Promise<IpcResult<{ releases: ReleaseInfo[]; cachedAt: string | null; stale: boolean }>> =>
      toIpc(() => releaseSrc.listReleases(args))
  );

  ipcMain.handle(
    IPC_CHANNELS.versionsDownload,
    async (_e, args: DownloadArgs): Promise<IpcResult<GodotVersion>> => {
      return toIpc(async () => {
        const { releases } = await releaseSrc.listReleases();
        const match = releases.find((r) => r.tag === args.tag && r.channel === args.channel);
        if (!match) throw new Error('未找到对应的 Godot 版本');
        const onProgress = (p: DownloadProgress) => {
          activeWindow()?.webContents.send(IPC_EVENTS.versionsDownloadProgress, p);
        };
        log.info('start download', args);
        return godotMgr.downloadAndInstall({ tag: args.tag, channel: args.channel, release: match, onProgress });
      });
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.versionsRemove,
    (_e, args: { versionId: string }): Promise<IpcResult<void>> =>
      toIpc(() => godotMgr.removeVersion(args.versionId))
  );

  ipcMain.handle(
    IPC_CHANNELS.versionsSetDefault,
    (_e, args: { versionId: string }): Promise<IpcResult<void>> =>
      toIpc(async () => {
        const { setDefaultVersion } = await import('../services/settingsService');
        await setDefaultVersion(args.versionId);
      })
  );
  ipcMain.handle(
    IPC_CHANNELS.versionsImport,
    async (_e, args?: { executablePath?: string }): Promise<IpcResult<GodotVersion>> => {
      return toIpc(async () => {
        let p = args?.executablePath;
        if (!p) {
          const result = await dialog.showOpenDialog({
            title: '选择 Godot 编辑器可执行文件',
            properties: ['openFile'],
            filters: [{ name: 'Godot Executable', extensions: ['exe'] }]
          });
          if (result.canceled || result.filePaths.length === 0) throw new Error('未选择文件');
          p = result.filePaths[0];
        }
        return godotMgr.importExisting({ executablePath: p });
      });
    }
  );
}
