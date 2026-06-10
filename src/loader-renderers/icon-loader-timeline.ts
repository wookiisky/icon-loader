import { createIconLoaderRound } from "../loader-domain/icon-loader-round-order";
import type { IconLoaderRound } from "../loader-domain/icon-loader-round-order";
import type { IconLoaderEvent } from "../loader-domain/loader-event";

export const iconLoaderHoldAfterTransitionMs = 500;

/** Icon Loader 已生成的单轮时间线。 */
export type IconLoaderTimelineRound = {
  /** 当前轮次序号。 */
  roundIndex: number;
  /** 当前轮次配置。 */
  round: IconLoaderRound;
  /** 当前轮次总展示时长。 */
  durationMs: number;
  /** 当前轮次最后实际展示的资产 ID。 */
  lastAssetId?: string;
};

/** Icon Loader 当前时间点的渲染事件。 */
export type IconLoaderTimelineFrame = {
  /** 当前轮次序号。 */
  roundIndex: number;
  /** 当前轮次 seed，用于派生稳定动画随机参数。 */
  roundSeed: number;
  /** 当前轮次内的事件序号。 */
  eventIndex: number;
  /** 当前要展示的 icon 切换事件。 */
  event: IconLoaderEvent;
  /** 当前事件内经过时间，包含完成后的停留段。 */
  eventElapsedMs: number;
  /** 当前事件周期内经过时间，包含完成后的停留段。 */
  cycleElapsedMs: number;
  /** 切换动画进度，停留段固定为 1。 */
  transitionProgress: number;
  /** 当前 icon 是否已经完成切换并进入停留段。 */
  settled: boolean;
};

/** Icon Loader 时间线解析上下文。 */
export type IconLoaderTimelineContext = {
  /** 原始 icon_transition 事件池。 */
  events: readonly IconLoaderEvent[];
  /** 场景 seed。 */
  scenarioSeed: number;
  /** 已播放时间。 */
  elapsedMs: number;
};

/** Icon Loader 单轮时间线生成上下文。 */
export type IconLoaderTimelineRoundContext = {
  /** 原始 icon_transition 事件池。 */
  events: readonly IconLoaderEvent[];
  /** 场景 seed。 */
  scenarioSeed: number;
  /** 目标轮次序号。 */
  roundIndex: number;
  /** 上一轮末尾资产 ID，用于避免多 icon 跨轮相邻重复。 */
  previousLastAssetId?: string;
};

/** Icon Loader 单轮内帧解析上下文。 */
export type IconLoaderTimelineRoundFrameContext = {
  /** 已生成的单轮时间线。 */
  timelineRound: IconLoaderTimelineRound;
  /** 当前轮次内经过时间。 */
  roundElapsedMs: number;
};

/** 解析 Icon Loader 当前时间点应展示的事件和切换进度。 */
export function resolveIconLoaderTimelineFrame(context: IconLoaderTimelineContext): IconLoaderTimelineFrame | null {
  if (context.events.length === 0) {
    return null;
  }

  const roundDurationMs = createRoundDurationMs(context.events);
  const elapsedMs = Math.max(0, context.elapsedMs);
  const roundIndex = Math.floor(elapsedMs / roundDurationMs);
  const roundElapsedMs = elapsedMs % roundDurationMs;
  const timelineRound = createTimelineRoundAtIndex(context.events, context.scenarioSeed, roundIndex);

  return resolveIconLoaderTimelineRoundFrame({
    timelineRound,
    roundElapsedMs,
  });
}

/** 生成 Icon Loader 单轮时间线。 */
export function createIconLoaderTimelineRound(context: IconLoaderTimelineRoundContext): IconLoaderTimelineRound {
  const round = createIconLoaderRound(context.events, context.scenarioSeed, context.roundIndex, {
    previousLastAssetId: context.previousLastAssetId,
  });

  return {
    roundIndex: context.roundIndex,
    round,
    durationMs: createRoundDurationMs(context.events),
    lastAssetId: readLastAssetId(round),
  };
}

/** 解析已生成轮次内的当前帧。 */
export function resolveIconLoaderTimelineRoundFrame(
  context: IconLoaderTimelineRoundFrameContext,
): IconLoaderTimelineFrame | null {
  return resolveRoundFrame(context.timelineRound, context.roundElapsedMs);
}

/** 计算单轮总展示时长。 */
function createRoundDurationMs(events: readonly IconLoaderEvent[]): number {
  return events.reduce((totalMs, event) => totalMs + createEventCycleMs(event), 0);
}

/** 计算单个 icon 的展示周期，包含完成后的静态停留。 */
function createEventCycleMs(event: IconLoaderEvent): number {
  return createTransitionDurationMs(event) + iconLoaderHoldAfterTransitionMs;
}

/** 读取切换动画时长，避免非法 0 值造成除零。 */
function createTransitionDurationMs(event: IconLoaderEvent): number {
  return Math.max(1, event.durationMs);
}

/** 生成目标轮次，逐轮传递上一轮末项以维持跨轮不相邻重复。 */
function createTimelineRoundAtIndex(
  events: readonly IconLoaderEvent[],
  scenarioSeed: number,
  targetRoundIndex: number,
): IconLoaderTimelineRound {
  let previousLastAssetId: string | undefined;
  let timelineRound = createIconLoaderTimelineRound({
    events,
    scenarioSeed,
    roundIndex: 0,
  });

  for (let roundIndex = 0; roundIndex <= targetRoundIndex; roundIndex += 1) {
    timelineRound = createIconLoaderTimelineRound({
      events,
      scenarioSeed,
      roundIndex,
      previousLastAssetId,
    });
    previousLastAssetId = timelineRound.lastAssetId;
  }

  return timelineRound;
}

/** 读取轮次最后实际展示的资产 ID。 */
function readLastAssetId(round: IconLoaderRound): string | undefined {
  const lastEvent = round.events[round.events.length - 1];
  return lastEvent?.assetId;
}

/** 解析单轮内当前时间点。 */
function resolveRoundFrame(
  timelineRound: IconLoaderTimelineRound,
  roundElapsedMs: number,
): IconLoaderTimelineFrame | null {
  let cursorMs = 0;

  for (let eventIndex = 0; eventIndex < timelineRound.round.events.length; eventIndex += 1) {
    const event = timelineRound.round.events[eventIndex];
    const cycleMs = createEventCycleMs(event);
    const cycleEndMs = cursorMs + cycleMs;

    if (roundElapsedMs < cycleEndMs) {
      return createTimelineFrame({
        timelineRound,
        eventIndex,
        event,
        eventElapsedMs: roundElapsedMs - cursorMs,
      });
    }

    cursorMs = cycleEndMs;
  }

  return null;
}

/** 创建当前时间线帧，停留段冻结切换进度。 */
function createTimelineFrame(options: {
  timelineRound: IconLoaderTimelineRound;
  eventIndex: number;
  event: IconLoaderEvent;
  eventElapsedMs: number;
}): IconLoaderTimelineFrame {
  const transitionDurationMs = createTransitionDurationMs(options.event);
  const transitionElapsedMs = Math.min(options.eventElapsedMs, transitionDurationMs);
  const transitionProgress = transitionElapsedMs / transitionDurationMs;

  return {
    roundIndex: options.timelineRound.roundIndex,
    roundSeed: options.timelineRound.round.seed,
    eventIndex: options.eventIndex,
    event: options.event,
    eventElapsedMs: options.eventElapsedMs,
    cycleElapsedMs: options.eventElapsedMs,
    transitionProgress,
    settled: options.eventElapsedMs >= transitionDurationMs,
  };
}
