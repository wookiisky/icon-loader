import type { AssetRegistry } from "../asset-registry/asset-registry";
import type { LoaderScenario } from "../loader-domain/loader-config";
import type { IconLoaderEvent } from "../loader-domain/loader-event";
import type { LoaderAssetManifestItem } from "../asset-registry/asset-manifest-schema";
import { selectIconLoaderTransitionEffect } from "../loader-domain/icon-loader-transition-effect";
import { createSeededRandom } from "./seeded-random";
import type { SeededRandom } from "./seeded-random";
import { pickPalette, pickTempo } from "./generation-shared";

/** 从 icon 资产池中不放回抽取一轮Icon Loader图形。 */
function pickNonRepeatingIconRound(
  random: SeededRandom,
  iconAssets: readonly LoaderAssetManifestItem[],
): LoaderAssetManifestItem[] {
  const availableAssets = [...iconAssets];
  const selectedAssets: LoaderAssetManifestItem[] = [];

  while (availableAssets.length > 0) {
    const selectedIndex = random.nextInt(0, availableAssets.length - 1);
    const [selectedAsset] = availableAssets.splice(selectedIndex, 1);
    selectedAssets.push(selectedAsset);
  }

  return selectedAssets;
}

/** 生成Icon Loader Loader 配置，只表达娱乐性像素重组。 */
export function generateIconLoaderScenario(seed: number, assetRegistry: AssetRegistry): LoaderScenario {
  const random = createSeededRandom(seed);
  const iconAssets = assetRegistry.findByLoaderKind("icon_loader").filter((asset) => {
    return asset.assetKind === "icon_resource";
  });
  const selectedAssets = pickNonRepeatingIconRound(random, iconAssets);
  const events: IconLoaderEvent[] = selectedAssets.map((asset, index) => {
    const atMs = 500 + index * random.nextInt(900, 1300);

    return {
      kind: "icon_transition",
      atMs,
      assetId: asset.id,
      label: asset.label ?? asset.id,
      burst: random.nextInt(12, 24),
      durationMs: random.nextInt(1500, 2100),
      effect: selectIconLoaderTransitionEffect(seed, asset.id, atMs),
    };
  });

  return {
    kind: "icon_loader",
    seed,
    palette: pickPalette(random),
    tempo: pickTempo(random),
    assets: selectedAssets.map((asset) => ({
      id: asset.id,
      label: asset.label,
      assetKind: asset.assetKind,
      path: asset.path,
      format: asset.format,
      width: asset.width,
      height: asset.height,
    })),
    events,
  };
}
