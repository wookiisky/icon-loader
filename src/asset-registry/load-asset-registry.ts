import { createAssetRegistry } from "./asset-registry";
import type { AssetRegistry } from "./asset-registry";

/** 加载资产清单，失败时回退为空清单，避免影响主回复链路。 */
export async function loadAssetRegistry(): Promise<AssetRegistry> {
  try {
    const response = await fetch("/assets/loaders/manifest.json");
    const manifest: unknown = await response.json();
    return createAssetRegistry(manifest);
  } catch {
    return createAssetRegistry({ assets: [] });
  }
}
