import type { AssetRegistry } from "../asset-registry/asset-registry";
import type { LoaderScenario } from "../loader-domain/loader-config";
import type { LoaderKind } from "../loader-domain/loader-kind";
import { generateIconLoaderScenario } from "./icon-loader-config-generator";

/** 根据 Loader 类型分发到对应配置生成器。 */
export function generateLoaderScenario(kind: LoaderKind, seed: number, assetRegistry: AssetRegistry): LoaderScenario {
  void kind;
  return generateIconLoaderScenario(seed, assetRegistry);
}
