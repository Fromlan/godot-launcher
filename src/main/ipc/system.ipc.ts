import { ipcMain, app } from 'electron';
import { IPC_CHANNELS, type IpcResult } from '../../shared/types/ipc';
import type { AppConfig } from '../../shared/types/settings';
import * as settings from '../services/settingsService';
import { checkForUpdate, getUpdaterStatus } from '../updater';
import { getLogsDir } from '../utils/path';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { toIpc } from './result';

export function bindSystemIpc(): void {
  ipcMain.handle(IPC_CHANNELS.systemGetSettings, (): Promise<IpcResult<AppConfig>> =>
    toIpc(() => settings.getSettings())
  );

  ipcMain.handle(
    IPC_CHANNELS.systemSetSettings,
    (_e, args: { patch: Partial<AppConfig> }): Promise<IpcResult<AppConfig>> =>
      toIpc(() => settings.setSettings(args.patch))
  );

  ipcMain.handle(
    IPC_CHANNELS.systemCheckUpdate,
    (): Promise<IpcResult<{ status: string; info?: unknown }>> =>
      toIpc(async () => {
        const result = await checkForUpdate();
        return { status: getUpdaterStatus(), info: result };
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.systemGetAppVersion,
    (): Promise<IpcResult<{ version: string; electron: string; node: string }>> =>
      toIpc(() => ({
        version: app.getVersion(),
        electron: process.versions.electron,
        node: process.versions.node
      }))
  );

  ipcMain.handle(
    IPC_CHANNELS.systemRevealLogs,
    (): Promise<IpcResult<void>> =>
      toIpc(async () => {
        const dir = getLogsDir();
        await fs.mkdir(dir, { recursive: true });
        spawn('explorer.exe', [dir], { detached: true, stdio: 'ignore' }).unref();
      })
  );
}
