import { describe, expect, it } from "vitest";
import {
  appendKeywordIconQueueItem,
  createEmptyKeywordIconQueueState,
  type KeywordIconQueueItem,
} from "../../src/loader-domain/keyword-icon-queue";

/** 构造关键词 icon 队列测试项。 */
function createQueueItem(index: number, assetId = `asset-${index}`): KeywordIconQueueItem {
  return {
    id: `item-${index}`,
    keyword: `keyword-${index}`,
    assetId,
    label: `Asset ${index}`,
    assetKind: "icon_resource",
    path: `/asset-${index}.json`,
    format: "pixel-json",
    width: 64,
    height: 64,
    appendedAtMs: 100 + index,
  };
}

describe("appendKeywordIconQueueItem", () => {
  it("跳过当前队列中已存在的 icon asset", () => {
    const state = [createQueueItem(1), createQueueItem(2), createQueueItem(3)].reduce(appendKeywordIconQueueItem, createEmptyKeywordIconQueueState());
    const nextState = appendKeywordIconQueueItem(state, createQueueItem(4, "asset-2"));

    expect(nextState).toBe(state);
  });

  it("重复 asset 被跳过时不移动旧项", () => {
    const state = [createQueueItem(1), createQueueItem(2), createQueueItem(3)].reduce(appendKeywordIconQueueItem, createEmptyKeywordIconQueueState());
    const nextState = appendKeywordIconQueueItem(state, {
      ...createQueueItem(4, "asset-2"),
      keyword: "new-keyword",
    });

    expect(nextState.items.map((item) => item.id)).toEqual(["item-1", "item-2", "item-3"]);
  });

  it("连续重复 keyword 被跳过时返回原队列引用", () => {
    const state = [createQueueItem(1), createQueueItem(2)].reduce(appendKeywordIconQueueItem, createEmptyKeywordIconQueueState());
    const nextState = appendKeywordIconQueueItem(state, {
      ...createQueueItem(3),
      keyword: "keyword-2",
    });

    expect(nextState).toBe(state);
  });

  it("不同 icon asset 可以正常 append", () => {
    const state = [createQueueItem(1), createQueueItem(2)].reduce(appendKeywordIconQueueItem, createEmptyKeywordIconQueueState());
    const nextState = appendKeywordIconQueueItem(state, createQueueItem(3));

    expect(nextState.items.map((item) => item.assetId)).toEqual(["asset-1", "asset-2", "asset-3"]);
  });

  it("超过 10 个时移除最旧项且剩余 icon 不重复", () => {
    const state = Array.from({ length: 10 }, (_, index) => createQueueItem(index)).reduce(
      appendKeywordIconQueueItem,
      createEmptyKeywordIconQueueState(),
    );
    const nextState = appendKeywordIconQueueItem(state, createQueueItem(10));

    expect(nextState.items.map((item) => item.id)).toEqual([
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
    expect(new Set(nextState.items.map((item) => item.assetId)).size).toBe(10);
  });

  it("asset 被挤出最近 10 个后仍禁止再次进入", () => {
    const firstRoundState = Array.from({ length: 11 }, (_, index) => createQueueItem(index)).reduce(
      appendKeywordIconQueueItem,
      createEmptyKeywordIconQueueState(),
    );
    const nextState = appendKeywordIconQueueItem(firstRoundState, {
      ...createQueueItem(100, "asset-0"),
      keyword: "keyword-second-asset-0",
    });

    expect(firstRoundState.items.map((item) => item.assetId)).not.toContain("asset-0");
    expect(nextState).toBe(firstRoundState);
    expect(nextState.appearedAssetIds.has("asset-0")).toBe(true);
  });

  it("同一 asset 在请求生命周期内第二次出现时跳过", () => {
    const firstRoundState = Array.from({ length: 11 }, (_, index) => createQueueItem(index)).reduce(
      appendKeywordIconQueueItem,
      createEmptyKeywordIconQueueState(),
    );
    const nextState = appendKeywordIconQueueItem(firstRoundState, {
      ...createQueueItem(100, "asset-0"),
      keyword: "keyword-second-asset-0",
    });

    expect(firstRoundState.items.map((item) => item.assetId)).not.toContain("asset-0");
    expect(nextState).toBe(firstRoundState);
    expect(nextState.appearedAssetIds.has("asset-0")).toBe(true);
  });

  it("被跳过的重复 asset 不改变生命周期集合", () => {
    const state = appendKeywordIconQueueItem(createEmptyKeywordIconQueueState(), createQueueItem(1, "asset-shared"));
    const nextState = appendKeywordIconQueueItem(state, {
      ...createQueueItem(2, "asset-shared"),
      keyword: "keyword-different",
    });

    expect(nextState).toBe(state);
    expect(nextState.appearedAssetIds.has("asset-shared")).toBe(true);
    expect(nextState.appearedAssetIds.size).toBe(1);
  });

  it("新队列状态不继承旧请求的已出现 icon", () => {
    const previousRequestState = appendKeywordIconQueueItem(
      createEmptyKeywordIconQueueState(),
      createQueueItem(1, "asset-shared"),
    );
    const nextRequestState = appendKeywordIconQueueItem(
      createEmptyKeywordIconQueueState(),
      createQueueItem(2, "asset-shared"),
    );

    expect(previousRequestState.appearedAssetIds.has("asset-shared")).toBe(true);
    expect(nextRequestState.items.map((item) => item.id)).toEqual(["item-2"]);
    expect(nextRequestState.appearedAssetIds.has("asset-shared")).toBe(true);
  });
});
