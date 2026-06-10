# Icon Loader

Icon Loader 是一个桌面 Web 演示项目，用于把下载到本地的 icon 转换为通用像素资源，并在等待 Gemini 流式回复时播放基于 icon 的 Loader 动画。

## 功能

1. 输入问题并提交。
2. 通过本地 Node 代理调用 Gemini 真实 API。
3. 浏览器逐块展示 Gemini 流式回复。
4. 请求期间同时展示 3 个随机 Icon Loader 动画。
5. 请求期间额外展示 Thinking Icon Queue：从 Gemini 可见 thought summary 文本提取关键词，匹配本地 icon 资源，并以单行最新 5 个 `16 列 * 16 行` 像素 icon 队列展示。
6. 顶部 `开始` / `停止` 按钮可手动控制随机 Loader 动画。
7. Loader 不展示真实进度、真实工具调用或真实链路状态。
8. `thoughtSignature` 是 Gemini opaque 签名，只能按协议原样保留或回传，项目不解析、不解码、不发送到浏览器。
9. Icon Loader 使用构建期生成的 `64 列 * 64 行` 彩色 icon 资源，随机 Loader 运行时转换为 `32 列 * 32 行` 点阵展示，Thinking Icon Queue 转换为 `16 列 * 16 行` 点阵展示。
10. 随机 Icon Loader 播放的是图标之间的娱乐性切换效果，不表达真实进度。

## Loader 播放规则

1. 点击 `开始` 会手动播放 3 个随机 Icon Loader。
2. 点击 `停止` 只会关闭手动播放。
3. Gemini 请求进行中会自动播放随机 Loader，即使此时点击 `停止`，请求触发的播放仍会继续。
4. 请求结束且手动播放关闭后，Loader 回到等待态。
5. 页面固定展示 3 个同类 Icon Loader；每次请求或手动开始都会生成基础 seed，三个展示槽位再派生不同 seed，因此初始动画不同。
6. Icon Loader 每轮播放完整 icon 资源池，单轮内不重复；播完一轮后派生新轮次 seed 并重新洗牌，多 icon 情况下会避免跨轮边界相邻重复。
7. 每次切换会稳定选择一种效果：通用装配、列老虎机或雷达显影。
8. Thinking Icon Queue 只在 Gemini 请求进行中展示。收到 thought keyword 后 append，逻辑队列最多保留最近 10 个用于去重；最近 10 个内同一 icon 只能出现一次，重复匹配会跳过；界面只显示最新 5 个并保持单行 5 槽；同一请求生命周期内同一 icon 最多成功出现 2 次，第 3 次起跳过。
9. 如果资产清单仍在加载，收到的 thought keyword 会短暂缓存，清单 ready 后再匹配 icon。
10. 如果模型或 SDK 没有返回可见 thought 文本，Thinking Icon Queue 保持等待态，主回复链路不受影响。
11. 如果关键词无法匹配到 icon，会使用稳定兜底 icon；没有可用兜底资产时跳过该关键词。

## Icon Loader 切换效果

切换效果分为两类：

1. 通用装配效果：通过聚合方式、方向路径、起点来源和运动方式组合，覆盖旧填充、像素雨、磁吸重组和环形装配。
2. 特殊效果：列老虎机和雷达扫描显影独立建模，避免把特殊机制塞进通用参数。

当前内置效果：

1. 旧填充：保留为通用装配的一组参数，支持左右、上下、中心、边缘、对角、随机、螺旋和波浪路径。
2. 像素雨组装：像素从图标上方落下并落位。
3. 磁吸重组：像素从散点飞入目标图标。
4. 环形装配：像素从环形轨道旋转进入目标图标。
5. 列老虎机：每列随机滚动，最后停到目标图标对应列。
6. 雷达扫描显影：扫描遮罩逐步显影目标图标。

## 环境变量

复制 `.env.example` 并配置：

