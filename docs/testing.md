# 测试说明

## 默认测试

```bash
pnpm test
```

覆盖：

1. 页面请求状态 reducer。
2. Loader 手动播放和请求触发播放的组合规则。
3. Gemini 服务端环境变量读取、默认模型和 high thinking 配置。
4. 浏览器 NDJSON 流式事件解析。
5. 资产 manifest 校验与查询。
6. seed 驱动的 Icon Loader 配置生成。
7. Icon Loader 单轮覆盖完整 icon 资源池、同一轮图形不重复、生成资源固定为 `64 列 * 64 行`、颜色可保留、填充顺序和轮次顺序稳定随机化。

## 构建验证

```bash
pnpm build
```

构建会先运行 TypeScript 类型检查，再执行 Vite 生产构建。

## Icon Loader 资源验证

生成下载 icon 的 Icon Loader 资源：

```bash
pnpm approve-builds sharp
pnpm build:icon-resources
```

覆盖：

1. SVG icon 可转换成 `64 * 64` 资源 JSON。
2. 透明背景不会进入输出像素。
3. 多色 icon 的调色板颜色可以保留。
4. 生成资源可以通过 `iconLoaderResourceSchema` 校验。
5. `manifest.json` 会登记 `icon_loader` 的 `icon_resource` 资产。

## 真实 API 手动验收

前置条件：

1. 设置 `GOOGLE_API_KEY`。
2. 可选设置 `GEMINI_MODEL`，默认是 `gemini-3.1-pro-preview`，且需要支持 `thinkingLevel: high`。
3. 执行 `pnpm dev`。

验收路径：

1. 打开 `http://127.0.0.1:5173`。
2. 输入非空问题并提交。
3. 确认回复逐步显示。
4. 确认 Icon Loader 在请求中播放。
5. 确认请求完成后 Loader 回到等待态。
6. 点击顶部 `开始`，确认无请求时 Loader 也会播放。
7. 点击顶部 `停止`，确认无请求时 Loader 回到等待态。
8. 请求进行中点击 `停止`，确认 Loader 仍由请求触发继续播放。
9. 确认 Icon Loader 不展示灰色待填充方格，在固定区域内切换多个彩色 icon，颜色和轮廓可识别，单轮不重复，下一轮顺序发生变化。
10. 移除或置空 `GOOGLE_API_KEY` 后重启服务，确认页面展示明确错误。
