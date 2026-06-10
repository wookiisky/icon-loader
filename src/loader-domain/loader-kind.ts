/** Loader 类型，集中约束所有可展示动画。 */
export type LoaderKind = "icon_loader" | "keyword_icon_queue_loader";

/** Icon Loader 展示顺序，页面按此顺序渲染。 */
export const defaultLoaderKinds: LoaderKind[] = ["icon_loader"];
