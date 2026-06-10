import { beforeEach, describe, expect, it, vi } from "vitest";

const geminiFunctionMocks = vi.hoisted(() => ({
  readGeminiServerConfig: vi.fn(),
  streamGeminiEvents: vi.fn(),
}));

vi.mock("../../server/gemini-stream-client", () => ({
  readGeminiServerConfig: geminiFunctionMocks.readGeminiServerConfig,
  streamGeminiEvents: geminiFunctionMocks.streamGeminiEvents,
}));

import { GET as getGeminiStream, POST } from "../../api/gemini/stream";
import { GET as getHealth } from "../../api/health";

async function readJson(response: Response): Promise<unknown> {
  return response.json();
}

async function readNdjson(response: Response): Promise<unknown[]> {
  const text = await response.text();
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as unknown);
}

async function* createSuccessfulGeminiEvents(): AsyncGenerator<{ kind: "text_chunk"; text: string }> {
  yield { kind: "text_chunk", text: "第一段" };
  yield { kind: "text_chunk", text: "第二段" };
}

async function* createFailingBeforeFirstEvent(): AsyncGenerator<{ kind: "text_chunk"; text: string }> {
  throw new Error("upstream failed");
}

async function* createFailingAfterFirstEvent(): AsyncGenerator<{ kind: "text_chunk"; text: string }> {
  yield { kind: "text_chunk", text: "第一段" };
  throw new Error("upstream interrupted");
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

function createPostRequest(body: string, headers?: HeadersInit, search = "?pass=secret"): Request {
  return new Request(`https://example.test/api/gemini/stream${search}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body,
  });
}

function createAbortablePostRequest(body: string, abortSignal: AbortSignal): Request {
  return {
    url: "https://example.test/api/gemini/stream?pass=secret",
    headers: new Headers({
      "Content-Type": "application/json",
    }),
    signal: abortSignal,
    text: async () => body,
  } as Request;
}

describe("api/health", () => {
  it("返回健康检查结果", async () => {
    const response = getHealth();

    await expect(readJson(response)).resolves.toEqual({ ok: true });
    expect(response.status).toBe(200);
  });
});

describe("api/gemini/stream", () => {
  beforeEach(() => {
    process.env.PASS = "secret";
    geminiFunctionMocks.readGeminiServerConfig.mockReset();
    geminiFunctionMocks.streamGeminiEvents.mockReset();
    geminiFunctionMocks.readGeminiServerConfig.mockReturnValue({
      apiKey: "key",
      model: "gemini-3.1-pro-preview",
      thinkingLevel: "high",
    });
  });

  it("拒绝非 POST 请求", async () => {
    const response = getGeminiStream();

    await expect(readJson(response)).resolves.toEqual({
      message: "只支持 POST 请求。",
      causeKind: "gemini_request_failed",
    });
    expect(response.status).toBe(405);
  });

  it("拒绝非法 JSON 请求体", async () => {
    const response = await POST(createPostRequest("{"));

    await expect(readJson(response)).resolves.toEqual({
      message: "请输入有效问题。",
      causeKind: "gemini_request_failed",
    });
    expect(response.status).toBe(400);
  });

  it("pass 缺失时优先拒绝且不调用 Gemini", async () => {
    const response = await POST(createPostRequest("{", undefined, ""));

    await expect(readJson(response)).resolves.toEqual({
      message: "无权限调用 Gemini。",
      causeKind: "gemini_access_denied",
    });
    expect(response.status).toBe(403);
    expect(geminiFunctionMocks.readGeminiServerConfig).not.toHaveBeenCalled();
    expect(geminiFunctionMocks.streamGeminiEvents).not.toHaveBeenCalled();
  });

  it("pass 重复时拒绝调用 Gemini", async () => {
    const response = await POST(createPostRequest(JSON.stringify({ prompt: "你好" }), undefined, "?pass=secret&pass=wrong"));

    await expect(readJson(response)).resolves.toEqual({
      message: "无权限调用 Gemini。",
      causeKind: "gemini_access_denied",
    });
    expect(response.status).toBe(403);
    expect(geminiFunctionMocks.readGeminiServerConfig).not.toHaveBeenCalled();
  });

  it("PASS 缺失时返回配置错误", async () => {
    delete process.env.PASS;

    const response = await POST(createPostRequest(JSON.stringify({ prompt: "你好" })));

    await expect(readJson(response)).resolves.toEqual({
      message: "缺少 PASS 环境变量。",
      causeKind: "gemini_request_failed",
    });
    expect(response.status).toBe(500);
    expect(geminiFunctionMocks.readGeminiServerConfig).not.toHaveBeenCalled();
  });

  it("拒绝超过 32KB 的请求体", async () => {
    const response = await POST(createPostRequest("{}", { "Content-Length": "32769" }));

    await expect(readJson(response)).resolves.toEqual({
      message: "请求体不能超过 32KB。",
      causeKind: "gemini_request_failed",
    });
    expect(response.status).toBe(413);
  });

  it("配置缺失时返回 500", async () => {
    geminiFunctionMocks.readGeminiServerConfig.mockImplementation(() => {
      throw new Error("缺少 GOOGLE_API_KEY 环境变量。");
    });

    const response = await POST(createPostRequest(JSON.stringify({ prompt: "你好" })));

    await expect(readJson(response)).resolves.toEqual({
      message: "缺少 GOOGLE_API_KEY 环境变量。",
      causeKind: "gemini_request_failed",
    });
    expect(response.status).toBe(500);
  });

  it("首次上游调用失败时返回 502 JSON", async () => {
    geminiFunctionMocks.streamGeminiEvents.mockReturnValue(createFailingBeforeFirstEvent());

    const response = await POST(createPostRequest(JSON.stringify({ prompt: "你好" })));

    await expect(readJson(response)).resolves.toEqual({
      message: "Gemini 请求失败，请检查密钥、模型或网络后重试。",
      causeKind: "gemini_request_failed",
    });
    expect(response.status).toBe(502);
  });

  it("成功时输出 NDJSON 流", async () => {
    geminiFunctionMocks.streamGeminiEvents.mockReturnValue(createSuccessfulGeminiEvents());

    const response = await POST(createPostRequest(JSON.stringify({ prompt: "你好" })));

    await expect(readNdjson(response)).resolves.toEqual([
      { kind: "chunk", text: "第一段" },
      { kind: "chunk", text: "第二段" },
      { kind: "done" },
    ]);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/x-ndjson; charset=utf-8");
  });

  it("已输出首个事件后上游中断时输出 NDJSON 错误事件", async () => {
    geminiFunctionMocks.streamGeminiEvents.mockReturnValue(createFailingAfterFirstEvent());

    const response = await POST(createPostRequest(JSON.stringify({ prompt: "你好" })));

    await expect(readNdjson(response)).resolves.toEqual([
      { kind: "chunk", text: "第一段" },
      {
        kind: "error",
        message: "Gemini 流式回复中断，请稍后重试。",
        causeKind: "gemini_stream_interrupted",
      },
    ]);
    expect(response.status).toBe(200);
  });

  it("首个事件返回前请求取消时停止创建流", async () => {
    let releaseFirstEvent: () => void = () => undefined;
    const waitForFirstEvent = new Promise<void>((resolve) => {
      releaseFirstEvent = resolve;
    });
    const abortController = new AbortController();
    geminiFunctionMocks.streamGeminiEvents.mockReturnValue(createDelayedFirstEvent(waitForFirstEvent));

    const responsePromise = POST(createAbortablePostRequest(JSON.stringify({ prompt: "你好" }), abortController.signal));
    abortController.abort();

    const response = await responsePromise;
    releaseFirstEvent();

    expect(response.status).toBe(499);
    expect(await response.text()).toBe("");
  });

  it("响应流取消后不再写入额外错误事件", async () => {
    geminiFunctionMocks.streamGeminiEvents.mockReturnValue(createDelayedSecondEvent());

    const response = await POST(createPostRequest(JSON.stringify({ prompt: "你好" })));
    const reader = response.body?.getReader();
    if (reader === undefined) {
      throw new Error("期望存在响应流。");
    }

    const firstRead = await reader.read();
    await reader.cancel();
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(new TextDecoder().decode(firstRead.value)).toBe('{"kind":"chunk","text":"第一段"}\n');
  });
});
