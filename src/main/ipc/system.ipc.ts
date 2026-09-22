import { ipcMain, app } from 'electron';
import { IPC_CHANNELS, type IpcResult, type LogFileInfo } from '../../shared/types/ipc';
import type { AppConfig } from '../../shared/types/settings';
import * as settings from '../services/settingsService';
import { checkForUpdate, getUpdaterStatus } from '../updater';
import { getLogsDir } from '../utils/path';
import { listLogFiles, readLogTail, clearAllLogs } from '../utils/logFile';
import { flushLogs } from '../utils/logger';
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
        spawn("explorer.exe", [dir], { detached: true, stdio: "ignore" }).unref();
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.systemListLogs,
    (): Promise<IpcResult<LogFileInfo[]>> =>
      toIpc(async () => {
        // 顺手刷盘,保证 reveal 后的 explorer 看到最新内容
        await flushLogs();
        return listLogFiles();
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.systemReadLog,
    (_e, args: { name: string; maxBytes?: number }): Promise<IpcResult<string>> =>
      toIpc(async () => {
        await flushLogs();
        return readLogTail(args.name, args.maxBytes);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.systemClearLogs,
    (): Promise<IpcResult<{ cleared: number }>> =>
      toIpc(async () => {
        await flushLogs();
        const cleared = await clearAllLogs();
        return { cleared };
      })
  );
}