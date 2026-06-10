import { describe, expect, it } from "vitest";
import { createAssetRegistry } from "../../src/asset-registry/asset-registry";
import { matchKeywordToIconAsset } from "../../src/asset-registry/keyword-icon-asset-matcher";

const manifest = {
  assets: [
    {
      id: "pixel-icon-flat-color-icons-assistant",
      label: "Assistant",
      loaderKind: "icon_loader",
      assetKind: "icon_resource",
      format: "pixel-json",
      path: "/assistant.json",
      width: 64,
      height: 64,
      tags: ["flat-color-icons", "assistant"],
      license: "MIT",
      source: "test",
      attributionRequired: false,
    },
    {
      id: "pixel-icon-flat-color-icons-database",
      label: "Database",
      loaderKind: "icon_loader",
      assetKind: "icon_resource",
      format: "pixel-json",
      path: "/database.json",
      width: 64,
      height: 64,
      tags: ["flat-color-icons", "database"],
      license: "MIT",
      source: "test",
      attributionRequired: false,
    },
    {
      id: "pixel-icon-flat-color-icons-search",
      label: "Search",
      loaderKind: "icon_loader",
      assetKind: "icon_resource",
      format: "pixel-json",
      path: "/search.json",
      width: 64,
      height: 64,
      tags: ["flat-color-icons", "search"],
      license: "MIT",
      source: "test",
      attributionRequired: false,
    },
  ],
};

describe("matchKeywordToIconAsset", () => {
  it("优先使用 tag 精确匹配", () => {
    const registry = createAssetRegistry(manifest);
    const match = matchKeywordToIconAsset("database", registry);

    expect(match?.asset.id).toBe("pixel-icon-flat-color-icons-database");
    expect(match?.confidence).toBe("exact");
  });

  it("支持 label 包含匹配", () => {
    const registry = createAssetRegistry(manifest);
    const match = matchKeywordToIconAsset("data", registry);

    expect(match?.asset.id).toBe("pixel-icon-flat-color-icons-database");
    expect(match?.confidence).toBe("contains");
  });

  it("找不到匹配时使用稳定兜底 icon", () => {
    const registry = createAssetRegistry(manifest);
    const match = matchKeywordToIconAsset("unmatched", registry);

    expect(match?.asset.id).toBe("pixel-icon-flat-color-icons-assistant");
    expect(match?.confidence).toBe("fallback");
  });

  it("没有可用兜底资产时返回 null", () => {
    const registry = createAssetRegistry({ assets: [] });

    expect(matchKeywordToIconAsset("database", registry)).toBeNull();
  });
});