```bash
GOOGLE_API_KEY=your_google_api_key
GEMINI_MODEL=gemini-3.1-pro-preview
API_PORT=8787
```

说明：

1. `GOOGLE_API_KEY` 只由 `server/` 读取，不进入浏览器代码。
2. `GEMINI_MODEL` 可选，默认是 `gemini-3.1-pro-preview`。
3. `API_PORT` 可选，默认是 `8787`。
4. Gemini 请求会设置 `thinkingConfig.includeThoughts: true`。如果模型不返回可见 thought 文本，页面只展示正常回复和等待态队列。

## 启动

```bash
pnpm install
pnpm dev
```

打开 Vite 输出的本地地址，通常是：

```text
http://127.0.0.1:5173
```

## Icon 资源构建

下载到 `assets/icon-packs/` 的可独立 icon 通过构建期 pipeline 转换为 Icon Loader 资源：

```bash
pnpm approve-builds sharp
pnpm build:icon-resources
```

当前处理范围：

1. `assets/icon-packs/flat-color-icons/svg/*.svg`
2. `assets/icon-packs/openmoji/color/svg/*.svg`

OpenMoji 同时存在 SVG 和 PNG 导出时，以 SVG 作为同一个 icon 的规范来源，避免重复生成。Noto Emoji 当前下载内容是字体文件，不包含单独 icon 文件，暂不从字体拆分 glyph。

输出位置：

```text
public/assets/loaders/icon-loader/patterns/*.pixel.json
public/assets/loaders/manifest.json
```

资源 JSON 使用 `palette + pixels` 编码。`pixels` 中每个元素为 `[x, y, paletteIndex, alphaByte]`，基准分辨率固定为 `64 * 64`。运行时先按配置转换为 `32 * 32` 展示点阵，再按容器大小计算方块尺寸，因此同一份资源可以在不同展示尺寸下复用。

## 验证

运行测试：

```bash
pnpm test
```

运行构建：

```bash
pnpm build
```

真实 API 验收需要本机存在可用的 `GOOGLE_API_KEY`。如果没有配置密钥，页面会展示明确错误，不会暴露服务端堆栈。

## 架构

核心边界：

1. `server/`：Gemini API 代理、环境变量读取、流式转发、服务端错误收敛。
2. `src/app/`：页面请求状态与 reducer。
3. `src/gemini-client/`：浏览器读取本地代理 NDJSON 流。
4. `src/loader-domain/`：纯类型、Icon Loader 资源解码、展示网格转换、填充顺序、切换效果和轮次顺序。
5. `src/loader-generation/`：seed 驱动的 Icon Loader 场景生成。
6. `src/asset-registry/`：资产 manifest 校验与查询。
7. `src/loader-renderers/`：PixiJS 渲染器和生命周期。

Icon Loader 资源格式、展示网格配置、切换效果和轮次顺序定义在 `src/loader-domain/` 的纯契约中。构建脚本负责把下载 icon 转成 `64 * 64` 彩色资源，运行时把资源转换为 `32 * 32` 展示点阵。配置生成器负责生成完整资源池和稳定随机切换效果，PixiJS 渲染器只负责加载和展示。

Thinking Icon Queue 的关键词提取是纯逻辑，服务端只把清洗后的 `thought_keyword` 事件发给浏览器，不把 thought 原文或 `thoughtSignature` 发到前端。关键词到 icon 的匹配发生在浏览器边界，复用 `icon_loader` 的 `icon_resource` 资产池；reducer 维护已匹配好的最近 10 个逻辑队列项和请求生命周期计数，最近 10 个内同一 icon 不重复，同一请求生命周期内同一 icon 最多成功出现 2 次；渲染器只展示最新 5 个单行槽位，并避免退场动画和新入场 icon 短暂重复。

## 素材策略

当前只保留 Icon Loader。新增素材进入 `public/assets/loaders/manifest.json` 时必须记录来源、许可证和署名要求。
