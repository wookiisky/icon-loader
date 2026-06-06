# Icon Loader

Icon Loader 是一个桌面 Web 演示项目，用于把下载到本地的 icon 转换为通用像素资源，并在等待 Gemini 流式回复时播放基于 icon 的 Loader 动画。

## 功能

1. 输入问题并提交。
2. 通过本地 Node 代理调用 Gemini 真实 API。
3. 浏览器逐块展示 Gemini 流式回复。
4. 请求期间展示 Icon Loader 动画。
5. 顶部 `开始` / `停止` 按钮可手动控制 Loader 动画。
6. Loader 不展示真实推理、真实进度、真实工具调用或真实链路状态。
7. Icon Loader 使用构建期生成的 `64 列 * 64 行` 彩色 icon 资源，保留原 icon 的透明背景、颜色和轮廓信息。

## Loader 播放规则

1. 点击 `开始` 会手动播放 Icon Loader。
2. 点击 `停止` 只会关闭手动播放。
3. Gemini 请求进行中会自动播放 Loader，即使此时点击 `停止`，请求触发的播放仍会继续。
4. 请求结束且手动播放关闭后，Loader 回到等待态。
5. Icon Loader 每轮播放完整 icon 资源池，单轮内不重复；播完一轮后派生新轮次 seed 并重新洗牌。

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
4. Gemini 当前只作为真实等待场景和未来动画输入来源保留；当前 Loader 不读取真实 thinking 过程。

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

资源 JSON 使用 `palette + pixels` 编码。`pixels` 中每个元素为 `[x, y, paletteIndex, alphaByte]`，基准分辨率固定为 `64 * 64`；运行时按容器大小计算方块尺寸，因此同一份资源可以在不同展示尺寸下复用。

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
4. `src/loader-domain/`：纯类型、Icon Loader 资源解码、填充顺序和轮次顺序。
5. `src/loader-generation/`：seed 驱动的 Icon Loader 场景生成。
6. `src/asset-registry/`：资产 manifest 校验与查询。
7. `src/loader-renderers/`：PixiJS 渲染器和生命周期。

Icon Loader 资源格式和轮次顺序定义在 `src/loader-domain/` 的纯契约中。构建脚本负责把下载 icon 转成 `64 * 64` 彩色资源，配置生成器负责生成完整资源池，填充顺序和轮次顺序由 seed 稳定随机化，PixiJS 渲染器只负责加载和展示。

## 素材策略

当前只保留 Icon Loader。新增素材进入 `public/assets/loaders/manifest.json` 时必须记录来源、许可证和署名要求。
