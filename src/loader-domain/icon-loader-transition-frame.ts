import type { IconLoaderColoredPoint, IconLoaderGrid, IconLoaderPoint } from "./icon-loader-resource";
import { orderIconLoaderPoints } from "./icon-loader-fill-order";
import type {
  IconLoaderAssemblyEffect,
  IconLoaderColumnSlotEffect,
  IconLoaderRadarRevealEffect,
  IconLoaderTransitionEffect,
} from "./icon-loader-transition-effect";

/** Icon Loader 单个渲染点的逻辑坐标，单位是点阵格。 */
export type IconLoaderFramePoint = IconLoaderColoredPoint & {
  /** 当前帧横向绘制位置，单位是点阵格。 */
  drawX: number;
  /** 当前帧纵向绘制位置，单位是点阵格。 */
  drawY: number;
  /** 可选轨迹起点横向坐标，单位是点阵格。 */
  trailFromX?: number;
  /** 可选轨迹起点纵向坐标，单位是点阵格。 */
  trailFromY?: number;
  /** 轨迹透明度。 */
  trailAlpha: number;
};

/** Icon Loader 切换帧计算上下文。 */
export type IconLoaderTransitionFrameContext = {
  /** 目标图标点阵。 */
  points: readonly IconLoaderColoredPoint[];
  /** 当前切换效果。 */
  effect: IconLoaderTransitionEffect;
  /** 当前切换进度，范围会被夹紧到 0 到 1。 */
  progress: number;
  /** 场景或轮次 seed。 */
  seed: number;
  /** 当前图标资产 ID。 */
  patternId: string;
  /** 当前事件时间，用于派生稳定随机。 */
  atMs: number;
  /** 当前图标展示网格。 */
  grid: IconLoaderGrid;
  /** 切换强度，影响散点距离和滚动扰动。 */
  burst: number;
  /** 可选调色板，用于特殊效果生成临时颜色。 */
  palette: readonly string[];
};

/** 计算某个切换效果在当前进度下的点阵绘制状态。 */
export function createIconLoaderTransitionFrame(context: IconLoaderTransitionFrameContext): IconLoaderFramePoint[] {
  const progress = clamp(context.progress, 0, 1);

  if (context.points.length === 0) {
    return [];
  }

  if (context.effect.kind === "assembly") {
    return createAssemblyFrame(context, context.effect, progress);
  }

  if (context.effect.kind === "column_slot") {
    return createColumnSlotFrame(context, context.effect, progress);
  }

  return createRadarRevealFrame(context, context.effect, progress);
}

/** 计算通用装配效果的帧点位。 */
function createAssemblyFrame(
  context: IconLoaderTransitionFrameContext,
  effect: IconLoaderAssemblyEffect,
  progress: number,
): IconLoaderFramePoint[] {
  const orderedPoints = orderIconLoaderPoints(context.points, {
    seed: context.seed,
    patternId: context.patternId,
    atMs: context.atMs,
    grid: context.grid,
    orderMode: effect.orderMode,
  });
  const groupDelays = createAssemblyGroupDelayByCell(orderedPoints, context, effect);
  const maxDelay = Math.max(...Array.from(groupDelays.values()), 0);
  const usableDuration = Math.max(0.1, 1 - maxDelay);

  return orderedPoints.flatMap((point) => {
    const delay = groupDelays.get(createCellKey(point)) ?? 0;
    const localProgress = clamp((progress - delay) / usableDuration, 0, 1);

    if (localProgress <= 0) {
      return [];
    }

    const easedProgress = easeOutCubic(localProgress);
    const origin = createOriginPoint(point, context, effect);
    const drawPoint = createMotionPoint(point, origin, effect, easedProgress, context.grid);
    const settledPoint = applySettle(drawPoint, point, effect, localProgress);
    const alpha = Math.min(1, point.alpha * createAssemblyAlpha(effect, localProgress));

    return [
      {
        ...point,
        drawX: settledPoint.x,
        drawY: settledPoint.y,
        alpha,
        trailFromX: origin.x,
        trailFromY: origin.y,
        trailAlpha: effect.trailMode === "none" ? 0 : (1 - localProgress) * 0.26,
      },
    ];
  });
}

