/** Thinking 关键词队列中的单个像素 icon。 */
export type KeywordIconQueueItem = {
  /** 队列内唯一 ID，用于保持动画连续。 */
  id: string;
  /** 触发该 icon 的关键词。 */
  keyword: string;
  /** 匹配到的 icon 资产 ID。 */
  assetId: string;
  /** icon 展示名称。 */
  label: string;
  /** 资产类型。 */
  assetKind: string;
  /** 浏览器可访问的像素资源路径。 */
  path: string;
  /** 资源格式。 */
  format: string;
  /** 原始资源宽度。 */
  width: number;
  /** 原始资源高度。 */
  height: number;
  /** 加入队列的时间戳。 */
  appendedAtMs: number;
};

/** Thinking 关键词队列的完整请求内状态。 */
export type KeywordIconQueueState = {
  /** 最近可展示的 icon 队列项。 */
  items: KeywordIconQueueItem[];
  /** 本次请求生命周期内已成功进入队列的 icon 资产 ID。 */
  appearedAssetIds: ReadonlySet<string>;
};

const maxKeywordIconQueueLength = 10;

/** 创建空关键词 icon 队列状态。 */
export function createEmptyKeywordIconQueueState(): KeywordIconQueueState {
  return {
    items: [],
    appearedAssetIds: new Set<string>(),
  };
}

/** 将新 icon 追加到队列尾部，并执行请求生命周期去重。 */
export function appendKeywordIconQueueItem(
  state: KeywordIconQueueState,
  item: KeywordIconQueueItem,
): KeywordIconQueueState {
  if (state.appearedAssetIds.has(item.assetId)) {
    return state;
  }

  const lastItem = state.items.at(-1);
  if (lastItem !== undefined && lastItem.keyword === item.keyword) {
    return state;
  }

  const nextAppearedAssetIds = new Set(state.appearedAssetIds);
  nextAppearedAssetIds.add(item.assetId);

  return {
    items: [...state.items, item].slice(-maxKeywordIconQueueLength),
    appearedAssetIds: nextAppearedAssetIds,
  };
}
