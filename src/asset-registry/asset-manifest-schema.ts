import { z } from "zod";

/** 单个 Loader 资产的清单校验 schema。 */
export const loaderAssetManifestItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).optional(),
  loaderKind: z.enum(["icon_loader"]),
  assetKind: z.string().min(1),
  format: z.string().min(1),
  path: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  tags: z.array(z.string().min(1)),
  license: z.string().min(1),
  source: z.string().min(1),
  attributionRequired: z.boolean(),
});

/** Loader 资产清单根对象 schema。 */
export const loaderAssetManifestSchema = z.object({
  assets: z.array(loaderAssetManifestItemSchema),
});

/** 单个 Loader 资产清单项类型。 */
export type LoaderAssetManifestItem = z.infer<typeof loaderAssetManifestItemSchema>;

/** Loader 资产清单类型。 */
export type LoaderAssetManifest = z.infer<typeof loaderAssetManifestSchema>;
