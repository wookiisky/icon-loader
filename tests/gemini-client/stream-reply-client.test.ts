import { describe, expect, it, vi } from "vitest";
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
  it("逐行解析代理返回的 NDJSON 事件", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          createStreamFromText(
            '{"kind":"chunk","text":"你好"}\n{"kind":"chunk","text":"世界"}\n{"kind":"done"}\n',
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
      { kind: "chunk", text: "世界" },
      { kind: "done" },
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
});
