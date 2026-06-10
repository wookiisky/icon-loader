# Icon Loader 技术方案

## 1. 结论

本项目的动画核心改为：

**icon 资源构建 + seed 切换配置生成 + PixiJS 本地渲染**

当前只保留 Icon Loader，不再保留旧的非 Icon Loader 动画。Icon Loader 的播放核心是图标之间的切换效果，不表达真实进度。

## 2. 目标与边界

### 2.1 目标

- 从本地 icon 生成通用 Loader 资源。
- 同一份资源可以被运行时按不同尺寸绘制。
- 每次请求使用 seed 产生可见差异。
- Gemini 流式回复保留，作为真实等待场景。
- 后续可以基于 Gemini thinking 过程结果影响动画表现。
- 动画异常不影响 Gemini 流式回复。

### 2.2 边界

- 不展示真实推理过程。
- 不展示真实进度百分比。
- 不伪装真实工具调用、链路追踪或模型思考。
- 不保留旧的非 Icon Loader动画。
- 不依赖第三方免费服务实时生成当前请求的 Loader。
- 不把 AI 返回的内容直接作为可执行代码。
- 不使用许可不清晰的素材进入正式资源库。

## 3. 核心链路

系统拆成两条链路：

1. 资源构建链路
   - 默认从 Icons8 Flat Color Icons 和 Noto Emoji SVG 读取本地 icon。
   - OpenMoji 本地数据和转换能力保留，但不进入默认资源池。
   - 使用 Noto Emoji metadata 生成 `label` 和 `tags`，metadata 只服务关键词匹配。
   - 使用 `sharp` 转换为 `64 * 64` RGBA 像素。
   - 过滤透明背景。
   - 生成 `palette + pixels` 编码资源。
   - 写入 `public/assets/loaders/icon-loader/patterns/`。
   - 更新 `public/assets/loaders/manifest.json`。

2. 运行时播放链路
   - 用户提交问题后生成 Loader seed。
   - 资产注册表读取并校验 manifest。
   - 场景生成器从资源池生成播放事件。
   - PixiJS 渲染器加载资源 JSON。
   - 场景生成器按 seed 选择目标图标和切换效果。
   - 渲染器消费纯帧计算结果并绘制 icon。
   - Gemini 流式回复结束后，动画停止或回到等待态。

## 4. 模块边界

### 4.1 `src/loader-domain/`

纯 Domain 层，只放稳定契约和纯函数：

- `loader-kind.ts`：集中约束 Loader 类型，目前只有 `icon_loader`。
- `loader-event.ts`：Icon Loader 事件契约。
- `loader-config.ts`：运行时场景配置契约。
- `icon-loader-resource.ts`：Icon Loader 资源格式和解码函数。
- `icon-loader-fill-order.ts`：填充顺序选择和排序。
- `icon-loader-transition-effect.ts`：切换效果契约和稳定选择。
- `icon-loader-transition-frame.ts`：切换效果的纯帧计算。
- `icon-loader-round-order.ts`：单轮资源播放顺序，并在多 icon 情况下避免跨轮边界相邻重复。

Domain 层不得依赖 PixiJS、fetch、Gemini 协议、服务端环境变量或浏览器 API。

### 4.2 `src/asset-registry/`

负责边界脏数据清洗：

- `asset-manifest-schema.ts` 校验 manifest。
- `icon-loader-resource-schema.ts` 校验资源 JSON。
- `asset-registry.ts` 提供按 Loader 类型和标签查询的只读接口。

非法 manifest 回退为空资产表，避免影响主回复链路。

### 4.3 `src/loader-generation/`

负责 seed 驱动的场景生成：

- 从资产注册表读取 `icon_loader` 的 `icon_resource`。
- 对资源池做不放回抽取。
- 生成 `icon_transition` 事件。
- 为每个事件选择稳定随机的切换效果。
- 生成 palette 和 tempo。

该层不读取 Gemini 文本，不做网络请求，不触碰 DOM。

### 4.4 `src/loader-renderers/`

负责副作用和渲染：

- 创建和销毁 PixiJS 应用。
- 加载资源 JSON。
- 使用 schema 清洗资源。
- 按 Domain 输出的切换帧绘制像素。
- 资源加载失败时只影响 Loader 展示，不影响 Gemini 回复。

### 4.5 `server/` 和 `src/gemini-client/`

保留 Gemini 流式回复链路：

- `server/` 读取环境变量并代理 Gemini。
- `src/gemini-client/` 读取本地代理 NDJSON 流。
- 当前动画不读取真实 thinking 过程。
- 后续接入 thinking 结果时，应新增边界解析模块，再把清洗后的抽象信号传给 Loader generation。

