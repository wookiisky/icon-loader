import { describe, expect, it } from "vitest";
import { appRequestReducer } from "../../src/app/app-reducer";
import { initialAppRequestState, resolveLoaderSeed, shouldPlayLoaderAnimation } from "../../src/app/app-state";

describe("appRequestReducer", () => {
  it("拒绝空输入", () => {
    const state = appRequestReducer(initialAppRequestState, {
      kind: "submit",
      requestId: "r1",
      seed: 1,
      nowMs: 100,
      prompt: "   ",
    });

    expect(state.kind).toBe("error");
    if (state.kind === "error") {
      expect(state.causeKind).toBe("empty_prompt");
    }
  });

  it("请求中拒绝重复提交", () => {
    const loadingState = appRequestReducer(initialAppRequestState, {
      kind: "submit",
      requestId: "r1",
      seed: 1,
      nowMs: 100,
      prompt: "解释流式输出",
    });

    const duplicatedState = appRequestReducer(loadingState, {
      kind: "submit",
      requestId: "r2",
      seed: 2,
      nowMs: 120,
      prompt: "第二个问题",
    });

    expect(duplicatedState.kind).toBe("error");
    if (duplicatedState.kind === "error") {
      expect(duplicatedState.causeKind).toBe("duplicate_submit");
      expect(duplicatedState.requestId).toBe("r1");
    }
  });

  it("逐块追加流式文本并完成请求", () => {
    const loadingState = appRequestReducer(initialAppRequestState, {
      kind: "submit",
      requestId: "r1",
      seed: 1,
      nowMs: 100,
      prompt: "你好",
    });

    const firstChunkState = appRequestReducer(loadingState, {
      kind: "stream_chunk",
      requestId: "r1",
      text: "第一段",
    });
    const secondChunkState = appRequestReducer(firstChunkState, {
      kind: "stream_chunk",
      requestId: "r1",
      text: "第二段",
    });
    const doneState = appRequestReducer(secondChunkState, {
      kind: "stream_done",
      requestId: "r1",
      nowMs: 300,
    });

    expect(doneState.kind).toBe("success");
    if (doneState.kind === "success") {
      expect(doneState.completedText).toBe("第一段第二段");
    }
  });

  it("Loader 播放规则同时支持手动控制和请求触发", () => {
    const loadingState = appRequestReducer(initialAppRequestState, {
      kind: "submit",
      requestId: "r1",
      seed: 1,
      nowMs: 100,
      prompt: "你好",
    });
    const doneState = appRequestReducer(loadingState, {
      kind: "stream_done",
      requestId: "r1",
      nowMs: 300,
    });

    expect(shouldPlayLoaderAnimation(initialAppRequestState, false)).toBe(false);
    expect(shouldPlayLoaderAnimation(initialAppRequestState, true)).toBe(true);
    expect(shouldPlayLoaderAnimation(loadingState, false)).toBe(true);
    expect(shouldPlayLoaderAnimation(loadingState, true)).toBe(true);
    expect(shouldPlayLoaderAnimation(doneState, false)).toBe(false);
  });

  it("请求中的 Loader seed 优先于手动 seed", () => {
    const loadingState = appRequestReducer(initialAppRequestState, {
      kind: "submit",
      requestId: "r1",
      seed: 101,
      nowMs: 100,
      prompt: "你好",
    });

    expect(resolveLoaderSeed(initialAppRequestState, null)).toBeNull();
    expect(resolveLoaderSeed(initialAppRequestState, 202)).toBe(202);
    expect(resolveLoaderSeed(loadingState, 202)).toBe(101);
  });
});
