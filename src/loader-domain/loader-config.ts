import type { LoaderEvent } from "./loader-event";
import type { LoaderKind } from "./loader-kind";

/** Loader 节奏，只影响娱乐性动画速度，不表达真实进度。 */
export type LoaderTempo = "calm" | "normal" | "fast";

/** Loader 引用的资产 ID，MVP 可为空，由渲染器程序化兜底。 */
export type LoaderAssetRef = {
  /** 全局唯一资产 ID。 */
  id: string;
  /** 可选展示名称。 */
  label?: string;
  /** 资产类型。 */
  assetKind: string;
  /** 浏览器可访问路径。 */
  path: string;
  /** 资产格式。 */
  format: string;
  /** 资产宽度。 */
  width: number;
  /** 资产高度。 */
  height: number;
};

/** 运行时消费的 Loader 场景配置。 */
export type LoaderScenario = {
  kind: LoaderKind;
  seed: number;
  palette: string[];
  tempo: LoaderTempo;
  assets: LoaderAssetRef[];
  events: LoaderEvent[];
};
