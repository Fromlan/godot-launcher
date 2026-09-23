import { describe, it, expect } from 'vitest';
import {
  FEATURED_TAGS,
  deriveMono,
  type AssetTag
} from '../../shared/types/plugin';

describe('FEATURED_TAGS', () => {
  it('包含 2D / 3D / 音频 / 模板 / 特效', () => {
    expect(FEATURED_TAGS).toEqual(['2d', '3d', 'audio', 'template', 'vfx']);
  });

  it('as const 的类型约束能在编译期捕获非常量变更', () => {
    // as const 是类型层面 readonly;运行时 push 不抛。
    // 这里只在文档层断言长度恒为 5,避免误改。
    expect(FEATURED_TAGS.length).toBe(5);
  });
});

describe('deriveMono', () => {
  const tag = (slug: string, featured = false): AssetTag => ({ slug, displayName: slug, featured });
  const item = (slugs: string[]) => ({ tags: slugs.map((s) => tag(s)) });

  it('空 tags 不支持 Mono', () => {
    expect(deriveMono(item([]))).toBe(false);
  });

  it('包含 csharp / mono / csharpdotnet 任一即视为支持', () => {
    expect(deriveMono(item(['csharp']))).toBe(true);
    expect(deriveMono(item(['mono']))).toBe(true);
    expect(deriveMono(item(['csharpdotnet']))).toBe(true);
  });

  it('大小写不敏感', () => {
    expect(deriveMono(item(['CSharp']))).toBe(true);
    expect(deriveMono(item(['MONO']))).toBe(true);
  });

  it('无关的 slugs 不被误判为 Mono', () => {
    expect(deriveMono(item(['2d']))).toBe(false);
    expect(deriveMono(item(['csharpdotnet5']))).toBe(false);
    expect(deriveMono(item(['tooling']))).toBe(false);
  });
});
