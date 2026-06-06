# Icon Loader 素材许可说明

## 当前状态

当前项目已引入本地下载 icon，并在构建期转换为 `64 * 64` 彩色 Icon Loader 资源。

当前 Loader 素材状态：

1. 只保留 Icon Loader。
2. Icon Loader 使用 `public/assets/loaders/icon-loader/patterns/*.pixel.json`。

Icon Loader 资产来源如下：

1. Icons8 Flat Color Icons：来源 `https://github.com/icons8/flat-color-icons`，许可证记录为 `MIT OR Good Boy License`，当前不要求署名。
2. OpenMoji：来源 `https://openmoji.org/`，许可证记录为 `CC BY-SA 4.0`，要求署名。

Noto Emoji 当前下载内容是字体文件，不包含单独 icon 文件，未进入本次资源构建。

## 资源格式

Icon Loader 资源由构建脚本生成：

```bash
pnpm build:icon-resources
```

每个 `.pixel.json` 包含：

1. `schemaVersion`
2. `id`
3. `label`
4. `sourceIconPath`
5. `baseResolution`
6. `palette`
7. `pixels`

`pixels` 使用 `[x, y, paletteIndex, alphaByte]` 编码，透明背景不会写入输出。基准分辨率固定为 `64 * 64`，运行时按容器缩放展示。

## 后续准入规则

新增素材进入 `public/assets/loaders/manifest.json` 前必须确认：

1. 文件可以被浏览器正常加载。
2. 尺寸满足运行时要求。
3. 许可证允许当前使用方式。
4. 来源可追溯。
5. 如需署名，必须记录 `attributionRequired: true`。
6. 不包含真实推理步骤、真实进度、真实工具调用或误导性文本。
7. Icon Loader 资源必须能通过 `iconLoaderResourceSchema` 校验。

## Manifest 必填字段

每个资产必须包含：

1. `id`
2. `loaderKind`
3. `assetKind`
4. `format`
5. `path`
6. `width`
7. `height`
8. `tags`
9. `license`
10. `source`
11. `attributionRequired`

Icon Loader 生成资产还会写入可选字段 `label`，用于动画标题展示。
