import type { IconLoaderEvent } from "./loader-event";

/** Icon Loader单轮播放配置。 */
export type IconLoaderRound = {
  /** 当前轮次派生 seed，影响图形顺序和填充顺序。 */
  seed: number;
  /** 当前轮次播放的事件，单轮内不重复。 */
  events: IconLoaderEvent[];
};

/** 生成Icon Loader某一轮的稳定随机顺序。 */
export function createIconLoaderRound(
  events: readonly IconLoaderEvent[],
  scenarioSeed: number,
  roundIndex: number,
): IconLoaderRound {
  const roundSeed = createRoundSeed(scenarioSeed, roundIndex);
  const copiedEvents = events.map((event) => ({ ...event }));

  return {
    seed: roundSeed,
    events: shuffleEvents(copiedEvents, roundSeed),
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

/** 推进洗牌状态，避免每次取模都使用同一个哈希。 */
function createNextState(state: number): number {
  let nextState = state + 0x6d2b79f5;
  nextState = Math.imul(nextState ^ (nextState >>> 15), nextState | 1);
  nextState ^= nextState + Math.imul(nextState ^ (nextState >>> 7), nextState | 61);
  return (nextState ^ (nextState >>> 14)) >>> 0;
}
