/** Icon Loader icon 基准分辨率，构建期统一输出为 64 * 64。 */
export const iconLoaderResourceGrid = {
  columns: 64,
  rows: 64,
} as const;

/** Icon Loader 运行时展示分辨率，渲染前会从基准资源转换到该网格。 */
export const iconLoaderDisplayGrid = {
  columns: 32,
  rows: 32,
} as const;

/** Icon Loader 点阵网格尺寸。 */
export type IconLoaderGrid = {
  /** 横向格子数。 */
  columns: number;
  /** 纵向格子数。 */
  rows: number;
};

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

/** Icon Loader 点阵转换配置。 */
export type IconLoaderGridTransformConfig = {
  /** 源点阵网格。 */
  sourceGrid: IconLoaderGrid;
  /** 目标点阵网格。 */
  targetGrid: IconLoaderGrid;
};

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

type IconLoaderPointBucket = {
  /** 目标横向格子下标。 */
  x: number;
  /** 目标纵向格子下标。 */
  y: number;
  /** alpha 加权红色通道累计值。 */
  weightedRed: number;
  /** alpha 加权绿色通道累计值。 */
  weightedGreen: number;
  /** alpha 加权蓝色通道累计值。 */
  weightedBlue: number;
  /** alpha 累计权重。 */
  alphaWeight: number;
  /** 目标格子的最大透明度。 */
  maxAlpha: number;
};

/** 将 Icon Loader 点阵转换到更小展示网格，同格像素用 alpha 加权颜色聚合。 */
export function transformIconLoaderPointsToGrid(
  points: readonly IconLoaderColoredPoint[],
  config: IconLoaderGridTransformConfig,
): IconLoaderColoredPoint[] {
  const bucketByTargetPoint = new Map<string, IconLoaderPointBucket>();

  points.forEach((point) => {
    const targetX = mapCoordinateToTargetGrid(point.x, config.sourceGrid.columns, config.targetGrid.columns);
    const targetY = mapCoordinateToTargetGrid(point.y, config.sourceGrid.rows, config.targetGrid.rows);
    const bucketKey = `${targetX}:${targetY}`;
    const color = parseHexColor(point.color);
    const existingBucket = bucketByTargetPoint.get(bucketKey);

    if (existingBucket === undefined) {
      bucketByTargetPoint.set(bucketKey, {
        x: targetX,
        y: targetY,
        weightedRed: color.red * point.alpha,
        weightedGreen: color.green * point.alpha,
        weightedBlue: color.blue * point.alpha,
        alphaWeight: point.alpha,
        maxAlpha: point.alpha,
      });
      return;
    }

    existingBucket.weightedRed += color.red * point.alpha;
    existingBucket.weightedGreen += color.green * point.alpha;
    existingBucket.weightedBlue += color.blue * point.alpha;
    existingBucket.alphaWeight += point.alpha;
    existingBucket.maxAlpha = Math.max(existingBucket.maxAlpha, point.alpha);
  });

  return Array.from(bucketByTargetPoint.values())
    .sort((firstBucket, secondBucket) => {
      if (firstBucket.y !== secondBucket.y) {
        return firstBucket.y - secondBucket.y;
      }
      return firstBucket.x - secondBucket.x;
    })
    .map((bucket) => {
      return {
        x: bucket.x,
        y: bucket.y,
        color: createWeightedHexColor(bucket),
        alpha: bucket.maxAlpha,
      };
    });
}

/** 将源坐标按比例映射到目标网格，并夹紧边界。 */
function mapCoordinateToTargetGrid(sourceCoordinate: number, sourceSize: number, targetSize: number): number {
  const scaledCoordinate = Math.floor((sourceCoordinate * targetSize) / sourceSize);
  return Math.min(targetSize - 1, Math.max(0, scaledCoordinate));
}

/** 解析 #rrggbb 色值，非法输入回退白色。 */
function parseHexColor(color: string): { red: number; green: number; blue: number } {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (match === null) {
    return { red: 255, green: 255, blue: 255 };
  }

  return {
    red: Number.parseInt(match[1], 16),
    green: Number.parseInt(match[2], 16),
    blue: Number.parseInt(match[3], 16),
  };
}

/** 根据 alpha 加权均值生成聚合后的十六进制色值。 */
function createWeightedHexColor(bucket: IconLoaderPointBucket): string {
  if (bucket.alphaWeight <= 0) {
    return "#ffffff";
  }

  const red = Math.round(bucket.weightedRed / bucket.alphaWeight);
  const green = Math.round(bucket.weightedGreen / bucket.alphaWeight);
  const blue = Math.round(bucket.weightedBlue / bucket.alphaWeight);
  return `#${toHexByte(red)}${toHexByte(green)}${toHexByte(blue)}`;
}

/** 将颜色通道夹紧并转换为两位十六进制。 */
function toHexByte(value: number): string {
  const byte = Math.min(255, Math.max(0, value));
  return byte.toString(16).padStart(2, "0");
}
