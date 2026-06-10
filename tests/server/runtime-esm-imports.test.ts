import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type RuntimeImportCheckTarget = {
  /** 需要直接在 Node ESM 或 Vercel Function 中运行的源码文件。 */
  filePath: string;
  /** 文件内允许跳过的本地相对 import。 */
  allowedSpecifiers?: string[];
};

const runtimeImportTargets: RuntimeImportCheckTarget[] = [
  { filePath: "api/gemini/stream.ts" },
  { filePath: "server/gemini-stream-service.ts" },
  { filePath: "server/gemini-stream-client.ts" },
  { filePath: "server/gemini-stream-route.ts" },
  { filePath: "server/server.ts" },
];

const importSpecifierPattern =
  /import\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["'](?<specifier>\.{1,2}\/[^"']+)["']/g;

/** 判断本地相对 import 是否已经声明运行时扩展名。 */
function hasRuntimeExtension(specifier: string): boolean {
  return /\.(?:js|json|css|svg|png|jpg|jpeg|gif|webp|wasm)$/.test(specifier);
}

describe("Node ESM runtime imports", () => {
  it("Vercel 和本地 server 运行时入口链的相对 import 必须带 .js 后缀", () => {
    const violations = runtimeImportTargets.flatMap((target) => {
      const absolutePath = resolve(process.cwd(), target.filePath);
      const source = readFileSync(absolutePath, "utf8");
      const allowedSpecifiers = new Set(target.allowedSpecifiers ?? []);
      const matches = [...source.matchAll(importSpecifierPattern)];

      return matches
        .map((match) => match.groups?.specifier)
        .filter((specifier): specifier is string => specifier !== undefined)
        .filter((specifier) => !allowedSpecifiers.has(specifier))
        .filter((specifier) => !hasRuntimeExtension(specifier))
        .map((specifier) => `${target.filePath}: ${specifier}`);
    });

    expect(violations).toEqual([]);
  });
});
