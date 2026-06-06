import type { LoaderTempo } from "../loader-domain/loader-config";
import type { SeededRandom } from "./seeded-random";

/** 娱乐性标签白名单，不表达真实推理步骤或真实进度。 */
export const visualKeywordLabels = [
  "星图",
  "火花",
  "回声",
  "纸鹤",
  "灯塔",
  "钥匙",
  "气泡",
  "罗盘",
  "邮票",
  "银杏",
] as const;

/** 多色调色板，避免单一色系统治整个页面。 */
export const loaderPalettes = [
  ["#f4d35e", "#0d3b66", "#ee964b", "#f95738"],
  ["#7bdff2", "#b2f7ef", "#eff7f6", "#f7d6e0"],
  ["#c9ada7", "#4a4e69", "#9a8c98", "#f2e9e4"],
  ["#ffd166", "#06d6a0", "#118ab2", "#ef476f"],
] as const;

const tempos: LoaderTempo[] = ["calm", "normal", "fast"];

/** 按 seed 选择调色板。 */
export function pickPalette(random: SeededRandom): string[] {
  return [...random.pick(loaderPalettes)];
}

/** 按 seed 选择动画节奏。 */
export function pickTempo(random: SeededRandom): LoaderTempo {
  return random.pick(tempos);
}
