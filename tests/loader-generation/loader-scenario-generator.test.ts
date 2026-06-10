import { describe, expect, it } from "vitest";
import { createAssetRegistry } from "../../src/asset-registry/asset-registry";
import { iconLoaderResourceGrid } from "../../src/loader-domain/icon-loader-resource";
import { generateIconLoaderScenario } from "../../src/loader-generation/icon-loader-config-generator";

const emptyRegistry = createAssetRegistry({ assets: [] });

describe("loader scenario generators", () => {
  it("同一 seed 生成稳定配置", () => {
    const firstScenario = generateIconLoaderScenario(42, emptyRegistry);
    const secondScenario = generateIconLoaderScenario(42, emptyRegistry);

    expect(firstScenario).toEqual(secondScenario);
  });

  it("不同 seed 生成不同配置", () => {
    const firstScenario = generateIconLoaderScenario(42, emptyRegistry);
    const secondScenario = generateIconLoaderScenario(43, emptyRegistry);

    expect(firstScenario).not.toEqual(secondScenario);
  });

  it("Icon Loader 使用下载 icon 资产生成不重复播放事件", () => {
    const registry = createAssetRegistry({
      assets: [
        {
          id: "pixel-icon-a",
          label: "Icon A",
          loaderKind: "icon_loader",
          assetKind: "icon_resource",
          format: "icon-loader-json",
          path: "/assets/loaders/icon-loader/patterns/a.pixel.json",
          width: iconLoaderResourceGrid.columns,
          height: iconLoaderResourceGrid.rows,
          tags: ["test"],
          license: "cc0",
          source: "test",
          attributionRequired: false,
        },
        {
          id: "pixel-icon-b",
          label: "Icon B",
          loaderKind: "icon_loader",
          assetKind: "icon_resource",
          format: "icon-loader-json",
          path: "/assets/loaders/icon-loader/patterns/b.pixel.json",
          width: iconLoaderResourceGrid.columns,
          height: iconLoaderResourceGrid.rows,
          tags: ["test"],
          license: "cc0",
          source: "test",
          attributionRequired: false,
        },
      ],
    });
    const scenario = generateIconLoaderScenario(18, registry);
    const events = scenario.events.map((event) => {
      if (event.kind !== "icon_transition") {
        throw new Error("测试只接收 Icon Loader 切换事件。");
      }
      return event;
    });

    const assetIds = events.map((event) => event.assetId);
    const uniqueAssetIds = new Set(assetIds);

    expect(assetIds).toHaveLength(2);
    expect(uniqueAssetIds.size).toBe(assetIds.length);
    expect(scenario.assets).toHaveLength(2);
    expect(scenario.assets[0]?.width).toBe(iconLoaderResourceGrid.columns);
    expect(events.every((event) => event.durationMs > 0)).toBe(true);
    expect(events.every((event) => event.effect.kind.length > 0)).toBe(true);
  });
});
