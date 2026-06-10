import { EventEmitter } from "node:events";
import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const geminiRouteMocks = vi.hoisted(() => ({
  readGeminiServerConfig: vi.fn(),
  streamGeminiEvents: vi.fn(),
}));

vi.mock("../../server/gemini-stream-client", () => ({
  readGeminiServerConfig: geminiRouteMocks.readGeminiServerConfig,
  streamGeminiEvents: geminiRouteMocks.streamGeminiEvents,
}));

import { handleGeminiStreamAccessRoute, handleGeminiStreamRoute } from "../../server/gemini-stream-route";

class FakeRequest extends EventEmitter {
  /** Express 请求体。 */
  body: unknown;
  /** Express 原始 URL，包含 query string。 */
  originalUrl: string;

  /** 创建带请求体的测试 Request。 */
  constructor(body: unknown, originalUrl = "/api/gemini/stream?pass=secret") {
    super();
    this.body = body;
    this.originalUrl = originalUrl;
  }
}

class FakeResponse extends EventEmitter {
  /** HTTP 状态码。 */
  statusCode = 200;
  /** 响应 Header。 */
  headers = new Map<string, string>();
  /** 写入的响应片段。 */
  chunks: string[] = [];
  /** JSON 响应体。 */
  jsonBody: unknown;
  /** 是否已经结束响应。 */
  writableEnded = false;

  /** 设置 HTTP 状态码。 */
  status(statusCode: number): this {
    this.statusCode = statusCode;
    return this;
  }

  /** 写入 JSON 响应。 */
  json(body: unknown): this {
    this.jsonBody = body;
    this.end();
    return this;
  }

  /** 设置响应 Header。 */
  setHeader(name: string, value: string): this {
    this.headers.set(name, value);
    return this;
  }

  /** 写入流式响应片段。 */
  write(chunk: string): boolean {
    if (this.writableEnded) {
      throw new Error("响应已经结束。");
    }

    this.chunks.push(chunk);
    this.emit("write", chunk);
    return true;
  }

  /** 结束响应。 */
  end(): this {
    this.writableEnded = true;
    this.emit("finish");
    return this;
  }
}

async function* createDelayedFirstEvent(
  waitForFirstEvent: Promise<void>,
): AsyncGenerator<{ kind: "text_chunk"; text: string }> {
  await waitForFirstEvent;
  yield { kind: "text_chunk", text: "不应输出" };
}

async function* createDelayedSecondEvent(): AsyncGenerator<{ kind: "text_chunk"; text: string }> {
  yield { kind: "text_chunk", text: "第一段" };
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
  yield { kind: "text_chunk", text: "取消后不应输出" };
}

/** 等待一次响应写入。 */
function waitForWrite(response: FakeResponse): Promise<void> {
  return new Promise((resolve) => {
    response.once("write", () => {
      resolve();
    });
  });
}

describe("handleGeminiStreamRoute", () => {
  beforeEach(() => {
    process.env.PASS = "secret";
    geminiRouteMocks.readGeminiServerConfig.mockReset();
    geminiRouteMocks.streamGeminiEvents.mockReset();
    geminiRouteMocks.readGeminiServerConfig.mockReturnValue({
      apiKey: "key",
      model: "gemini-3.1-pro-preview",
      thinkingLevel: "high",
    });
  });

  it("pass 缺失时拒绝进入 Gemini 调用链", () => {
    const request = new FakeRequest("{", "/api/gemini/stream");
    const response = new FakeResponse();
    const next: NextFunction = vi.fn();

    handleGeminiStreamAccessRoute(request as Request, response as unknown as Response, next);

    expect(response.statusCode).toBe(403);
    expect(response.jsonBody).toEqual({
      message: "无权限调用 Gemini。",
      causeKind: "gemini_access_denied",
    });
    expect(next).not.toHaveBeenCalled();
    expect(geminiRouteMocks.readGeminiServerConfig).not.toHaveBeenCalled();
    expect(geminiRouteMocks.streamGeminiEvents).not.toHaveBeenCalled();
  });

  it("PASS 缺失时返回配置错误", () => {
    const request = new FakeRequest({ prompt: "你好" });
    const response = new FakeResponse();
    const next: NextFunction = vi.fn();
    delete process.env.PASS;

    handleGeminiStreamAccessRoute(request as Request, response as unknown as Response, next);

    expect(response.statusCode).toBe(500);
    expect(response.jsonBody).toEqual({
      message: "缺少 PASS 环境变量。",
      causeKind: "gemini_request_failed",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("pass 匹配时继续处理请求", () => {
    const request = new FakeRequest({ prompt: "你好" });
    const response = new FakeResponse();
    const next: NextFunction = vi.fn();

    handleGeminiStreamAccessRoute(request as Request, response as unknown as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(response.writableEnded).toBe(false);
  });

  it("首个事件返回前请求取消时不写入流事件", async () => {
    let releaseFirstEvent: () => void = () => undefined;
    const waitForFirstEvent = new Promise<void>((resolve) => {
      releaseFirstEvent = resolve;
    });
    const request = new FakeRequest({ prompt: "你好" });
    const response = new FakeResponse();
    geminiRouteMocks.streamGeminiEvents.mockReturnValue(createDelayedFirstEvent(waitForFirstEvent));

    const routePromise = handleGeminiStreamRoute(request as Request, response as unknown as Response);
    request.emit("aborted");

    await routePromise;
    releaseFirstEvent();

    expect(response.chunks).toEqual([]);
    expect(response.writableEnded).toBe(true);
  });

  it("响应关闭后停止继续写入流事件", async () => {
    const request = new FakeRequest({ prompt: "你好" });
    const response = new FakeResponse();
    geminiRouteMocks.streamGeminiEvents.mockReturnValue(createDelayedSecondEvent());

    const firstWrite = waitForWrite(response);
    const routePromise = handleGeminiStreamRoute(request as Request, response as unknown as Response);
    await firstWrite;
    response.emit("close");
    await routePromise;

    expect(response.chunks).toEqual(['{"kind":"chunk","text":"第一段"}\n']);
    expect(response.writableEnded).toBe(true);
  });
});
