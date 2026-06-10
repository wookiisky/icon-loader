import type { AssetRegistry } from "./asset-registry";
import type { LoaderAssetManifestItem } from "./asset-manifest-schema";

/** 关键词匹配 icon 的置信来源。 */
export type KeywordIconMatchConfidence = "exact" | "contains" | "fallback";

/** 关键词匹配到的 icon 资产。 */
export type KeywordIconAssetMatch = {
  /** 用户不可见的规范化关键词。 */
  keyword: string;
  /** 匹配到的资产。 */
  asset: LoaderAssetManifestItem;
  /** 匹配来源。 */
  confidence: KeywordIconMatchConfidence;
};

const fallbackTags = ["assistant", "search", "questions", "question", "answers", "idea", "about"];

/** 在现有 icon_loader 资产池中查找最贴近关键词的像素 icon。 */
export function matchKeywordToIconAsset(
  keyword: string,
  assetRegistry: AssetRegistry,
): KeywordIconAssetMatch | null {
  const normalizedKeyword = normalizeAssetMatchText(keyword);
  if (normalizedKeyword.length === 0) {
    return null;
  }

  const assets = assetRegistry.assets.filter((asset) => {
    return asset.loaderKind === "icon_loader" && asset.assetKind === "icon_resource";
  });
  const exactMatch = assets.find((asset) => {
    return collectAssetMatchKeys(asset).some((key) => key === normalizedKeyword);
  });

  if (exactMatch !== undefined) {
    return {
      keyword: normalizedKeyword,
      asset: exactMatch,
      confidence: "exact",
    };
  }

  const containsMatch = assets.find((asset) => {
    return collectAssetMatchKeys(asset).some((key) => key.includes(normalizedKeyword) || normalizedKeyword.includes(key));
  });

  if (containsMatch !== undefined) {
    return {
      keyword: normalizedKeyword,
      asset: containsMatch,
      confidence: "contains",
    };
  }

  const fallbackAsset = findFallbackAsset(assets);
  if (fallbackAsset === undefined) {
    return null;
  }

  return {
    keyword: normalizedKeyword,
    asset: fallbackAsset,
    confidence: "fallback",
  };
}

/** 规范化 icon 匹配字段，统一大小写和分隔符。 */
function normalizeAssetMatchText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^\p{Letter}\p{Number}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 收集单个资产可参与关键词匹配的字段。 */
function collectAssetMatchKeys(asset: LoaderAssetManifestItem): string[] {
  return [asset.id, asset.label ?? "", ...asset.tags].map(normalizeAssetMatchText).filter((key) => key.length > 0);
}

/** 找到稳定兜底 icon，确保没有精确匹配时仍可展示。 */
function findFallbackAsset(assets: readonly LoaderAssetManifestItem[]): LoaderAssetManifestItem | undefined {
  return fallbackTags
    .map((tag) => assets.find((asset) => collectAssetMatchKeys(asset).some((key) => key === tag || key.includes(tag))))
    .find((asset): asset is LoaderAssetManifestItem => asset !== undefined);
}
