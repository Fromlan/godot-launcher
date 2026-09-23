import React from 'react';

/**
 * 内联 SVG 图标组件 —— addons/at-icons 子集
 * - 每个 SVG 已规范化:fill=currentColor, viewBox=0 0 16 16, 无 width/height
 * - 颜色继承自父级 color;大小通过 size 或 CSS 控制
 *
 * 关键:必须把源 SVG 的 viewBox 传到 React <svg> 上,否则 SVG 默认 overflow:hidden
 * 会把 path data 中超出 width/height 范围的部分裁掉 — 这就是之前所有 icon
 * 显示不完整的根本原因。
 *
 * 用法:
 *   <Icon name="cog" />
 *   <Icon name="refresh" size={14} />
 */

const RAW = import.meta.glob('../assets/icons/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>;

export type IconName =
  | 'atom' | 'folder' | 'cog' | 'palette'
  | 'search-empty' | 'info-circle'
  | 'check' | 'cross' | 'lightning' | 'cross-square'
  | 'refresh' | 'download' | 'play' | 'trash'
  | 'folder-open' | 'pencil' | 'link' | 'star' | 'wrench';

interface IconMeta {
  inner: string;
  viewBox: string;
}

const META: Record<string, IconMeta> = {};
for (const k of Object.keys(RAW)) {
  const raw = RAW[k];
  const open = raw.indexOf('>') + 1;
  const close = raw.lastIndexOf('</svg>');
  const vbMatch = raw.match(/viewBox\s*=\s*"([^"]+)"/);
  const name = k.split('/').pop()!.replace('.svg', '');
  META[name] = {
    inner: raw.slice(open, close),
    viewBox: vbMatch ? vbMatch[1] : '0 0 16 16',
  };
}

export interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, 'name' | 'children'> {
  name: IconName;
  size?: number | string;
}

const Icon = React.forwardRef<SVGSVGElement, IconProps>(function Icon(
  { name, size = 16, className, style, ...rest },
  ref
) {
  const meta = META[name];
  if (!meta) {
    if (typeof console !== 'undefined') {
      console.warn('[Icon] unknown name:', name);
    }
    return null;
  }
  const dim = typeof size === 'number' ? size + 'px' : size;
  const cls = className ? 'icon ' + className : 'icon';
  return (
    <svg
      ref={ref}
      width={dim}
      height={dim}
      viewBox={meta.viewBox}
      xmlns="http://www.w3.org/2000/svg"
      /* key fix: viewBox 让 path 按比例缩放,不被 width/height 默认 overflow:hidden 裁切 */
      aria-hidden="true"
      focusable="false"
      className={cls}
      style={style}
      dangerouslySetInnerHTML={{ __html: meta.inner }}
      {...rest}
    />
  );
});

export default Icon;
