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

## Vercel 构建验证

前置条件：

1. 已执行 `pnpm install`。
2. 已通过 `pnpm vercel:link` 关联 Vercel 项目。
3. Vercel 项目已配置 `GOOGLE_API_KEY` 和 `PASS`；`GEMINI_MODEL` 可选，默认是 `gemini-3.1-pro-preview`。

本地拉取生产环境配置并模拟 Vercel 构建：

```bash
pnpm vercel:pull:production
pnpm exec vercel build --prod
```

覆盖：

1. `vercel.json` 使用 Vite 预设、`pnpm build` 和 `dist` 输出目录。
2. `api/gemini/stream.ts` 会作为 Vercel Node.js Function 参与构建。
3. `/api/gemini/stream` 首包失败返回 JSON 错误，已开始流式输出后返回 NDJSON 错误事件。
4. `/api/health` 可用于部署后健康检查。
5. `GOOGLE_API_KEY` 和 `PASS` 只来自 Vercel 服务端环境变量，不写入源码或前端环境变量。
6. 用户在首包前或流式输出中取消请求时，Function 停止继续写入响应。
7. `api/` 和 `server/` 运行时入口链的本地相对 import 带 `.js` 后缀，避免 Vercel Node ESM 运行时报 `ERR_MODULE_NOT_FOUND`。

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
6. 默认构建源只包含 Icons8 Flat Color Icons 和 Noto Emoji SVG，不包含 OpenMoji。
7. OpenMoji 本地数据和转换发现能力仍可调用，但不进入默认构建源。
8. Noto Emoji metadata 会经过结构校验；缺失或非法时构建失败。
9. Noto Emoji metadata 码点和 SVG 文件名会统一去除 `FE0F/FE0E`，并保留 `200D`、keycap 和 tag sequence 等必要码点。
10. Noto Emoji 生成的 `label` 和 `tags` 可以被 Thinking Icon Queue 的关键词匹配使用。
11. `manifest.json` 中每个 Icon Loader 资源路径都能找到对应生成文件，关键样本资源 JSON 可以通过 schema 校验。
12. 少量 metadata 未覆盖的 Noto SVG 使用 `Noto Emoji <codepoints>` 和码点标签兜底。

## 真实 API 手动验收

前置条件：

1. 设置 `GOOGLE_API_KEY`。
2. 可选设置 `GEMINI_MODEL`，默认是 `gemini-3.1-pro-preview`，且需要支持 `thinkingLevel: high`。
3. 设置 `PASS`。
4. 执行 `pnpm dev`。

验收路径：

1. 打开 `http://127.0.0.1:5173/?pass=<PASS 的值>`。
2. 输入非空问题并提交。
3. 确认回复逐步显示。
4. 确认 3 个 Icon Loader 在请求中同时播放，且初始动画不同。
5. 确认 Thinking Icon Queue 在请求中显示：若模型返回可见 thought summary，应有 16x16 像素 icon append，逻辑队列最多保留最近 10 个用于去重，界面单行展示最新 5 个，满 5 项后追加时不保留被挤出项退场，队列外不短暂露出第 6 个 icon；最近 10 个内同一 icon 不重复，同一请求生命周期内同一 icon 最多成功出现 2 次；重复匹配不会 append，退场动画也不应和新入场 icon 短暂重复；若资产清单稍后才加载完成，早到的关键词应在清单 ready 后显示；若模型没有返回可见 thought summary，队列保持等待态且回复正常继续。
6. 确认请求完成后 Thinking Icon Queue 回到等待态，3 个随机 Loader 按播放规则停止或继续。
7. 点击顶部 `开始`，确认无请求时 3 个随机 Loader 也会播放。
8. 点击顶部 `停止`，确认无请求时 3 个随机 Loader 回到等待态。
9. 请求进行中点击 `停止`，确认随机 Loader 仍由请求触发继续播放。
10. 确认 Icon Loader 不展示灰色待填充方格，随机 Loader 以 24x24 点阵在固定区域内切换多个彩色 icon，颜色和轮廓可识别，单轮不重复，下一轮顺序发生变化，且多 icon 情况下跨轮边界不相邻重复。
11. 确认切换效果会在旧填充、像素雨、磁吸重组、环形装配、列老虎机和雷达扫描之间稳定变化。
12. 确认随机初始化 A/B/C 展示区面积约为旧版四分之一，标题只显示 A/B/C，移动端无横向溢出或标题重叠。
13. 确认 Thinking Icon Queue 仍保持 16x16 点阵，没有被随机初始化展示区的缩小规则影响。
14. 确认页面使用浅色背景，大模型输入和回复区保持紧凑，不抢占 Loader 展示区。
15. 请求进行中点击浏览器停止加载或关闭页面，确认本地代理停止继续写入流式响应。
16. 移除或置空 `PASS` 后重启服务，确认页面展示明确配置错误。
17. 移除 URL 中的 `pass` 或使用重复 `pass` 参数，确认页面展示无权限错误且不调用 Gemini。
18. 移除或置空 `GOOGLE_API_KEY` 后重启服务，确认页面展示明确错误。

## Vercel 部署验收

前置条件：

1. 已登录 Vercel CLI。
2. 已关联项目。
3. Production 环境已配置 `GOOGLE_API_KEY` 和 `PASS`。

部署：

```bash
pnpm exec vercel build --prod
pnpm exec vercel deploy --prebuilt --prod
```

验收路径：

1. 打开生产部署 URL，并在 URL 中追加 `?pass=<PASS 的值>`。
2. 访问 `/api/health`，确认返回 `{ "ok": true }`。
3. 输入非空问题并提交，确认回复逐块显示。
4. 确认请求期间随机 Loader 和 Thinking Icon Queue 行为与本地真实 API 手动验收一致。
5. 去掉 URL 中的 `pass`，确认页面展示无权限错误。
6. 在 Vercel Dashboard 中临时移除 Preview 环境的 `PASS` 并部署预览，确认页面展示明确配置错误且不暴露服务端堆栈。
7. 在 Vercel Dashboard 中临时移除 Preview 环境的 `GOOGLE_API_KEY` 并部署预览，确认页面展示明确错误且不暴露服务端堆栈。
