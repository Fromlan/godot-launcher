import { AppConfig, DEFAULT_APP_CONFIG } from '../../shared/types/settings';
import { SCHEMA_VERSION } from '../../shared/constants/schema';
import { getConfigPath } from '../utils/path';
import { readJsonSafe, writeJsonAtomic, injectSchemaVersion } from '../utils/migrate';
import { setAutoLaunch } from '../autoLaunch';
import { createLogger } from '../utils/logger';

const log = createLogger('settings-service');

type StoredAppConfig = AppConfig & { schemaVersion: number };

async function readConfig(): Promise<AppConfig> {
  const stored = await readJsonSafe<StoredAppConfig>(getConfigPath());
  if (!stored) return { ...DEFAULT_APP_CONFIG };
  const migrated = injectSchemaVersion(stored, SCHEMA_VERSION);
  // 缺字段时填默认值(向后兼容)
  const { schemaVersion: _sv, ...rest } = migrated;
  return { ...DEFAULT_APP_CONFIG, ...rest } as AppConfig;
}

async function writeConfig(cfg: AppConfig): Promise<void> {
  const payload: StoredAppConfig = { schemaVersion: SCHEMA_VERSION, ...cfg };
  await writeJsonAtomic(getConfigPath(), payload);
}

export async function getSettings(): Promise<AppConfig> {
  return readConfig();
}

export async function setSettings(patch: Partial<AppConfig>): Promise<AppConfig> {
  const cur = await readConfig();
  const next = { ...cur, ...patch };
  if (patch.autoLaunch !== undefined && patch.autoLaunch !== cur.autoLaunch) {
    try {
      // setAutoLaunch 内部自带守卫(仅在 app.isPackaged 时实际写入注册表)
      // 这里再覆盖一次防御,避免 settingsService 直接被外部模块调用时漏守卫
      const { app } = await import('electron');
      if (app.isPackaged) {
        setAutoLaunch(next.autoLaunch);
      } else {
        log.info('setSettings autoLaunch ignored (dev mode)');
      }
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