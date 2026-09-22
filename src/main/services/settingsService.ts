import { promises as fs } from 'node:fs';
import { AppConfig, DEFAULT_APP_CONFIG } from '../../shared/types/settings';
import { ensureDir, getConfigPath, getUserDataDir } from '../utils/path';
import { setAutoLaunch } from '../autoLaunch';
import { createLogger } from '../utils/logger';

const log = createLogger('settings-service');

async function readConfig(): Promise<AppConfig> {
  try {
    const buf = await fs.readFile(getConfigPath(), 'utf-8');
    return { ...DEFAULT_APP_CONFIG, ...(JSON.parse(buf) as Partial<AppConfig>) };
  } catch {
    return { ...DEFAULT_APP_CONFIG };
  }
}

async function writeConfig(cfg: AppConfig): Promise<void> {
  await ensureDir(getUserDataDir());
  await fs.writeFile(getConfigPath(), JSON.stringify(cfg, null, 2), 'utf-8');
}

export async function getSettings(): Promise<AppConfig> {
  return readConfig();
}

export async function setSettings(patch: Partial<AppConfig>): Promise<AppConfig> {
  const cur = await readConfig();
  const next = { ...cur, ...patch };
  // 联动开机自启
  if (patch.autoLaunch !== undefined && patch.autoLaunch !== cur.autoLaunch) {
    try {
      setAutoLaunch(next.autoLaunch);
    } catch (err) {
      log.warn('setAutoLaunch failed', err);
    }
  }
  await writeConfig(next);
  return next;
}

export async function setDefaultVersion(versionId: string | undefined): Promise<void> {
  await setSettings({ defaultVersionId: versionId });
}
