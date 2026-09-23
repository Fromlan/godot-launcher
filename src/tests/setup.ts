/**
 * vitest 全局 setup 文件。
 *
 * 当前主要做一件事:把 unit 测试常用 mock 集中管理,避免每个 spec 重复 `vi.mock('electron')`。
 * 后续可扩展为:
 *   - 注册全局 fetch mock 工厂
 *   - 设置 `process.env.GL_DATA_DIR` 默认值
 *   - 注册断言扩展(若有自定义 matcher)
 */
import { vi } from 'vitest';

// 默认 electron mock(给不显式 mock 的 spec 提供兜底)
// 单个 spec 内的 vi.mock 会覆盖此处。
vi.mock('electron', () => ({
  app: {
    setLoginItemSettings: vi.fn(),
    getLoginItemSettings: () => ({ openAtLogin: false }),
    isPackaged: true,
    getPath: () => process.cwd(),
    getVersion: () => '0.0.0-test',
    whenReady: () => Promise.resolve()
  }
}));