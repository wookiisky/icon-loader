import { beforeEach, describe, expect, it, vi } from "vitest";
import { streamReplyFromProxy } from "../../src/gemini-client/stream-reply-client";

function createStreamFromText(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

describe("streamReplyFromProxy", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    window.history.pushState({}, "", "/");
  });

  it("逐行解析代理返回的 NDJSON 事件", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          createStreamFromText(
            '{"kind":"chunk","text":"你好"}\n{"kind":"thought_keyword","keyword":"database"}\n{"kind":"chunk","text":"世界"}\n{"kind":"done"}\n',
          ),
          { status: 200 },
        );
      }),
    );

    const events = [];
    for await (const event of streamReplyFromProxy("你好")) {
      events.push(event);
    }

    expect(events).toEqual([
      { kind: "chunk", text: "你好" },
      { kind: "thought_keyword", keyword: "database" },
      { kind: "chunk", text: "世界" },
      { kind: "done" },
    ]);
  });

  it("页面 URL 包含 pass 时，请求代理也携带 pass", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(createStreamFromText('{"kind":"done"}\n'), { status: 200 });
    });
    window.history.pushState({}, "", "/?pass=s%20ecret");
    vi.stubGlobal("fetch", fetchMock);

    const events = [];
    for await (const event of streamReplyFromProxy("你好")) {
      events.push(event);
    }

    expect(events).toEqual([{ kind: "done" }]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/gemini/stream?pass=s+ecret",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("页面 URL 包含重复 pass 时，请求代理保留重复参数", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(createStreamFromText('{"kind":"done"}\n'), { status: 200 });
    });
    window.history.pushState({}, "", "/?pass=secret&pass=wrong");
    vi.stubGlobal("fetch", fetchMock);

    for await (const _event of streamReplyFromProxy("你好")) {
      // 消费完整响应，确保 fetch 已执行。
    }

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/gemini/stream?pass=secret&pass=wrong",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("非法 thought keyword 事件会触发流中断错误", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(createStreamFromText('{"kind":"thought_keyword","keyword":""}\n'), { status: 200 });
      }),
    );

    const events = [];
    for await (const event of streamReplyFromProxy("你好")) {
      events.push(event);
    }

    expect(events).toEqual([
      {
        kind: "error",
        message: "Gemini 流式回复中断，请稍后重试。",
        causeKind: "gemini_stream_interrupted",
      },
    ]);
  });

  it("HTTP 失败时返回请求错误事件", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response("failed", { status: 500 });
      }),
    );

    const events = [];
    for await (const event of streamReplyFromProxy("你好")) {
      events.push(event);
    }

    expect(events).toEqual([
      {
        kind: "error",
        message: "Gemini 请求失败，请稍后重试。",
        causeKind: "gemini_request_failed",
      },
    ]);
  });

  it("HTTP 失败且返回稳定 JSON 错误时透传错误消息", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            message: "无权限调用 Gemini。",
            causeKind: "gemini_access_denied",
          }),
          {
            status: 403,
            headers: {
              "Content-Type": "application/json; charset=utf-8",
            },
          },
        );
      }),
    );

    const events = [];
    for await (const event of streamReplyFromProxy("你好")) {
      events.push(event);
    }

    expect(events).toEqual([
      {
        kind: "error",
        message: "无权限调用 Gemini。",
        causeKind: "gemini_access_denied",
      },
    ]);
  });
});
