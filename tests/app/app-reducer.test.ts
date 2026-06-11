import { describe, expect, it } from "vitest";
import { appRequestReducer } from "../../src/app/app-reducer";
import { initialAppRequestState, resolveLoaderSeed, shouldPlayLoaderAnimation } from "../../src/app/app-state";
import type { KeywordIconQueueItem } from "../../src/loader-domain/keyword-icon-queue";

/** 构造 reducer 测试用的关键词 icon 队列项。 */
function createKeywordIconQueueItem(index: number): KeywordIconQueueItem {
  return {
    id: `item-${index}`,
    keyword: `keyword-${index}`,
    assetId: `asset-${index}`,
    label: `Asset ${index}`,
    assetKind: "icon_resource",
    path: `/asset-${index}.json`,
    format: "pixel-json",
    width: 64,
    height: 64,
    appendedAtMs: 100 + index,
  };
}

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

  it("追加 thought 关键词 icon 队列并限制最多 10 个", () => {
    let state = appRequestReducer(initialAppRequestState, {
      kind: "submit",
      requestId: "r1",
      seed: 1,
      nowMs: 100,
      prompt: "你好",
    });

    for (let index = 0; index < 11; index += 1) {
      state = appRequestReducer(state, {
        kind: "thought_keyword_icon",
        requestId: "r1",
        item: createKeywordIconQueueItem(index),
      });
    }

    expect(state.kind).toBe("loading");
    if (state.kind === "loading") {
      expect(state.keywordIconQueueState.items).toHaveLength(10);
      expect(state.keywordIconQueueState.items.map((item) => item.id)).toEqual([
        "item-1",
        "item-2",
        "item-3",
        "item-4",
        "item-5",
        "item-6",
        "item-7",
        "item-8",
        "item-9",
        "item-10",
      ]);
    }
  });

  it("跳过连续重复关键词 icon 且忽略不匹配请求", () => {
    const loadingState = appRequestReducer(initialAppRequestState, {
      kind: "submit",
      requestId: "r1",
      seed: 1,
      nowMs: 100,
      prompt: "你好",
    });
    const firstState = appRequestReducer(loadingState, {
      kind: "thought_keyword_icon",
      requestId: "r1",
      item: createKeywordIconQueueItem(1),
    });
    const duplicatedState = appRequestReducer(firstState, {
      kind: "thought_keyword_icon",
      requestId: "r1",
      item: {
        ...createKeywordIconQueueItem(2),
        keyword: "keyword-1",
      },
    });
    const staleState = appRequestReducer(duplicatedState, {
      kind: "thought_keyword_icon",
      requestId: "stale",
      item: createKeywordIconQueueItem(3),
    });

    expect(staleState.kind).toBe("loading");
    if (staleState.kind === "loading") {
      expect(staleState.keywordIconQueueState.items.map((item) => item.id)).toEqual(["item-1"]);
    }
  });

  it("当前 10 个内重复 icon 会跳过", () => {
    const loadingState = appRequestReducer(initialAppRequestState, {
      kind: "submit",
      requestId: "r1",
      seed: 1,
      nowMs: 100,
      prompt: "你好",
    });
    const firstState = appRequestReducer(loadingState, {
      kind: "thought_keyword_icon",
      requestId: "r1",
      item: createKeywordIconQueueItem(1),
    });
    const duplicatedState = appRequestReducer(firstState, {
      kind: "thought_keyword_icon",
      requestId: "r1",
      item: {
        ...createKeywordIconQueueItem(2),
        keyword: "keyword-new",
        assetId: "asset-1",
      },
    });

    expect(duplicatedState.kind).toBe("loading");
    if (duplicatedState.kind === "loading") {
      expect(duplicatedState.keywordIconQueueState.items.map((item) => item.id)).toEqual(["item-1"]);
      expect(duplicatedState.keywordIconQueueState.appearedAssetIds.has("asset-1")).toBe(true);
    }
  });

  it("同一 icon 在请求生命周期内最多成功进入一次", () => {
    let state = appRequestReducer(initialAppRequestState, {
      kind: "submit",
      requestId: "r1",
      seed: 1,
      nowMs: 100,
      prompt: "你好",
    });

    for (let index = 0; index < 11; index += 1) {
      state = appRequestReducer(state, {
        kind: "thought_keyword_icon",
        requestId: "r1",
        item: createKeywordIconQueueItem(index),
      });
    }

    const secondAttemptState = appRequestReducer(state, {
      kind: "thought_keyword_icon",
      requestId: "r1",
      item: {
        ...createKeywordIconQueueItem(100),
        keyword: "keyword-second-asset-0",
        assetId: "asset-0",
      },
    });

    expect(secondAttemptState.kind).toBe("loading");
    if (secondAttemptState.kind === "loading") {
      expect(secondAttemptState.keywordIconQueueState.items.map((item) => item.assetId)).not.toContain("asset-0");
      expect(secondAttemptState.keywordIconQueueState.appearedAssetIds.has("asset-0")).toBe(true);
    }
  });

  it("新请求不继承上一个请求的 icon 去重状态", () => {
    const firstLoadingState = appRequestReducer(initialAppRequestState, {
      kind: "submit",
      requestId: "r1",
      seed: 1,
      nowMs: 100,
      prompt: "你好",
    });
    const firstIconState = appRequestReducer(firstLoadingState, {
      kind: "thought_keyword_icon",
      requestId: "r1",
      item: createKeywordIconQueueItem(0),
    });
    const doneState = appRequestReducer(firstIconState, {
      kind: "stream_done",
      requestId: "r1",
      nowMs: 200,
    });
    const secondLoadingState = appRequestReducer(doneState, {
      kind: "submit",
      requestId: "r2",
      seed: 2,
      nowMs: 300,
      prompt: "第二个问题",
    });
    const secondIconState = appRequestReducer(secondLoadingState, {
      kind: "thought_keyword_icon",
      requestId: "r2",
      item: {
        ...createKeywordIconQueueItem(100),
        keyword: "keyword-repeat-asset-0",
        assetId: "asset-0",
      },
    });

    expect(secondIconState.kind).toBe("loading");
    if (secondIconState.kind === "loading") {
      expect(secondIconState.keywordIconQueueState.items.map((item) => item.assetId)).toEqual(["asset-0"]);
      expect(secondIconState.keywordIconQueueState.appearedAssetIds.has("asset-0")).toBe(true);
    }
  });
});
