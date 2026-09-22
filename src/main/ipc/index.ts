import { BrowserWindow } from 'electron';
import { bindVersionsIpc } from './versions.ipc';
import { bindProjectsIpc } from './projects.ipc';
import { bindPluginsIpc } from './plugins.ipc';
import { bindSystemIpc } from './system.ipc';

let inited = false;

export function initIpc(getWindow: () => BrowserWindow | null): void {
  if (inited) return;
  inited = true;
  bindSystemIpc();
  bindVersionsIpc(getWindow);
  bindProjectsIpc();
  bindPluginsIpc();
}
