import { describe, expect, it } from "vitest";
import {
  iconLoaderTransitionEffectPresets,
  selectIconLoaderTransitionEffect,
} from "../../src/loader-domain/icon-loader-transition-effect";

describe("icon loader transition effect", () => {
  it("同一上下文稳定选择切换效果", () => {
    const firstEffect = selectIconLoaderTransitionEffect(20260606, "pixel-icon-test", 500);
    const secondEffect = selectIconLoaderTransitionEffect(20260606, "pixel-icon-test", 500);

    expect(firstEffect).toEqual(secondEffect);
  });

  it("切换效果只来自显式预设族", () => {
    const selectedKinds = Array.from({ length: 24 }, (_, index) => {
      return selectIconLoaderTransitionEffect(20260606 + index, "pixel-icon-test", 500 + index * 97).kind;
    });
    const presetKinds = new Set(iconLoaderTransitionEffectPresets.map((effect) => effect.kind));

    selectedKinds.forEach((kind) => {
      expect(presetKinds).toContain(kind);
    });
  });

  it("旧填充效果保留为通用装配参数", () => {
    const orderedFillPreset = iconLoaderTransitionEffectPresets.find((effect) => {
      return effect.kind === "assembly" && effect.originMode === "target_position" && effect.motionMode === "appear";
    });

    expect(orderedFillPreset).toMatchObject({
      kind: "assembly",
      groupMode: "point",
      originMode: "target_position",
      motionMode: "appear",
    });
  });
});
