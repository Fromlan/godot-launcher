# E2E 测试

使用 Playwright 的 `_electron` API 启动 Electron 应用,验证 UI 主流程。

运行前需要先编译:
```
npm run build
npm run test:e2e
```

> 注:`smoke.spec.ts` 启动的是 `dist-main/index.js`,需保证 main/preload/renderer 三层都已构建。
