export type LoaderShowcaseSlot = {
  /** 展示槽位唯一标识，避免三实例复用同一个 React key。 */
  id: string;
  /** 用户可见的短标题。 */
  title: string;
  /** 从基础 seed 派生不同初始化状态的稳定偏移。 */
  seedOffset: number;
};

const fallbackLoaderSeed = 20260605;

/** 三个固定展示槽位，同类 Loader 用不同 seed 初始化。 */
export const loaderShowcaseSlots: LoaderShowcaseSlot[] = [
  { id: "slot-a", title: "随机初始化 A", seedOffset: 0 },
  { id: "slot-b", title: "随机初始化 B", seedOffset: 7919 },
  { id: "slot-c", title: "随机初始化 C", seedOffset: 15401 },
];

/** 为三个 Loader 展示槽位派生稳定且互不相同的 seed。 */
export function resolveLoaderShowcaseSlotSeeds(baseSeed: number | null): number[] {
  const resolvedBaseSeed = baseSeed ?? fallbackLoaderSeed;
  return loaderShowcaseSlots.map((slot) => resolvedBaseSeed + slot.seedOffset);
}
