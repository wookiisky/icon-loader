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
  /** 本次请求生命周期内每个 icon 成功进入队列的次数。 */
  assetAppearanceCounts: ReadonlyMap<string, number>;
};

const maxKeywordIconQueueLength = 10;
const maxKeywordIconAppearancesPerRequest = 2;

/** 创建空关键词 icon 队列状态。 */
export function createEmptyKeywordIconQueueState(): KeywordIconQueueState {
  return {
    items: [],
    assetAppearanceCounts: new Map<string, number>(),
  };
}

/** 将新 icon 追加到队列尾部，并执行最近窗口和请求生命周期去重。 */
export function appendKeywordIconQueueItem(
  state: KeywordIconQueueState,
  item: KeywordIconQueueItem,
): KeywordIconQueueState {
  if (state.items.some((queueItem) => queueItem.assetId === item.assetId)) {
    return state;
  }

  const currentAppearanceCount = state.assetAppearanceCounts.get(item.assetId) ?? 0;
  if (currentAppearanceCount >= maxKeywordIconAppearancesPerRequest) {
    return state;
  }

  const lastItem = state.items.at(-1);
  if (lastItem !== undefined && lastItem.keyword === item.keyword) {
    return state;
  }

  const nextCounts = new Map(state.assetAppearanceCounts);
  nextCounts.set(item.assetId, currentAppearanceCount + 1);

  return {
    items: [...state.items, item].slice(-maxKeywordIconQueueLength),
    assetAppearanceCounts: nextCounts,
  };
}
