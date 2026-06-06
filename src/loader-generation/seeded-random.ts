/** 可复现随机数生成器，确保同一 seed 得到稳定 Loader 配置。 */
export type SeededRandom = {
  nextFloat: () => number;
  nextInt: (minInclusive: number, maxInclusive: number) => number;
  pick: <T>(items: readonly T[]) => T;
};

/** 创建 Mulberry32 随机数生成器，适合轻量配置生成。 */
export function createSeededRandom(seed: number): SeededRandom {
  let state = seed >>> 0;

  function nextFloat(): number {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  return {
    nextFloat,
    nextInt(minInclusive: number, maxInclusive: number): number {
      const min = Math.ceil(minInclusive);
      const max = Math.floor(maxInclusive);
      return Math.floor(nextFloat() * (max - min + 1)) + min;
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) {
        throw new Error("随机选择列表不能为空。");
      }

      return items[this.nextInt(0, items.length - 1)];
    },
  };
}
