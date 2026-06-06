/** Icon Loader 的组装事件，只表达视觉重组，不表达真实进度。 */
export type IconLoaderEvent = {
  kind: "pixel_assemble";
  atMs: number;
  assetId: string;
  label: string;
  burst: number;
};

/** 所有 Loader 事件联合类型。 */
export type LoaderEvent = IconLoaderEvent;
