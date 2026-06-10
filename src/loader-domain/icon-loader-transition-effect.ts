import type { IconLoaderFillOrderMode } from "./icon-loader-fill-order";

/** Icon Loader 通用装配的像素聚合方式。 */
export type IconLoaderAssemblyGroupMode = "point" | "column" | "cluster" | "ring_segment";

/** Icon Loader 通用装配的起点来源。 */
export type IconLoaderAssemblyOriginMode = "target_position" | "top_outside" | "random_scatter" | "ring";

/** Icon Loader 通用装配的运动方式。 */
export type IconLoaderAssemblyMotionMode = "appear" | "drop" | "fly" | "orbit";

/** Icon Loader 通用装配的落位反馈。 */
export type IconLoaderAssemblySettleMode = "none" | "soft_bounce" | "overshoot";

/** Icon Loader 通用装配的轨迹样式。 */
export type IconLoaderAssemblyTrailMode = "none" | "short" | "glow";

/** Icon Loader 通用装配切换效果，通过参数组合表达大多数点阵切换。 */
export type IconLoaderAssemblyEffect = {
  /** 效果类型。 */
  kind: "assembly";
  /** 像素按什么粒度成组出现。 */
  groupMode: IconLoaderAssemblyGroupMode;
  /** 像素组按什么方向或路径进入。 */
  orderMode: IconLoaderFillOrderMode;
  /** 像素运动起点来自哪里。 */
  originMode: IconLoaderAssemblyOriginMode;
  /** 像素从起点到目标点的出现方式。 */
  motionMode: IconLoaderAssemblyMotionMode;
  /** 像素落位时是否带反馈。 */
  settleMode: IconLoaderAssemblySettleMode;
  /** 像素运动时是否绘制轨迹。 */
  trailMode: IconLoaderAssemblyTrailMode;
};

/** Icon Loader 每列老虎机切换效果，每列随机滚动后停到目标图标。 */
export type IconLoaderColumnSlotEffect = {
  /** 效果类型。 */
  kind: "column_slot";
  /** 各列停止的顺序。 */
  stopOrder: "left_to_right" | "right_to_left" | "center_out" | "shuffle";
  /** 滚动期间显示的内容来源。 */
  spinMode: "random_colors" | "random_target_pixels";
  /** 相邻列停止的间隔毫秒。 */
  columnDelayMs: number;
};

/** Icon Loader 雷达扫描显影效果，通过扫描遮罩显示目标图标。 */
export type IconLoaderRadarRevealEffect = {
  /** 效果类型。 */
  kind: "radar_reveal";
  /** 扫描遮罩形态。 */
  scanMode: "line" | "sector";
  /** 扫描方向。 */
  direction: "left_to_right" | "right_to_left" | "clockwise";
  /** 扫描后是否保留余辉。 */
  afterglow: boolean;
};

/** Icon Loader 切换效果，通用装配覆盖常规动效，特殊机制独立建模。 */
export type IconLoaderTransitionEffect =
  | IconLoaderAssemblyEffect
  | IconLoaderColumnSlotEffect
  | IconLoaderRadarRevealEffect;

/** Icon Loader 通用装配效果预设。 */
export const iconLoaderAssemblyEffectPresets: readonly IconLoaderAssemblyEffect[] = [
  {
    kind: "assembly",
    groupMode: "point",
    orderMode: "left_to_right",
    originMode: "target_position",
    motionMode: "appear",
    settleMode: "none",
    trailMode: "none",
  },
  {
    kind: "assembly",
    groupMode: "point",
    orderMode: "top_to_bottom",
    originMode: "top_outside",
    motionMode: "drop",
    settleMode: "soft_bounce",
    trailMode: "short",
  },
  {
    kind: "assembly",
    groupMode: "cluster",
    orderMode: "center_out",
    originMode: "random_scatter",
    motionMode: "fly",
    settleMode: "overshoot",
    trailMode: "glow",
  },
  {
    kind: "assembly",
    groupMode: "ring_segment",
    orderMode: "spiral_in",
    originMode: "ring",
    motionMode: "orbit",
    settleMode: "soft_bounce",
    trailMode: "short",
  },
] as const;

/** Icon Loader 特殊切换效果预设。 */
export const iconLoaderSpecialEffectPresets: readonly (IconLoaderColumnSlotEffect | IconLoaderRadarRevealEffect)[] = [
  {
    kind: "column_slot",
    stopOrder: "center_out",
    spinMode: "random_target_pixels",
    columnDelayMs: 34,
  },
  {
    kind: "radar_reveal",
    scanMode: "line",
    direction: "left_to_right",
    afterglow: true,
  },
] as const;

/** Icon Loader 所有切换效果预设。 */
export const iconLoaderTransitionEffectPresets: readonly IconLoaderTransitionEffect[] = [
  ...iconLoaderAssemblyEffectPresets,
  ...iconLoaderSpecialEffectPresets,
] as const;

/** 根据 seed、图形和事件时间稳定选择切换效果。 */
export function selectIconLoaderTransitionEffect(seed: number, patternId: string, atMs: number): IconLoaderTransitionEffect {
  const effectIndex = createStableHash(`${seed}:${patternId}:${atMs}:transition-effect`) % iconLoaderTransitionEffectPresets.length;
  const effect = iconLoaderTransitionEffectPresets[effectIndex];

  if (effect.kind !== "assembly" || effect.motionMode !== "appear") {
    return { ...effect };
  }

  return {
    ...effect,
    orderMode: selectOrderedFillMode(seed, patternId, atMs),
  };
}

/** 为旧填充效果稳定选择方向和路径。 */
function selectOrderedFillMode(seed: number, patternId: string, atMs: number): IconLoaderFillOrderMode {
  const fillModes: readonly IconLoaderFillOrderMode[] = [
    "left_to_right",
    "right_to_left",
    "top_to_bottom",
    "bottom_to_top",
    "center_out",
    "edge_in",
    "diagonal_down",
    "diagonal_up",
    "shuffle",
    "spiral_in",
    "wave_left",
    "wave_top",
  ];
  const modeIndex = createStableHash(`${seed}:${patternId}:${atMs}:ordered-fill-mode`) % fillModes.length;
  return fillModes[modeIndex];
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
