// @vitest-environment jsdom
/**
 * ErrorBoundary 单测。
 *
 * 用 jsdom 渲染,触发子组件抛错,验证 fallback UI 出现且不阻断整体树。
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from '../../renderer/components/ErrorBoundary';

// jsdom 不带 getComputedStyle,提供兜底
if (!window.getComputedStyle) {
  Object.defineProperty(window, 'getComputedStyle', {
    value: () => ({ getPropertyValue: () => '' }),
    writable: true
  });
}

function Boom({ shouldThrow }: { shouldThrow: boolean }): React.ReactElement {
  if (shouldThrow) throw new Error('boom from child');
  return <div data-testid="child">child ok</div>;
}

describe('ErrorBoundary', () => {
  it('子组件正常渲染时不显示 fallback', () => {
    render(
      <ErrorBoundary>
        <Boom shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByTestId('child')).toBeTruthy();
    expect(screen.queryByText('出错了')).toBeNull();
  });

  it('子组件抛错时显示 fallback UI 与错误信息', () => {
    // 抑制 React 的 console.error 噪音
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      render(
        <ErrorBoundary>
          <Boom shouldThrow={true} />
        </ErrorBoundary>
      );
      expect(screen.getByText('出错了')).toBeTruthy();
      expect(screen.getByText('查看错误详情')).toBeTruthy();
      expect(screen.getByText('复制错误')).toBeTruthy();
      expect(screen.getByText('刷新页面')).toBeTruthy();
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it('复制错误按钮触发 handleCopy(无论 clipboard 是否存在)', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      // 强制让 navigator.clipboard?.writeText 走 fallback 路径
      Object.defineProperty(navigator, 'clipboard', {
        value: undefined,
        configurable: true,
        writable: true
      });
      // jsdom 默认 document.execCommand 是 undefined;手动 mock
      const execSpy = vi.fn(() => true);
      Object.defineProperty(document, 'execCommand', {
        value: execSpy,
        configurable: true,
        writable: true
      });
      render(
        <ErrorBoundary>
          <Boom shouldThrow={true} />
        </ErrorBoundary>
      );
      const copyBtns = screen.queryAllByText('复制错误');
      expect(copyBtns.length).toBeGreaterThan(0);
      fireEvent.click(copyBtns[0]);
      expect(execSpy).toHaveBeenCalledWith('copy');
    } finally {
      consoleSpy.mockRestore();
    }
  });
});