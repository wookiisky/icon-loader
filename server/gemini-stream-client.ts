import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import type { GeminiServerConfig } from "./gemini-stream-types";

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

/** 调用 Gemini 流式生成接口，并只向上游暴露文本块。 */
export async function* streamGeminiText(
  prompt: string,
  config: GeminiServerConfig,
): AsyncGenerator<string> {
  const ai = new GoogleGenAI({ apiKey: config.apiKey });
  const response = await ai.models.generateContentStream({
    model: config.model,
    contents: prompt,
    config: {
      thinkingConfig: {
        thinkingLevel: toGeminiSdkThinkingLevel(config.thinkingLevel),
      },
    },
  });

  for await (const chunk of response) {
    const text = chunk.text;
    if (typeof text === "string" && text.length > 0) {
      yield text;
    }
  }
}
