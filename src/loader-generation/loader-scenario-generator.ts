import type { AssetRegistry } from "../asset-registry/asset-registry";
import type { LoaderScenario } from "../loader-domain/loader-config";
import type { LoaderKind } from "../loader-domain/loader-kind";
import { generateIconLoaderScenario } from "./icon-loader-config-generator";

/** 根据 Loader 类型分发到对应配置生成器。 */
export function generateLoaderScenario(kind: LoaderKind, seed: number, assetRegistry: AssetRegistry): LoaderScenario {
  if (kind === "keyword_icon_queue_loader") {
    return {
      kind,
      seed,
      palette: ["#15bfd6", "#6d4aff", "#f4d35e", "#151822"],
      tempo: "normal",
      assets: [],
      events: [],
    };
  }

  return generateIconLoaderScenario(seed, assetRegistry);
}
