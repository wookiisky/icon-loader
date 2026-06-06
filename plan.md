# Icon Loader 调整计划

## 1. 已确认边界

1. 项目改为 Icon Loader。
2. Gemini 相关功能保留，后续可能基于 thinking 过程结果构建动画。
3. 允许资源路径和命名迁移。
4. 当前只保留原像素组装 Loader 逻辑。
5. 移除旧的非 Icon Loader动画。

## 2. 当前架构

```text
server/
  gemini-stream-client.ts
  gemini-stream-route.ts
  gemini-stream-types.ts
  server.ts

scripts/
  build-icon-loader-resources.ts

src/
  app/
    App.tsx
    app-reducer.ts
    app-state.ts
  asset-registry/
    asset-manifest-schema.ts
    asset-registry.ts
    icon-loader-resource-schema.ts
  components/
    ErrorNotice.tsx
    LoaderShowcase.tsx
    PromptForm.tsx
    ReplyStreamPanel.tsx
  gemini-client/
    stream-reply-client.ts
    stream-reply-types.ts
  loader-domain/
    icon-loader-fill-order.ts
    icon-loader-resource.ts
    icon-loader-round-order.ts
    loader-config.ts
    loader-event.ts
    loader-kind.ts
    loader-state.ts
  loader-generation/
    generation-shared.ts
    icon-loader-config-generator.ts
    loader-scenario-generator.ts
    seeded-random.ts
  loader-renderers/
    icon-loader-renderer.ts
    loader-renderer-factory.ts
    pixi-loader-stage.ts
```

## 3. 分层职责

1. Domain：纯类型、资源解码、填充顺序、轮次顺序。
2. Asset Registry：manifest 和资源 JSON 的边界校验。
3. Generation：基于 seed 和资源池生成 Icon Loader 场景。
4. Renderer：PixiJS 加载资源并绘制动画。
5. App：协调 Gemini 请求状态、手动播放状态和 Loader 生命周期。
6. Server：代理 Gemini API，避免浏览器暴露 API Key。

## 4. 验收清单

1. 页面标题和文档聚焦 Icon Loader。
2. 源码不再包含旧动画分支。
3. manifest 只允许 `icon_loader`。
4. 资源路径迁移到 `/assets/loaders/icon-loader/`。
5. `pnpm test` 通过。
6. `pnpm build` 通过。
7. 本地页面能播放 Icon Loader。

## 5. 后续扩展原则

1. 基于 Gemini thinking 过程构建动画前，先定义清洗后的抽象信号契约。
2. Domain 层不能依赖 Gemini 协议。
3. 新动画方式必须复用 Icon Loader 通用资源。
4. 不引入真实进度、真实工具调用或真实链路追踪的视觉误导。
