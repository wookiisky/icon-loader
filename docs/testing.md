# 测试说明

## 默认测试

```bash
pnpm test
```

覆盖：

1. 页面请求状态 reducer。
2. Loader 手动播放和请求触发播放的组合规则。
3. 三个 Loader 展示槽位的 seed 派生规则，确保同屏初始化不同。
4. Gemini 服务端环境变量读取、默认模型和 high thinking 配置。
5. Gemini 可见 thought part 提取、`includeThoughts: true` 配置，以及不读取 `thoughtSignature`。
6. 浏览器 NDJSON 流式事件解析，包括 `thought_keyword`。
7. Thinking 关键词清洗、半截流式 token 拼接、重复过滤和请求末尾冲洗。
8. 关键词到 icon 资产匹配，确认复用 `icon_loader` 的 `icon_resource` 资产池。
9. 资产 manifest 校验与查询。
10. seed 驱动的 Icon Loader 配置生成。
11. Icon Loader 单轮覆盖完整 icon 资源池、同一轮图形不重复、多 icon 情况下跨轮边界不相邻重复、生成资源固定为 `64 列 * 64 行`、颜色可保留、填充顺序、切换效果和轮次顺序稳定随机化。
12. Icon Loader 切换帧计算覆盖旧填充、像素雨、磁吸重组、环形装配、列老虎机、雷达扫描和空点阵降级。
13. Thinking Icon Queue 追加、逻辑队列最多 10 个、界面单行展示最新 5 个、最近 10 个内同一 icon 不重复、同一请求生命周期内同一 icon 最多成功出现 2 次、连续重复跳过、重复跳过不触发现有 icon 重入场动画、关键词更新不重建 Pixi。
14. 资产清单加载中先收到 thought keyword 时，清单 ready 后回放匹配；请求已结束后不会回放过期关键词。

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
4. 确认 3 个 Icon Loader 在请求中同时播放，且初始动画不同。
5. 确认 Thinking Icon Queue 在请求中显示：若模型返回可见 thought summary，应有 16x16 像素 icon append，逻辑队列最多保留最近 10 个用于去重，界面单行展示最新 5 个，满 5 项后追加时不保留被挤出项退场，队列外不短暂露出第 6 个 icon；最近 10 个内同一 icon 不重复，同一请求生命周期内同一 icon 最多成功出现 2 次；重复匹配不会 append，退场动画也不应和新入场 icon 短暂重复；若资产清单稍后才加载完成，早到的关键词应在清单 ready 后显示；若模型没有返回可见 thought summary，队列保持等待态且回复正常继续。
6. 确认请求完成后 Thinking Icon Queue 回到等待态，3 个随机 Loader 按播放规则停止或继续。
7. 点击顶部 `开始`，确认无请求时 3 个随机 Loader 也会播放。
8. 点击顶部 `停止`，确认无请求时 3 个随机 Loader 回到等待态。
9. 请求进行中点击 `停止`，确认随机 Loader 仍由请求触发继续播放。
10. 确认 Icon Loader 不展示灰色待填充方格，在固定区域内切换多个彩色 icon，颜色和轮廓可识别，单轮不重复，下一轮顺序发生变化，且多 icon 情况下跨轮边界不相邻重复。
11. 确认切换效果会在旧填充、像素雨、磁吸重组、环形装配、列老虎机和雷达扫描之间稳定变化。
12. 确认页面使用浅色背景，大模型输入和回复区保持紧凑，不抢占 Loader 展示区。
13. 移除或置空 `GOOGLE_API_KEY` 后重启服务，确认页面展示明确错误。
