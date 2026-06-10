import { describe, expect, it } from "vitest";
import {
  appendThoughtTextAndExtractKeywords,
  createThoughtKeywordExtractorState,
  flushThoughtKeywordExtractor,
  normalizeThoughtKeyword,
} from "../../src/loader-domain/thought-keyword";

describe("thought-keyword", () => {
  it("规范化关键词并过滤标点", () => {
    expect(normalizeThoughtKeyword(" Database-Schema! ")).toBe("database schema");
  });

  it("从英文和中文 thought 文本中提取关键词", () => {
    const result = appendThoughtTextAndExtractKeywords(
      createThoughtKeywordExtractorState(),
      "Search database schema, 检查索引，然后 build query. ",
    );

    expect(result.keywords.map((keyword) => keyword.value)).toEqual(["search", "database", "schema", "检查索引"]);
  });

  it("保留末尾半截 token 并在后续片段完成后提取", () => {
    const firstResult = appendThoughtTextAndExtractKeywords(createThoughtKeywordExtractorState(), "Need data");
    const secondResult = appendThoughtTextAndExtractKeywords(firstResult.state, "base schema. ");

    expect(firstResult.keywords.map((keyword) => keyword.value)).toEqual(["need"]);
    expect(secondResult.keywords.map((keyword) => keyword.value)).toEqual(["database", "schema"]);
  });

  it("流结束时冲洗最后一个没有标点结尾的关键词", () => {
    const result = appendThoughtTextAndExtractKeywords(createThoughtKeywordExtractorState(), "Need database");
    const flushedResult = flushThoughtKeywordExtractor(result.state);

    expect(flushedResult.keywords.map((keyword) => keyword.value)).toEqual(["database"]);
  });

  it("同一请求内跳过重复关键词", () => {
    const firstResult = appendThoughtTextAndExtractKeywords(createThoughtKeywordExtractorState(), "database schema. ");
    const secondResult = appendThoughtTextAndExtractKeywords(firstResult.state, "database schema. ");

    expect(firstResult.keywords.map((keyword) => keyword.value)).toEqual(["database", "schema"]);
    expect(secondResult.keywords).toEqual([]);
  });
});