/** 计算老虎机列滚动效果的帧点位。 */
function createColumnSlotFrame(
  context: IconLoaderTransitionFrameContext,
  effect: IconLoaderColumnSlotEffect,
  progress: number,
): IconLoaderFramePoint[] {
  const columnOrder = createColumnStopOrder(context.grid.columns, effect.stopOrder, context.seed, context.patternId);
  const stopIndexByColumn = new Map(columnOrder.map((column, index) => [column, index]));
  const maxStopIndex = Math.max(columnOrder.length - 1, 1);

  return context.points.map((point) => {
    const stopIndex = stopIndexByColumn.get(point.x) ?? 0;
    const stopProgress = stopIndex / maxStopIndex;
    const isStopped = progress >= stopProgress * 0.72 + 0.2;

    if (isStopped) {
      return createStaticFramePoint(point, 1);
    }

    const randomOffset = createStableHash(`${context.seed}:${context.patternId}:${point.x}:${point.y}:slot`);
    const rawRollOffset = Math.floor((1 - progress) * context.grid.rows * 4 + (randomOffset % context.grid.rows));
    const rollOffset = createVisibleRollOffset(rawRollOffset, context.grid.rows);
    const color = effect.spinMode === "random_colors" ? pickPaletteColor(context.palette, randomOffset) : point.color;

    return {
      ...point,
      color,
      drawX: point.x,
      drawY: (point.y + rollOffset) % context.grid.rows,
      alpha: Math.max(0.28, point.alpha * 0.72),
      trailAlpha: 0,
    };
  });
}

/** 计算雷达扫描显影效果的帧点位。 */
function createRadarRevealFrame(
  context: IconLoaderTransitionFrameContext,
  effect: IconLoaderRadarRevealEffect,
  progress: number,
): IconLoaderFramePoint[] {
  return context.points.flatMap((point) => {
    const revealProgress = createRadarRevealProgress(point, context.grid, effect);
    const scanWidth = effect.scanMode === "line" ? 0.18 : 0.28;
    const distance = progress - revealProgress;

    if (distance < -scanWidth) {
      return [];
    }

    const glow = effect.afterglow && distance >= -scanWidth && distance <= scanWidth ? 0.18 : 0;
    const alpha = distance >= 0 ? point.alpha : point.alpha * clamp(1 + distance / scanWidth, 0, 1);

    return [
      {
        ...point,
        drawX: point.x,
        drawY: point.y,
        alpha: Math.min(1, alpha + glow),
        trailAlpha: 0,
      },
    ];
  });
}

/** 生成通用装配每个点的延迟。 */
function createAssemblyGroupDelayByCell(
  orderedPoints: readonly IconLoaderColoredPoint[],
  context: IconLoaderTransitionFrameContext,
  effect: IconLoaderAssemblyEffect,
): Map<string, number> {
  const groupIndexByCell = new Map<string, number>();
  const groupOrder = new Map<string, number>();

  orderedPoints.forEach((point, index) => {
    const groupKey = createGroupKey(point, context.grid, effect);
    if (!groupOrder.has(groupKey)) {
      groupOrder.set(groupKey, groupOrder.size);
    }

    groupIndexByCell.set(createCellKey(point), groupOrder.get(groupKey) ?? index);
  });

  const groupCount = Math.max(groupOrder.size, 1);
  const delayByCell = new Map<string, number>();
  groupIndexByCell.forEach((groupIndex, cellKey) => {
    delayByCell.set(cellKey, (groupIndex / groupCount) * 0.78);
  });

  return delayByCell;
}

