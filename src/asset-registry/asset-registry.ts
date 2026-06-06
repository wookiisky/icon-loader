import type { LoaderKind } from "../loader-domain/loader-kind";
import {
  loaderAssetManifestSchema,
  type LoaderAssetManifest,
  type LoaderAssetManifestItem,
} from "./asset-manifest-schema";

/** 资产注册表，负责读取边界清洗后的可用资产。 */
export type AssetRegistry = {
  assets: LoaderAssetManifestItem[];
  findByLoaderKind: (loaderKind: LoaderKind) => LoaderAssetManifestItem[];
  findByTag: (loaderKind: LoaderKind, tag: string) => LoaderAssetManifestItem[];
};

/** 解析并过滤资产清单，核心逻辑只消费结构合法的资产。 */
export function createAssetRegistry(rawManifest: unknown): AssetRegistry {
  const parseResult = loaderAssetManifestSchema.safeParse(rawManifest);
  const manifest: LoaderAssetManifest = parseResult.success ? parseResult.data : { assets: [] };
  const assets = manifest.assets.filter((asset) => asset.license.trim().length > 0 && asset.source.trim().length > 0);

  return {
    assets,
    findByLoaderKind(loaderKind: LoaderKind): LoaderAssetManifestItem[] {
      return assets.filter((asset) => asset.loaderKind === loaderKind);
    },
    findByTag(loaderKind: LoaderKind, tag: string): LoaderAssetManifestItem[] {
      return assets.filter((asset) => asset.loaderKind === loaderKind && asset.tags.includes(tag));
    },
  };
}
