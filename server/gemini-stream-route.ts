import type { Request, Response } from "express";
import { z } from "zod";
import { readGeminiServerConfig, streamGeminiText } from "./gemini-stream-client";
import type { GeminiStreamServerEvent } from "./gemini-stream-types";

const geminiRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(8000),
});

/** 写入一个 NDJSON 流事件，浏览器按行解析。 */
function writeStreamEvent(response: Response, event: GeminiStreamServerEvent): void {
  response.write(`${JSON.stringify(event)}\n`);
}

/** Gemini 流式代理路由，负责边界校验、密钥隔离和错误收敛。 */
export async function handleGeminiStreamRoute(request: Request, response: Response): Promise<void> {
  const parseResult = geminiRequestSchema.safeParse(request.body);
  if (!parseResult.success) {
    response.status(400).json({
      message: "请输入有效问题。",
      causeKind: "gemini_request_failed",
    });
    return;
  }

  let config;
  try {
    config = readGeminiServerConfig(process.env);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gemini 服务端配置无效。";
    response.status(500).json({
      message,
      causeKind: "gemini_request_failed",
    });
    return;
  }

  response.status(200);
  response.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("X-Accel-Buffering", "no");

  let hasWrittenChunk = false;
  try {
    for await (const text of streamGeminiText(parseResult.data.prompt, config)) {
      hasWrittenChunk = true;
      writeStreamEvent(response, { kind: "chunk", text });
    }

    writeStreamEvent(response, { kind: "done" });
    response.end();
  } catch {
    if (!hasWrittenChunk && !response.headersSent) {
      response.status(502).json({
        message: "Gemini 请求失败，请检查密钥、模型或网络后重试。",
        causeKind: "gemini_request_failed",
      });
      return;
    }

    writeStreamEvent(response, {
      kind: "error",
      message: "Gemini 流式回复中断，请稍后重试。",
      causeKind: "gemini_stream_interrupted",
    });
    response.end();
  }
}
