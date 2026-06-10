import { describe, expect, it } from "vitest";
import {
  iconLoaderHoldAfterTransitionMs,
  resolveIconLoaderTimelineFrame,
} from "../../src/loader-renderers/icon-loader-timeline";
import type { IconLoaderEvent } from "../../src/loader-domain/loader-event";

/** 创建时间线测试用 icon_transition 事件。 */
function createEvent(assetId: string, durationMs: number): IconLoaderEvent {
  return {
    kind: "icon_transition",
    atMs: 500,
    assetId,
    label: assetId,
    burst: 16,
    durationMs,
    effect: {
      kind: "assembly",
      groupMode: "point",
      orderMode: "left_to_right",
      originMode: "target_position",
      motionMode: "appear",
      settleMode: "none",
      trailMode: "none",
    },
  };
}

const events = [createEvent("asset-a", 1000), createEvent("asset-b", 2000)];

describe("icon loader timeline", () => {
  it("空事件返回空帧", () => {
    const frame = resolveIconLoaderTimelineFrame({
      events: [],
      scenarioSeed: 20260610,
      elapsedMs: 100,
    });

    expect(frame).toBeNull();
  });

  it("切换完成后的 0.5s 内停留在当前 icon 且进度固定为 1", () => {
    const frame = resolveIconLoaderTimelineFrame({
      events: [events[0]],
      scenarioSeed: 20260610,
      elapsedMs: events[0].durationMs + iconLoaderHoldAfterTransitionMs - 1,
    });

    expect(frame?.event.assetId).toBe(events[0].assetId);
    expect(frame?.transitionProgress).toBe(1);
    expect(frame?.settled).toBe(true);
  });

  it("超过停留时间后切到下一个 icon", () => {
    const firstFrame = resolveIconLoaderTimelineFrame({
      events,
      scenarioSeed: 20260610,
      elapsedMs: 0,
    });
    const firstCycleMs = (firstFrame?.event.durationMs ?? 0) + iconLoaderHoldAfterTransitionMs;
    const secondFrame = resolveIconLoaderTimelineFrame({
      events,
      scenarioSeed: 20260610,
      elapsedMs: firstCycleMs,
    });

    expect(secondFrame?.event.assetId).not.toBe(firstFrame?.event.assetId);
    expect(secondFrame?.eventElapsedMs).toBe(0);
    expect(secondFrame?.transitionProgress).toBe(0);
  });

  it("多事件使用各自 durationMs 累计时间", () => {
    const firstFrame = resolveIconLoaderTimelineFrame({
      events,
      scenarioSeed: 20260610,
      elapsedMs: 0,
    });
    const firstCycleMs = (firstFrame?.event.durationMs ?? 0) + iconLoaderHoldAfterTransitionMs;
    const secondStart = resolveIconLoaderTimelineFrame({
      events,
      scenarioSeed: 20260610,
      elapsedMs: firstCycleMs,
    });
    const secondEventMidpoint = firstCycleMs + (secondStart?.event.durationMs ?? 0) / 2;
    const frame = resolveIconLoaderTimelineFrame({
      events,
      scenarioSeed: 20260610,
      elapsedMs: secondEventMidpoint,
    });

    expect(frame?.event.assetId).toBe(secondStart?.event.assetId);
    expect(frame?.eventElapsedMs).toBe((secondStart?.event.durationMs ?? 0) / 2);
    expect(frame?.transitionProgress).toBe(0.5);
  });

  it("跨轮边界继续使用轮次顺序规则，避免多 icon 相邻重复", () => {
    const firstRoundLast = resolveIconLoaderTimelineFrame({
      events,
      scenarioSeed: 20260610,
      elapsedMs: events.reduce((total, event) => total + event.durationMs + iconLoaderHoldAfterTransitionMs, 0) - 1,
    });
    const secondRoundFirst = resolveIconLoaderTimelineFrame({
      events,
      scenarioSeed: 20260610,
      elapsedMs: events.reduce((total, event) => total + event.durationMs + iconLoaderHoldAfterTransitionMs, 0),
    });

    expect(secondRoundFirst?.roundIndex).toBe(1);
    expect(secondRoundFirst?.event.assetId).not.toBe(firstRoundLast?.event.assetId);
  });
});
