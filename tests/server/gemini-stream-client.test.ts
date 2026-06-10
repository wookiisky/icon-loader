import { beforeEach, describe, expect, it, vi } from "vitest";

const geminiMocks = vi.hoisted(() => ({
  generateContentStream: vi.fn(),
  GoogleGenAI: vi.fn(),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: geminiMocks.GoogleGenAI,
  ThinkingLevel: {
    HIGH: "HIGH",
  },
}));

import {
  extractVisibleThoughtTexts,
  readGeminiServerConfig,
  streamGeminiEvents,
} from "../../server/gemini-stream-client";

async function* createFakeGeminiStream(): AsyncGenerator<{ text?: string; candidates?: unknown[] }> {
  yield {
    candidates: [
      {
        content: {
          parts: [
            { thought: true, text: "Search database schema. " },
            { thought: true, text: "Build query plan. ", thoughtSignature: "opaque" },
            { text: "不应进入 thought" },
          ],
        },
      },
    ],
  };
  yield { text: "第一段", candidates: [] };
  yield { text: "" };
  yield {};
  yield { text: "第二段" };
}

describe("readGeminiServerConfig", () => {
  beforeEach(() => {
    geminiMocks.generateContentStream.mockReset();
    geminiMocks.GoogleGenAI.mockReset();
    geminiMocks.GoogleGenAI.mockImplementation(() => ({
      models: {
        generateContentStream: geminiMocks.generateContentStream,
      },
    }));
  });

  it("从 GOOGLE_API_KEY 读取密钥", () => {
    const config = readGeminiServerConfig({
      GOOGLE_API_KEY: "key",
      GEMINI_MODEL: "gemini-3-pro-preview",
    });

    expect(config).toEqual({
      apiKey: "key",
      model: "gemini-3-pro-preview",
      thinkingLevel: "high",
    });
  });

  it("默认使用 Gemini 3.1 Pro Preview 并开启 high thinking", () => {
    const config = readGeminiServerConfig({
      GOOGLE_API_KEY: "key",
    });

    expect(config).toEqual({
      apiKey: "key",
      model: "gemini-3.1-pro-preview",
      thinkingLevel: "high",
    });
  });

  it("缺少 GOOGLE_API_KEY 时抛出明确错误", () => {
    expect(() => readGeminiServerConfig({})).toThrow("GOOGLE_API_KEY");
  });

  it("拒绝不支持 thinkingLevel high 的旧模型", () => {
    expect(() =>
      readGeminiServerConfig({
        GOOGLE_API_KEY: "key",
        GEMINI_MODEL: "gemini-2.0-flash",
      }),
    ).toThrow("Gemini 3");
  });
});

describe("streamGeminiEvents", () => {
  beforeEach(() => {
    geminiMocks.generateContentStream.mockReset();
    geminiMocks.GoogleGenAI.mockReset();
    geminiMocks.GoogleGenAI.mockImplementation(() => ({
      models: {
        generateContentStream: geminiMocks.generateContentStream,
      },
    }));
  });

  it("以流式方式请求 Gemini 并显式开启 high thinking", async () => {
    geminiMocks.generateContentStream.mockResolvedValue(createFakeGeminiStream());

    const events = [];
    for await (const event of streamGeminiEvents("你好", {
      apiKey: "key",
      model: "gemini-3.1-pro-preview",
      thinkingLevel: "high",
    })) {
      events.push(event);
    }

    expect(geminiMocks.GoogleGenAI).toHaveBeenCalledWith({ apiKey: "key" });
    expect(geminiMocks.generateContentStream).toHaveBeenCalledWith({
      model: "gemini-3.1-pro-preview",
      contents: "你好",
      config: {
        thinkingConfig: {
          thinkingLevel: "HIGH",
          includeThoughts: true,
        },
      },
    });
    expect(events).toEqual([
      { kind: "thought_text", text: "Search database schema. " },
      { kind: "thought_text", text: "Build query plan. " },
      { kind: "text_chunk", text: "第一段" },
      { kind: "text_chunk", text: "第二段" },
    ]);
  });

  it("只提取可见 thought 文本，不读取 thoughtSignature", () => {
    const thoughtTexts = extractVisibleThoughtTexts({
      candidates: [
        {
          content: {
            parts: [
              { thought: true, text: "visible thought", thoughtSignature: "opaque" },
              { thought: true, thoughtSignature: "opaque-only" },
              { text: "answer" },
            ],
          },
        },
      ],
    });

    expect(thoughtTexts).toEqual(["visible thought"]);
  });
});
