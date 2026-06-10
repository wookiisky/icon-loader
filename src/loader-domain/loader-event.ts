import type { IconLoaderTransitionEffect } from "./icon-loader-transition-effect";

/** Icon Loader 的图标切换事件，只表达视觉切换，不表达真实进度。 */
export type IconLoaderEvent = {
  kind: "icon_transition";
  /** 事件计划开始时间，仅用于同一场景内稳定派生参数。 */
  atMs: number;
  /** 切换后的目标图标资产 ID。 */
  assetId: string;
  /** 切换后的目标图标展示名称。 */
  label: string;
  /** 切换强度，影响轨迹长度、脉冲和随机扰动幅度。 */
  burst: number;
  /** 单次切换动画时长。 */
  durationMs: number;
  /** 本次切换使用的效果配置。 */
  effect: IconLoaderTransitionEffect;
};

/** Thinking 关键词触发的队列追加事件，用于显式表达实时队列动画。 */
export type KeywordIconQueueEvent = {
  kind: "keyword_icon_append";
  /** 事件发生时间，仅用于动画稳定派生。 */
  atMs: number;
  /** 触发队列追加的关键词。 */
  keyword: string;
  /** 匹配到的目标资产 ID。 */
  assetId: string;
  /** 目标 icon 展示名称。 */
  label: string;
};

/** 所有 Loader 事件联合类型。 */
export type LoaderEvent = IconLoaderEvent | KeywordIconQueueEvent;