/** 根据聚合模式生成点所属分组。 */
function createGroupKey(point: IconLoaderPoint, grid: IconLoaderGrid, effect: IconLoaderAssemblyEffect): string {
  if (effect.groupMode === "column") {
    return `column:${point.x}`;
  }

  if (effect.groupMode === "cluster") {
    return `cluster:${Math.floor(point.x / 4)}:${Math.floor(point.y / 4)}`;
  }

  if (effect.groupMode === "ring_segment") {
    const centerX = (grid.columns - 1) / 2;
    const centerY = (grid.rows - 1) / 2;
    const angle = Math.atan2(point.y - centerY, point.x - centerX);
    const normalizedAngle = angle < 0 ? angle + Math.PI * 2 : angle;
    return `ring:${Math.floor((normalizedAngle / (Math.PI * 2)) * 12)}`;
  }

  return `point:${point.x}:${point.y}`;
}

/** 生成像素运动起点。 */
function createOriginPoint(
  point: IconLoaderPoint,
  context: IconLoaderTransitionFrameContext,
  effect: IconLoaderAssemblyEffect,
): IconLoaderPoint {
  if (effect.originMode === "target_position") {
    return { x: point.x, y: point.y };
  }

  if (effect.originMode === "top_outside") {
    const randomDrop = createStableHash(`${context.seed}:${context.patternId}:${point.x}:${point.y}:drop`) % context.grid.rows;
    return { x: point.x, y: -context.grid.rows * 0.45 - randomDrop * 0.2 };
  }

  if (effect.originMode === "ring") {
    const centerX = (context.grid.columns - 1) / 2;
    const centerY = (context.grid.rows - 1) / 2;
    const angle = Math.atan2(point.y - centerY, point.x - centerX);
    const radius = Math.max(context.grid.columns, context.grid.rows) * 0.68;
    return { x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius };
  }

  const hash = createStableHash(`${context.seed}:${context.patternId}:${point.x}:${point.y}:scatter`);
  const angle = ((hash % 360) / 360) * Math.PI * 2;
  const distance = Math.max(8, context.burst * 0.85 + (hash % 9));
  return { x: point.x + Math.cos(angle) * distance, y: point.y + Math.sin(angle) * distance };
}

/** 根据运动模式生成当前绘制点。 */
function createMotionPoint(
  target: IconLoaderPoint,
  origin: IconLoaderPoint,
  effect: IconLoaderAssemblyEffect,
  progress: number,
  grid: IconLoaderGrid,
): IconLoaderPoint {
  if (effect.motionMode === "appear") {
    return { x: target.x, y: target.y };
  }

  if (effect.motionMode === "orbit") {
    const centerX = (grid.columns - 1) / 2;
    const centerY = (grid.rows - 1) / 2;
    const orbitAngle = (1 - progress) * Math.PI * 1.5;
    const rotatedX = centerX + (origin.x - centerX) * Math.cos(orbitAngle) - (origin.y - centerY) * Math.sin(orbitAngle);
    const rotatedY = centerY + (origin.x - centerX) * Math.sin(orbitAngle) + (origin.y - centerY) * Math.cos(orbitAngle);

    return interpolatePoint({ x: rotatedX, y: rotatedY }, target, progress);
  }

  return interpolatePoint(origin, target, progress);
}

/** 给装配落位增加轻量反馈。 */
function applySettle(
  current: IconLoaderPoint,
  target: IconLoaderPoint,
  effect: IconLoaderAssemblyEffect,
  progress: number,
): IconLoaderPoint {
  if (effect.settleMode === "none" || progress < 0.72) {
    return current;
  }

  const bounce = Math.sin((progress - 0.72) * Math.PI * 5) * (1 - progress);
  const amount = effect.settleMode === "overshoot" ? bounce * 1.8 : bounce;

  return {
    x: current.x + (current.x - target.x) * amount,
    y: current.y + (current.y - target.y) * amount,
  };
}

/** 计算通用装配的透明度。 */
function createAssemblyAlpha(effect: IconLoaderAssemblyEffect, progress: number): number {
  if (effect.motionMode === "appear" || effect.motionMode === "fly") {
    return easeOutCubic(progress);
  }

  return Math.max(0.34, easeOutCubic(progress));
}

