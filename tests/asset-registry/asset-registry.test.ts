import { describe, expect, it } from "vitest";
import { createAssetRegistry } from "../../src/asset-registry/asset-registry";

describe("createAssetRegistry", () => {
  it("非法 manifest 回退为空资产表", () => {
    const registry = createAssetRegistry({ bad: true });

    expect(registry.assets).toEqual([]);
  });

  it("按 Loader 类型和标签查询资产", () => {
    const registry = createAssetRegistry({
      assets: [
        {
          id: "icon-resource-1",
          loaderKind: "icon_loader",
          assetKind: "icon_resource",
          format: "icon-loader-json",
          path: "/assets/loaders/icon-loader/patterns/icon-resource-1.pixel.json",
          width: 128,
          height: 128,
          tags: ["flat-color-icons", "test"],
          license: "cc0",
          source: "test",
          attributionRequired: false,
        },
      ],
    });

    expect(registry.findByLoaderKind("icon_loader")).toHaveLength(1);
    expect(registry.findByTag("icon_loader", "test")[0]?.id).toBe("icon-resource-1");
  });
});
