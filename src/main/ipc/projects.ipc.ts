import { ipcMain } from 'electron';
import { IPC_CHANNELS, type IpcResult } from '../../shared/types/ipc';
import type { ProjectEntry, LaunchOptions } from '../../shared/types/project';
import * as projects from '../services/projectManager';
import * as godotMgr from '../services/godotManager';
import * as settings from '../services/settingsService';
import { toIpc } from './result';

export function bindProjectsIpc(): void {
  ipcMain.handle(IPC_CHANNELS.projectsList, (): Promise<IpcResult<ProjectEntry[]>> =>
    toIpc(() => projects.listProjects())
  );

  ipcMain.handle(
    IPC_CHANNELS.projectsAdd,
    (_e, args: { path: string }): Promise<IpcResult<ProjectEntry>> =>
      toIpc(() => projects.addProject(args.path))
  );

  ipcMain.handle(
    IPC_CHANNELS.projectsRemove,
    (_e, args: { id: string }): Promise<IpcResult<void>> =>
      toIpc(() => projects.removeProject(args.id))
  );

  ipcMain.handle(
    IPC_CHANNELS.projectsUpdate,
    (_e, args: { id: string; patch: Partial<ProjectEntry> }): Promise<IpcResult<ProjectEntry>> =>
      toIpc(() => projects.updateProject(args.id, args.patch))
  );

  ipcMain.handle(
    IPC_CHANNELS.projectsLaunch,
    async (
      _e,
      args: { id: string; options?: LaunchOptions }
    ): Promise<IpcResult<{ logFile: string; pid: number | null }>> => {
      return toIpc(async () => {
        const list = await projects.listProjects();
        const project = list.find((p) => p.id === args.id);
        if (!project) throw new Error('项目不存在');
        const cfg = await settings.getSettings();
        const versionId = args.options?.versionId ?? cfg.defaultVersionId;
        const installed = await godotMgr.listInstalled();
        const version = installed.find((v) => v.id === versionId);
        if (!version) throw new Error('未找到对应 Godot 版本,请先在版本页下载或在设置中选择默认版本');
        const extras = [...(cfg.defaultLaunchArgs || []), ...(args.options?.extraArgs || [])];
        const result = await godotMgr.launchProject({ version, project, options: { ...args.options, extraArgs: extras } });
        await projects.markLaunched(project.id);
        return result;
      });
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.projectsReveal,
    (_e, args: { id: string }): Promise<IpcResult<void>> =>
      toIpc(async () => {
        const list = await projects.listProjects();
        const p = list.find((x) => x.id === args.id);
        if (!p) throw new Error('项目不存在');
        await projects.revealInExplorer(p.path);
      })
  );
}