/** 生成不同列的停止顺序。 */
function createColumnStopOrder(columns: number, stopOrder: IconLoaderColumnSlotEffect["stopOrder"], seed: number, patternId: string): number[] {
  const columnIndexes = Array.from({ length: columns }, (_, index) => index);

  if (stopOrder === "right_to_left") {
    return columnIndexes.reverse();
  }

  if (stopOrder === "center_out") {
    const center = (columns - 1) / 2;
    return columnIndexes.sort((firstColumn, secondColumn) => {
      return Math.abs(firstColumn - center) - Math.abs(secondColumn - center);
    });
  }

  if (stopOrder === "shuffle") {
    return shuffleNumbers(columnIndexes, createStableHash(`${seed}:${patternId}:column-stop-order`));
  }

  return columnIndexes;
}

/** 计算某个点被雷达扫描到的进度位置。 */
function createRadarRevealProgress(point: IconLoaderPoint, grid: IconLoaderGrid, effect: IconLoaderRadarRevealEffect): number {
  if (effect.direction === "right_to_left") {
    return 1 - point.x / Math.max(1, grid.columns - 1);
  }

  if (effect.direction === "clockwise") {
    const centerX = (grid.columns - 1) / 2;
    const centerY = (grid.rows - 1) / 2;
    const angle = Math.atan2(point.y - centerY, point.x - centerX);
    const normalizedAngle = angle < 0 ? angle + Math.PI * 2 : angle;
    return normalizedAngle / (Math.PI * 2);
  }

  return point.x / Math.max(1, grid.columns - 1);
}

/** 创建静态点。 */
function createStaticFramePoint(point: IconLoaderColoredPoint, alphaMultiplier: number): IconLoaderFramePoint {
  return {
    ...point,
    drawX: point.x,
    drawY: point.y,
    alpha: point.alpha * alphaMultiplier,
    trailAlpha: 0,
  };
}

/** 按比例插值两个点。 */
function interpolatePoint(origin: IconLoaderPoint, target: IconLoaderPoint, progress: number): IconLoaderPoint {
  return {
    x: origin.x + (target.x - origin.x) * progress,
    y: origin.y + (target.y - origin.y) * progress,
  };
}

/** 从调色板稳定选择颜色。 */
function pickPaletteColor(palette: readonly string[], hash: number): string {
  if (palette.length === 0) {
    return "#ffffff";
  }

  return palette[hash % palette.length];
}

/** 确保老虎机未停止列有可见滚动位移。 */
function createVisibleRollOffset(rawOffset: number, rows: number): number {
  if (rows <= 1) {
    return 0;
  }

  const offset = rawOffset % rows;
  return offset === 0 ? 1 : offset;
}

/** 按 Fisher-Yates 洗牌数字数组。 */
function shuffleNumbers(values: number[], seed: number): number[] {
  let state = seed >>> 0;

  for (let index = values.length - 1; index > 0; index -= 1) {
    state = createNextState(state);
    const swapIndex = state % (index + 1);
    const currentValue = values[index];
    values[index] = values[swapIndex];
    values[swapIndex] = currentValue;
  }

  return values;
}

/** 生成 cell 唯一 key。 */
function createCellKey(point: IconLoaderPoint): string {
  return `${point.x}:${point.y}`;
}

/** 三次缓出曲线。 */
function easeOutCubic(value: number): number {
  return 1 - (1 - value) ** 3;
}

/** 将数字夹紧到区间内。 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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

/** 推进洗牌状态。 */
function createNextState(state: number): number {
  let nextState = state + 0x6d2b79f5;
  nextState = Math.imul(nextState ^ (nextState >>> 15), nextState | 1);
  nextState ^= nextState + Math.imul(nextState ^ (nextState >>> 7), nextState | 61);
  return (nextState ^ (nextState >>> 14)) >>> 0;
}
