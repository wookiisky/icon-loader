import type { IconLoaderPoint } from "./icon-loader-resource";

/** Icon Loader图形填充顺序模式。 */
export type IconLoaderFillOrderMode =
  | "left_to_right"
  | "right_to_left"
  | "top_to_bottom"
  | "bottom_to_top"
  | "center_out"
  | "edge_in"
  | "diagonal_down"
  | "diagonal_up"
  | "shuffle";

/** Icon Loader填充顺序计算上下文。 */
export type IconLoaderFillOrderContext = {
  /** 当前场景种子。 */
  seed: number;
  /** 当前正在组装的图形。 */
  patternId: string;
  /** 当前事件时间，用于同一场景内区分图形。 */
  atMs: number;
  /** 当前图形网格尺寸。 */
  grid: {
    /** 横向格子数。 */
    columns: number;
    /** 纵向格子数。 */
    rows: number;
  };
};

/** Icon Loader支持的填充顺序模式。 */
export const iconLoaderFillOrderModes: readonly IconLoaderFillOrderMode[] = [
  "left_to_right",
  "right_to_left",
  "top_to_bottom",
  "bottom_to_top",
  "center_out",
  "edge_in",
  "diagonal_down",
  "diagonal_up",
  "shuffle",
] as const;

/** 根据 seed、图形和事件时间选择稳定的填充顺序模式。 */
export function selectIconLoaderFillOrderMode(context: IconLoaderFillOrderContext): IconLoaderFillOrderMode {
  const hash = createStableHash(`${context.seed}:${context.patternId}:${context.atMs}`);
  return iconLoaderFillOrderModes[hash % iconLoaderFillOrderModes.length];
}

/** 按稳定随机模式排列像素点，不改变原始点阵。 */
export function orderIconLoaderPoints<TPoint extends IconLoaderPoint>(
  points: readonly TPoint[],
  context: IconLoaderFillOrderContext,
): TPoint[] {
  const mode = selectIconLoaderFillOrderMode(context);
  const copiedPoints = points.map((point) => ({ ...point })) as TPoint[];

  if (mode === "shuffle") {
    return shufflePoints(copiedPoints, createStableHash(`${context.patternId}:${context.seed}:${context.atMs}:shuffle`));
  }

  return copiedPoints.sort((firstPoint, secondPoint) => {
    const firstScore = createPointOrderScore(firstPoint, mode, context.grid);
    const secondScore = createPointOrderScore(secondPoint, mode, context.grid);

    if (firstScore !== secondScore) {
      return firstScore - secondScore;
    }

    return comparePointPosition(firstPoint, secondPoint);
  });
}

/** 生成稳定的无符号整数哈希。 */
function createStableHash(value: string): number {
  let hash = 2166136261;

  Array.from(value).forEach((character) => {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  });

  return hash >>> 0;
}

/** 计算不同填充模式下的排序分值。 */
function createPointOrderScore(
  point: IconLoaderPoint,
  mode: IconLoaderFillOrderMode,
  grid: IconLoaderFillOrderContext["grid"],
): number {
  const centerX = (grid.columns - 1) / 2;
  const centerY = (grid.rows - 1) / 2;
  const distanceFromCenter = Math.abs(point.x - centerX) + Math.abs(point.y - centerY);

  if (mode === "left_to_right") {
    return point.x;
  }

  if (mode === "right_to_left") {
    return -point.x;
  }

  if (mode === "top_to_bottom") {
    return point.y;
  }

  if (mode === "bottom_to_top") {
    return -point.y;
  }

  if (mode === "center_out") {
    return distanceFromCenter;
  }

  if (mode === "edge_in") {
    return -distanceFromCenter;
  }

  if (mode === "diagonal_down") {
    return point.x + point.y;
  }

  return point.x - point.y;
}

/** 按坐标提供稳定的排序兜底。 */
function comparePointPosition(firstPoint: IconLoaderPoint, secondPoint: IconLoaderPoint): number {
  if (firstPoint.y !== secondPoint.y) {
    return firstPoint.y - secondPoint.y;
  }

  return firstPoint.x - secondPoint.x;
}

/** 用 Fisher-Yates 洗牌生成稳定的随机填充顺序。 */
function shufflePoints<TPoint extends IconLoaderPoint>(points: TPoint[], seed: number): TPoint[] {
  let state = seed >>> 0;

  for (let index = points.length - 1; index > 0; index -= 1) {
    state = createNextState(state);
    const swapIndex = state % (index + 1);
    const currentPoint = points[index];
    points[index] = points[swapIndex];
    points[swapIndex] = currentPoint;
  }

  return points;
}

/** 推进洗牌状态，避免每次取模都使用同一个哈希。 */
function createNextState(state: number): number {
  let nextState = state + 0x6d2b79f5;
  nextState = Math.imul(nextState ^ (nextState >>> 15), nextState | 1);
  nextState ^= nextState + Math.imul(nextState ^ (nextState >>> 7), nextState | 61);
  return (nextState ^ (nextState >>> 14)) >>> 0;
}