## 5. 资源格式

Icon Loader 资源 JSON：

```ts
type IconLoaderResource = {
  schemaVersion: 1;
  id: string;
  label: string;
  sourceIconPath: string;
  baseResolution: {
    columns: number;
    rows: number;
  };
  palette: string[];
  pixels: readonly [number, number, number, number][];
};
```

说明：

1. `palette` 保存 `#rrggbb` 色值。
2. `pixels` 保存 `[x, y, paletteIndex, alphaByte]`。
3. 透明背景不会进入输出。
4. 基准分辨率固定为 `64 * 64`。
5. 运行时展示分辨率配置为 `24 * 24`。
6. 渲染前先将基准点阵转换为展示点阵，同一展示格使用 alpha 加权平均色和最大 alpha 聚合。
7. 渲染器按容器尺寸计算像素块大小。

## 6. Manifest 约束

当前 manifest 只允许：

```ts
type LoaderKind = "icon_loader";
```

Icon Loader 资源条目：

```json
{
  "id": "pixel-icon-flat-color-icons-about",
  "label": "About",
  "loaderKind": "icon_loader",
  "assetKind": "icon_resource",
  "format": "icon-loader-json",
  "path": "/assets/loaders/icon-loader/patterns/flat-color-icons-about.pixel.json",
  "width": 64,
  "height": 64,
  "tags": ["flat-color-icons", "about"],
  "license": "MIT OR Good Boy License",
  "source": "https://github.com/icons8/flat-color-icons",
  "attributionRequired": false
}
```

## 7. 切换效果模型

切换效果分为通用装配和特殊效果两类：

1. 通用装配效果使用 `assembly` 建模。
   - `groupMode`：控制点、列、簇、环段等聚合方式。
   - `orderMode`：控制左右、上下、中心、边缘、对角、随机、螺旋、波浪等方向路径。
   - `originMode`：控制目标原位、顶部外侧、随机散点、环形轨道等起点。
   - `motionMode`：控制直接显现、下落、飞入、环绕等出现方式。
   - `settleMode` 和 `trailMode`：控制落位反馈和轨迹。
2. 特殊效果独立建模。
   - `column_slot`：每列随机滚动，最后停到目标图标对应列。
   - `radar_reveal`：扫描遮罩逐步显影目标图标。
3. 旧填充效果保留为 `assembly` 的一组参数，不再作为独立事件类型。

## 8. 运行时算法

1. `generateIconLoaderScenario(seed, registry)` 从资源池读取全部可用 icon。
2. 对资源池做不放回抽取，形成一轮 `icon_transition` 事件。
3. 渲染器按时间确定当前事件。
4. 渲染器加载 `64 * 64` 资源后转换为 `24 * 24` 展示点阵。
5. 每轮使用 `createIconLoaderRound` 派生 round seed。
6. 每个事件使用 `createIconLoaderTransitionFrame` 计算当前帧点位。
7. 通用装配内部按需使用 `orderIconLoaderPoints` 排序。
8. PixiJS 渲染器只绘制当前帧点位、轨迹和标题。
9. 一轮播放完后重新洗牌，多 icon 情况下下一轮首项避开上一轮末项；单 icon 或同资产 ID 输入无法物理避免相邻重复。

## 9. 错误策略

1. manifest 非法：回退为空资产表。
2. 资源 JSON 加载失败：当前 Loader 显示“素材不可用”。
3. 资源 JSON schema 不合法：标记资源失败，不抛到页面主链路。
4. Gemini 请求失败：页面进入 error 状态，Loader 按状态停止。
5. Loader 渲染失败不得影响回复流读取。

## 10. 测试策略

默认测试覆盖：

1. 页面请求状态 reducer。
2. Gemini 服务端配置和流式事件解析。
3. 资产 manifest 校验与查询。
4. Icon Loader 场景生成。
5. Icon Loader 资源解码和展示网格转换。
6. 填充顺序和切换效果选择的稳定性。
7. 通用装配、列老虎机和雷达扫描的纯帧计算。
8. 单轮资源顺序不重复，多 icon 情况下跨轮边界不相邻重复。
9. 构建脚本能把 SVG 转为资源 JSON。

## 11. 后续扩展原则

新增动画方式时，优先复用 `IconLoaderResource`：

1. 常规点阵动效优先扩展 `assembly` 参数。
2. 再扩展 generation。
3. 最后扩展 renderer。
4. 不把 Gemini 原始返回结构直接放入 Domain。
5. 不为了未来需求预埋复杂抽象。
