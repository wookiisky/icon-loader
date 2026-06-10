import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import type { GeminiModelStreamEvent, GeminiServerConfig } from "./gemini-stream-types.js";

const defaultGeminiModel = "gemini-3.1-pro-preview";
const geminiThinkingLevel: GeminiServerConfig["thinkingLevel"] = "high";

/** 判断模型是否满足当前 high thinking 需求。 */
function supportsHighThinkingLevel(model: string): boolean {
  const match = /^gemini-(\d+)(?:[.-]|$)/.exec(model);
  if (match === null) {
    return false;
  }

  const majorVersion = Number.parseInt(match[1], 10);
  return majorVersion >= 3;
}

/** 将内部稳定契约转换为 Gemini SDK 枚举。 */
function toGeminiSdkThinkingLevel(thinkingLevel: GeminiServerConfig["thinkingLevel"]): ThinkingLevel {
  if (thinkingLevel === "high") {
    return ThinkingLevel.HIGH;
  }

  throw new Error("不支持的 Gemini thinkingLevel。");
}

/** 校验并读取 Gemini 服务端配置，密钥只允许来自服务端环境变量。 */
export function readGeminiServerConfig(env: NodeJS.ProcessEnv): GeminiServerConfig {
  const apiKey = env.GOOGLE_API_KEY;
  if (apiKey === undefined || apiKey.trim().length === 0) {
    throw new Error("缺少 GOOGLE_API_KEY 环境变量。");
  }

  const model = env.GEMINI_MODEL?.trim() || defaultGeminiModel;
  if (!supportsHighThinkingLevel(model)) {
    throw new Error("GEMINI_MODEL 必须使用支持 thinkingLevel high 的 Gemini 3 系列或更新模型。");
  }

  return {
    apiKey,
    model,
    thinkingLevel: geminiThinkingLevel,
  };
}

/** 调用 Gemini 流式生成接口，并向路由暴露文本块和可见 thought 文本。 */
export async function* streamGeminiEvents(
  prompt: string,
  config: GeminiServerConfig,
): AsyncGenerator<GeminiModelStreamEvent> {
  const ai = new GoogleGenAI({ apiKey: config.apiKey });
  const response = await ai.models.generateContentStream({
    model: config.model,
    contents: prompt,
    config: {
      thinkingConfig: {
        thinkingLevel: toGeminiSdkThinkingLevel(config.thinkingLevel),
        includeThoughts: true,
      },
    },
  });

  for await (const chunk of response) {
    const thoughtTexts = extractVisibleThoughtTexts(chunk);
    for (const thoughtText of thoughtTexts) {
      yield { kind: "thought_text", text: thoughtText };
    }

    const text = chunk.text;
    if (typeof text === "string" && text.length > 0) {
      yield { kind: "text_chunk", text };
    }
  }
}

/** 从 Gemini chunk 中读取可见 thought 文本，不读取 opaque thoughtSignature。 */
export function extractVisibleThoughtTexts(chunk: unknown): string[] {
  if (typeof chunk !== "object" || chunk === null || !("candidates" in chunk)) {
    return [];
  }

  const candidates = (chunk as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) {
    return [];
  }

  return candidates.flatMap((candidate) => extractCandidateThoughtTexts(candidate));
}

/** 从单个 candidate 中读取 thought part 文本。 */
function extractCandidateThoughtTexts(candidate: unknown): string[] {
  if (typeof candidate !== "object" || candidate === null || !("content" in candidate)) {
    return [];
  }

  const content = (candidate as { content?: unknown }).content;
  if (typeof content !== "object" || content === null || !("parts" in content)) {
    return [];
  }

  const parts = (content as { parts?: unknown }).parts;
  if (!Array.isArray(parts)) {
    return [];
  }

  return parts
    .filter((part): part is { thought: true; text: string } => {
      if (typeof part !== "object" || part === null) {
        return false;
      }

      const record = part as { thought?: unknown; text?: unknown };
      return record.thought === true && typeof record.text === "string" && record.text.length > 0;
    })
    .map((part) => part.text);
}
