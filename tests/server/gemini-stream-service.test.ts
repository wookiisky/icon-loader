import { beforeEach, describe, expect, it, vi } from "vitest";

const geminiServiceMocks = vi.hoisted(() => ({
  readGeminiServerConfig: vi.fn(),
  streamGeminiEvents: vi.fn(),
}));

vi.mock("../../server/gemini-stream-client", () => ({
  readGeminiServerConfig: geminiServiceMocks.readGeminiServerConfig,
  streamGeminiEvents: geminiServiceMocks.streamGeminiEvents,
}));

import {
  createGeminiStreamEventSource,
  geminiStreamRequestBodyLimitBytes,
  isGeminiStreamBodyTooLarge,
  parseGeminiStreamRequestBody,
  streamGeminiServerEvents,
  validateGeminiStreamAccess,
} from "../../server/gemini-stream-service";

async function collectEvents<T>(events: AsyncGenerator<T>): Promise<T[]> {
  const collectedEvents = [];
  for await (const event of events) {
    collectedEvents.push(event);
  }
  return collectedEvents;
}

async function* createMixedGeminiEvents(): AsyncGenerator<
  { kind: "text_chunk"; text: string } | { kind: "thought_text"; text: string }
> {
  yield { kind: "thought_text", text: "Search schema and cache. " };
  yield { kind: "text_chunk", text: "第一段" };
  yield { kind: "thought_text", text: "Build answer. " };
  yield { kind: "text_chunk", text: "第二段" };
}

describe("parseGeminiStreamRequestBody", () => {
  it("清洗并校验有效请求体", () => {
    const result = parseGeminiStreamRequestBody({ prompt: "  你好  " });

    expect(result).toEqual({
      kind: "valid",
      prompt: "你好",
    });
  });

  it("拒绝空问题", () => {
    const result = parseGeminiStreamRequestBody({ prompt: "   " });

    expect(result).toEqual({
      kind: "invalid",
      statusCode: 400,
      body: {
        message: "请输入有效问题。",
        causeKind: "gemini_request_failed",
      },
    });
  });
});

describe("isGeminiStreamBodyTooLarge", () => {
  it("按 32KB 上限判断请求体大小", () => {
    expect(isGeminiStreamBodyTooLarge(String(geminiStreamRequestBodyLimitBytes))).toBe(false);
    expect(isGeminiStreamBodyTooLarge(String(geminiStreamRequestBodyLimitBytes + 1))).toBe(true);
    expect(isGeminiStreamBodyTooLarge("not-a-number")).toBe(false);
  });
});

describe("validateGeminiStreamAccess", () => {
  it("PASS 缺失时返回服务端配置错误", () => {
    const result = validateGeminiStreamAccess(new URLSearchParams("pass=secret"), {});

    expect(result).toEqual({
      kind: "configuration_error",
      statusCode: 500,
      body: {
        message: "缺少 PASS 环境变量。",
        causeKind: "gemini_request_failed",
      },
    });
  });

  it("pass 缺失时拒绝调用 Gemini", () => {
    const result = validateGeminiStreamAccess(new URLSearchParams(""), { PASS: "secret" });

    expect(result).toEqual({
      kind: "forbidden",
      statusCode: 403,
      body: {
        message: "无权限调用 Gemini。",
        causeKind: "gemini_access_denied",
      },
    });
  });

  it("pass 重复时拒绝调用 Gemini", () => {
    const result = validateGeminiStreamAccess(new URLSearchParams("pass=secret&pass=wrong"), { PASS: "secret" });

    expect(result.kind).toBe("forbidden");
  });

  it("只清洗 PASS 配置值，不清洗 URL pass", () => {
    expect(validateGeminiStreamAccess(new URLSearchParams("pass=secret"), { PASS: " secret " })).toEqual({
      kind: "valid",
    });
    expect(validateGeminiStreamAccess(new URLSearchParams("pass=%20secret%20"), { PASS: " secret " }).kind).toBe(
      "forbidden",
    );
  });
});

describe("createGeminiStreamEventSource", () => {
  beforeEach(() => {
    geminiServiceMocks.readGeminiServerConfig.mockReset();
    geminiServiceMocks.streamGeminiEvents.mockReset();
  });

  it("配置错误时返回明确错误结果", () => {
    geminiServiceMocks.readGeminiServerConfig.mockImplementation(() => {
      throw new Error("缺少 GOOGLE_API_KEY 环境变量。");
    });

    const result = createGeminiStreamEventSource("你好", {});

    expect(result).toEqual({
      kind: "configuration_error",
      statusCode: 500,
      body: {
        message: "缺少 GOOGLE_API_KEY 环境变量。",
        causeKind: "gemini_request_failed",
      },
    });
  });

  it("配置有效时创建协议无关事件流", async () => {
    const config = { apiKey: "key", model: "gemini-3.1-pro-preview", thinkingLevel: "high" as const };
    geminiServiceMocks.readGeminiServerConfig.mockReturnValue(config);
    geminiServiceMocks.streamGeminiEvents.mockReturnValue(createMixedGeminiEvents());

    const result = createGeminiStreamEventSource("你好", { GOOGLE_API_KEY: "key" });

    expect(result.kind).toBe("valid");
    if (result.kind !== "valid") {
      throw new Error("期望创建成功。");
    }

    await expect(collectEvents(result.events)).resolves.toEqual([
      { kind: "thought_keyword", keyword: "search" },
      { kind: "thought_keyword", keyword: "schema" },
      { kind: "thought_keyword", keyword: "cache" },
      { kind: "chunk", text: "第一段" },
      { kind: "thought_keyword", keyword: "answer" },
      { kind: "chunk", text: "第二段" },
      { kind: "done" },
    ]);
    expect(geminiServiceMocks.streamGeminiEvents).toHaveBeenCalledWith("你好", config);
  });
});
