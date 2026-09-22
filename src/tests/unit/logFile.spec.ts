import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import {
  appendLog,
  listLogFiles,
  readLogTail,
  purgeOldLogs,
  clearAllLogs,
  todayKey,
  todayFileName,
  MAX_FILE_BYTES,
  MAX_FILES_PER_DAY,
  MAX_TAIL_BYTES,
  ensureLogDir
} from '../../main/utils/logFile';

let tmp: string;

beforeEach(async () => {
  tmp = path.join(os.tmpdir(), "gl-log-" + Math.random().toString(36).slice(2));
  process.env.GL_DATA_DIR = tmp;
  await fs.mkdir(tmp, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("todayKey / todayFileName", () => {
  it("todayKey 输出 yyyy-mm-dd", () => {
    expect(todayKey(new Date("2026-09-22T16:00:00Z"))).toBe("2026-09-22");
    expect(todayKey(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01-01");
  });

  it("todayFileName 形如 app-YYYY-MM-DD.log", () => {
    expect(todayFileName(new Date("2026-09-22T00:00:00Z"))).toBe("app-2026-09-22.log");
  });
});

describe("ensureLogDir", () => {
  it("在 user data/logs 下创建目录", async () => {
    const dir = await ensureLogDir();
    expect(dir).toBe(path.join(tmp, "logs"));
    const stat = await fs.stat(dir);
    expect(stat.isDirectory()).toBe(true);
  });

  it("目录已存在时不报错", async () => {
    await ensureLogDir();
    await expect(ensureLogDir()).resolves.toBe(path.join(tmp, "logs"));
  });
});

describe("appendLog", () => {
  it("写入一行到 app-today.log", async () => {
    await appendLog("hello world\n");
    const file = path.join(tmp, "logs", todayFileName());
    const content = await fs.readFile(file, "utf-8");
    expect(content).toBe("hello world\n");
  });

  it("多次 append 顺序追加", async () => {
    await appendLog("a\n");
    await appendLog("b\n");
    await appendLog("c\n");
    const file = path.join(tmp, "logs", todayFileName());
    const content = await fs.readFile(file, "utf-8");
    expect(content).toBe("a\nb\nc\n");
  });

  it("appendLog 内部失败不抛错(目录不可写时降级 stderr)", async () => {
    // 模拟磁盘写入失败:把 logs 设为只读文件
    const dir = path.join(tmp, "logs");
    await fs.mkdir(dir);
    const blocker = path.join(dir, "blocker");
    await fs.writeFile(blocker, "x");
    // 把 blocker 当作目录,appendFile 会 EEXIST/ENOTDIR
    process.env.GL_DATA_DIR = blocker;
    await expect(appendLog("nope\n")).resolves.toBeUndefined();
    process.env.GL_DATA_DIR = tmp;
  });
});

describe("listLogFiles", () => {
  it("空目录返回 []", async () => {
    const list = await listLogFiles();
    expect(list).toEqual([]);
  });

  it("只识别 app-*.log", async () => {
    const dir = path.join(tmp, "logs");
    await fs.mkdir(dir);
    await fs.writeFile(path.join(dir, "app-2026-09-22.log"), "x");
    await fs.writeFile(path.join(dir, "foo.txt"), "x");
    await fs.writeFile(path.join(dir, "not-a-log.log"), "x");
    const list = await listLogFiles();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("app-2026-09-22.log");
    expect(list[0].sizeBytes).toBe(1);
  });

  it("按 mtimeMs 倒序", async () => {
    const dir = path.join(tmp, "logs");
    await fs.mkdir(dir);
    const a = path.join(dir, "app-2026-09-20.log");
    const b = path.join(dir, "app-2026-09-22.log");
    await fs.writeFile(a, "old");
    await new Promise((r) => setTimeout(r, 30));
    await fs.writeFile(b, "new");
    const list = await listLogFiles();
    expect(list.map((l) => l.name)).toEqual(["app-2026-09-22.log", "app-2026-09-20.log"]);
  });
});

describe("readLogTail", () => {
  it("返回完整内容(小于 maxBytes)", async () => {
    const dir = path.join(tmp, "logs");
    await fs.mkdir(dir);
    const file = path.join(dir, "app-2026-09-22.log");
    await fs.writeFile(file, "line1\nline2\nline3\n");
    const content = await readLogTail("app-2026-09-22.log");
    expect(content).toBe("line1\nline2\nline3\n");
  });

  it("只读取末尾 maxBytes 字节", async () => {
    const dir = path.join(tmp, "logs");
    await fs.mkdir(dir);
    const file = path.join(dir, "app-2026-09-22.log");
    const head = "a".repeat(1000);
    const tail = "Z".repeat(10);
    await fs.writeFile(file, head + tail);
    const content = await readLogTail("app-2026-09-22.log", 20);
    expect(content.length).toBe(20);
    expect(content.endsWith("Z".repeat(10))).toBe(true);
  });

  it("不存在文件返回空字符串", async () => {
    expect(await readLogTail("app-2026-09-22.log")).toBe("");
  });

  it("防路径穿越:name 含 / 或 \\ 返回空", async () => {
    expect(await readLogTail("../foo.log")).toBe("");
    expect(await readLogTail("..\\foo.log")).toBe("");
    expect(await readLogTail("/etc/passwd")).toBe("");
    expect(await readLogTail("")).toBe("");
    expect(await readLogTail(".secret.log")).toBe("");
  });

  it("不符合 app-*.log 命名返回空", async () => {
    expect(await readLogTail("not-a-log.log")).toBe("");
    expect(await readLogTail("app-foo.txt")).toBe("");
    expect(await readLogTail("random-name")).toBe("");
  });

  it("目录而不是文件时返回空", async () => {
    const dir = path.join(tmp, "logs");
    await fs.mkdir(dir);
    await fs.mkdir(path.join(dir, "app-2026-09-22.log"));
    expect(await readLogTail("app-2026-09-22.log")).toBe("");
  });
});

describe("rotate via appendLog", () => {
  it("超过 MAX_FILE_BYTES 时旋转为 .1.log", async () => {
    const dir = path.join(tmp, "logs");
    await fs.mkdir(dir);
    // 先写一个恰好达到阈值的大块
    const big = "X".repeat(MAX_FILE_BYTES);
    await fs.writeFile(path.join(dir, todayFileName()), big);
    // 再追加一行,应触发 rotate
    await appendLog("tiny\n");
    const files = await fs.readdir(dir);
    expect(files.sort()).toContain(todayFileName());
    expect(files.sort()).toContain(todayFileName().replace(".log", ".1.log"));
    // .1.log 应该是初始大块的内容
    const rotated = await fs.readFile(path.join(dir, todayFileName().replace(".log", ".1.log")), "utf-8");
    expect(rotated.length).toBe(MAX_FILE_BYTES);
    // 当前文件只剩新追加的一行
    const cur = await fs.readFile(path.join(dir, todayFileName()), "utf-8");
    expect(cur).toBe("tiny\n");
  });

  it("连续多次触发 rotate,旧文件被覆盖滚动", async () => {
    const dir = path.join(tmp, "logs");
    await fs.mkdir(dir);
    const file = path.join(dir, todayFileName());
    for (let i = 1; i <= MAX_FILES_PER_DAY + 1; i++) {
      await fs.writeFile(file, "X".repeat(MAX_FILE_BYTES));
      await appendLog("round-" + i + "\n");
    }
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".log"));
    // 应当有当前文件 + 至多 MAX_FILES_PER_DAY 个滚动文件
    expect(files.length).toBeLessThanOrEqual(MAX_FILES_PER_DAY + 1);
  });
});

describe("purgeOldLogs", () => {
  it("删除超过 MAX_LOG_AGE_DAYS 的旧日志", async () => {
    const dir = path.join(tmp, "logs");
    await fs.mkdir(dir);
    const recent = path.join(dir, "app-2026-09-22.log");
    await fs.writeFile(recent, "new");
    // 制造一个 mtime 极老的文件(直接 stat 后改 mtime)
    const old = path.join(dir, "app-2000-01-01.log");
    await fs.writeFile(old, "old");
    const farPast = (Date.now() - 60 * 24 * 60 * 60 * 1000) / 1000;
    await fs.utimes(old, farPast, farPast);
    const purged = await purgeOldLogs(new Date("2026-09-22"));
    expect(purged).toBe(1);
    const after = await fs.readdir(dir);
    expect(after).toContain("app-2026-09-22.log");
    expect(after).not.toContain("app-2000-01-01.log");
  });

  it("目录为空时不报错", async () => {
    expect(await purgeOldLogs()).toBe(0);
  });
});

describe("clearAllLogs", () => {
  it("只删除 app-*.log,保留其他文件", async () => {
    const dir = path.join(tmp, "logs");
    await fs.mkdir(dir);
    await fs.writeFile(path.join(dir, "app-2026-09-22.log"), "x");
    await fs.writeFile(path.join(dir, "app-2026-09-22.1.log"), "y");
    await fs.writeFile(path.join(dir, "settings.json"), "keep");
    const cleared = await clearAllLogs();
    expect(cleared).toBe(2);
    const after = await fs.readdir(dir);
    expect(after).toEqual(["settings.json"]);
  });
});

describe("constants", () => {
  it("MAX_FILE_BYTES = 1MB", () => {
    expect(MAX_FILE_BYTES).toBe(1024 * 1024);
  });
  it("MAX_TAIL_BYTES = 256KB", () => {
    expect(MAX_TAIL_BYTES).toBe(256 * 1024);
  });
});
