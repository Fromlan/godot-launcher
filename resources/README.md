# Resources

此目录存放打包相关资源:

- `icon.ico` — Windows 应用图标(尚未提供,可使用 ImageMagick 从 PNG 生成)
- `installer.nsh` — NSIS 安装/卸载自定义脚本

## 生成 icon.ico

```
magick convert -background none -resize 256x256 icon-source.png icon.ico
```
