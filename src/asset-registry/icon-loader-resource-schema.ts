import { z } from "zod";

/** Icon Loader编码像素 schema：[x, y, paletteIndex, alphaByte]。 */
export const iconLoaderEncodedPixelSchema = z.tuple([
  z.number().int().nonnegative(),
  z.number().int().nonnegative(),
  z.number().int().nonnegative(),
  z.number().int().min(1).max(255),
]);

/** Icon Loader icon 像素图案 schema，用于清洗外部 JSON 资产。 */
export const iconLoaderResourceSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  label: z.string().min(1),
  sourceIconPath: z.string().min(1),
  baseResolution: z.object({
    columns: z.number().int().positive(),
    rows: z.number().int().positive(),
  }),
  palette: z.array(z.string().regex(/^#[0-9a-f]{6}$/i)).min(1),
  pixels: z.array(iconLoaderEncodedPixelSchema),
});
