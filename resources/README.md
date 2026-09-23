# Resources

此目录存放打包相关资源:

- `icon-source.png` — 源 PNG(>=256x256,推荐 512x512 / 1024x1024,透明背景,Godot 主色 `#478CBF`)
- `icon.ico` — Windows 应用多分辨率 .ico(由 `scripts/build-icon.mjs` 生成)
- `tray.ico` — 系统托盘图标 16/32 像素(由 `scripts/build-icon.mjs` 生成)
- `installer.nsh` — NSIS 安装/卸载自定义脚本

## 生成 icon.ico 与 tray.ico

1. 准备 `icon-source.png`,放进 `resources/`(要求 RGBA,>=256x256,透明背景)
2. 运行 `node scripts/build-icon.mjs`
3. 脚本会:
   - 优先尝试用 `sharp`(轻量、跨平台、无外部依赖)
   - 找不到 `sharp` 时回退到 `magick convert`(ImageMagick)
   - 都缺失则给出明确错误并退出码 1(不静默成功)
4. 输出 `resources/icon.ico`(16/32/48/64/128/256 多分辨率)与 `resources/tray.ico`(16/32)

## 安装 sharp(可选)

```
npm install --save-dev sharp
```

`sharp` 不是必需依赖,因为脚本会自动回退到 `magick convert`。若想完全离线生成 icon,推荐安装 sharp。

## installer.nsh

NSIS 自定义安装/卸载钩子。当前 `customUnInstall` 只清理快捷方式,不会删除 `%APPDATA%\godot-launcher\` 的用户数据。