import type { IconLoaderEvent } from "./loader-event";

/** Icon Loader单轮播放配置。 */
export type IconLoaderRound = {
  /** 当前轮次派生 seed，影响图形顺序和填充顺序。 */
  seed: number;
  /** 当前轮次播放的事件，单轮内不重复。 */
  events: IconLoaderEvent[];
};

/** Icon Loader 单轮顺序生成选项。 */
export type IconLoaderRoundOrderOptions = {
  /** 上一轮实际播放的最后一个资产 ID，用于避免跨轮边界相邻重复。 */
  previousLastAssetId?: string;
};

/** 生成Icon Loader某一轮的稳定随机顺序。 */
export function createIconLoaderRound(
  events: readonly IconLoaderEvent[],
  scenarioSeed: number,
  roundIndex: number,
  options: IconLoaderRoundOrderOptions = {},
): IconLoaderRound {
  const roundSeed = createRoundSeed(scenarioSeed, roundIndex);
  const copiedEvents = events.map((event) => ({ ...event }));
  const shuffledEvents = shuffleEvents(copiedEvents, roundSeed);

  return {
    seed: roundSeed,
    events: moveDifferentEventToFirst(shuffledEvents, options.previousLastAssetId),
  };
}

/** 根据场景 seed 和轮次生成当前轮次 seed。 */
function createRoundSeed(scenarioSeed: number, roundIndex: number): number {
  return createStableHash(`${scenarioSeed}:icon-loader-round:${roundIndex}`);
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

/** 用 Fisher-Yates 洗牌生成稳定的单轮播放顺序。 */
function shuffleEvents(events: IconLoaderEvent[], seed: number): IconLoaderEvent[] {
  let state = seed >>> 0;

  for (let index = events.length - 1; index > 0; index -= 1) {
    state = createNextState(state);
    const swapIndex = state % (index + 1);
    const currentEvent = events[index];
    events[index] = events[swapIndex];
    events[swapIndex] = currentEvent;
  }

  return events;
}

/** 将不同于上一轮末项的事件移到首位，避免跨轮边界相邻重复。 */
function moveDifferentEventToFirst(events: IconLoaderEvent[], previousLastAssetId: string | undefined): IconLoaderEvent[] {
  if (previousLastAssetId === undefined || events.length <= 1) {
    return events;
  }

  const firstEvent = events[0];
  if (firstEvent === undefined || firstEvent.assetId !== previousLastAssetId) {
    return events;
  }

  const replacementIndex = events.findIndex((event) => event.assetId !== previousLastAssetId);
  if (replacementIndex <= 0) {
    return events;
  }

  events[0] = events[replacementIndex];
  events[replacementIndex] = firstEvent;
  return events;
}

/** 推进洗牌状态，避免每次取模都使用同一个哈希。 */
function createNextState(state: number): number {
  let nextState = state + 0x6d2b79f5;
  nextState = Math.imul(nextState ^ (nextState >>> 15), nextState | 1);
  nextState ^= nextState + Math.imul(nextState ^ (nextState >>> 7), nextState | 61);
  return (nextState ^ (nextState >>> 14)) >>> 0;
}
