/** Icon Loader icon 基准分辨率，构建期统一输出为 64 * 64。 */
export const iconLoaderResourceGrid = {
  columns: 64,
  rows: 64,
} as const;

/** Icon Loader单个基础坐标点。 */
export type IconLoaderPoint = {
  /** 横向格子下标，范围由具体图案宽度决定。 */
  x: number;
  /** 纵向格子下标，范围由具体图案高度决定。 */
  y: number;
};

/** Icon Loader单个彩色像素点。 */
export type IconLoaderColoredPoint = IconLoaderPoint & {
  /** 像素颜色，格式为 #rrggbb。 */
  color: string;
  /** 透明度，范围为 0 到 1。 */
  alpha: number;
};

/** Icon Loader编码像素：[x, y, paletteIndex, alphaByte]。 */
export type IconLoaderEncodedPixel = readonly [number, number, number, number];

/** Icon Loader icon 像素图案，供运行时按不同展示尺寸缩放绘制。 */
export type IconLoaderResource = {
  /** schema 版本，升级格式时必须递增。 */
  schemaVersion: 1;
  /** 全局唯一图案 ID。 */
  id: string;
  /** 展示名称。 */
  label: string;
  /** 原始 icon 文件路径，便于追溯来源。 */
  sourceIconPath: string;
  /** 图案基准分辨率。 */
  baseResolution: {
    /** 横向格子数。 */
    columns: number;
    /** 纵向格子数。 */
    rows: number;
  };
  /** RGB 调色板，像素通过下标引用。 */
  palette: string[];
  /** 非透明像素列表，透明背景不会进入输出。 */
  pixels: IconLoaderEncodedPixel[];
};

/** 将调色板编码像素解码为渲染器直接消费的彩色点。 */
export function decodeIconLoaderResource(pattern: IconLoaderResource): IconLoaderColoredPoint[] {
  return pattern.pixels.map((pixel) => {
    const [x, y, paletteIndex, alphaByte] = pixel;
    const color = pattern.palette[paletteIndex];

    return {
      x,
      y,
      color: color ?? "#ffffff",
      alpha: alphaByte / 255,
    };
  });
}
