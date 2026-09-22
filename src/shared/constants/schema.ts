/**
 * Schema 版本常量。
 * - v1: 初始版本,添加 schemaVersion 字段
 * - 后续版本变更必须:
 *   1. 仅新增字段(不要改名 / 删旧字段)
 *   2. 缺字段时填默认值
 *   3. 在 src/main/services/migrate.ts 中实现迁移函数
 */
export const SCHEMA_VERSION = 1 as const;

/** 各 manifest 文件的当前 schemaVersion */
export const MANIFEST_SCHEMAS = {
  config: SCHEMA_VERSION,
  versions: SCHEMA_VERSION,
  projects: SCHEMA_VERSION,
  releasesCache: SCHEMA_VERSION
} as const;
