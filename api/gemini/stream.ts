import {
  createGeminiStreamEventSource,
  closeGeminiStreamEvents,
  isGeminiStreamBodyTextTooLarge,
  isGeminiStreamBodyTooLarge,
  parseGeminiStreamRequestBody,
  readFirstGeminiStreamEvent,
  serializeGeminiStreamServerEvent,
  validateGeminiStreamAccess,
} from "../../server/gemini-stream-service.js";
import type { GeminiStreamErrorBody, GeminiStreamFirstEventResult } from "../../server/gemini-stream-service.js";
import type { GeminiStreamServerEvent } from "../../server/gemini-stream-types.js";

/** 响应流取消状态。 */
type GeminiReadableStreamState = {
  /** 消费端或请求端已经取消。 */
  cancelled: boolean;
};

const streamHeaders = {
  "Content-Type": "application/x-ndjson; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  "X-Accel-Buffering": "no",
};

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
};

/** 返回不支持方法的稳定 JSON 错误。 */
export function GET(): Response {
  return createJsonResponse(
    {
      message: "只支持 POST 请求。",
      causeKind: "gemini_request_failed",
    },
    405,
    { Allow: "POST" },
  );
}

/** Vercel Gemini 流式代理入口。 */
export async function POST(request: Request): Promise<Response> {
  const accessResult = validateGeminiStreamAccess(new URL(request.url).searchParams, process.env);
  if (accessResult.kind !== "valid") {
    return createJsonResponse(accessResult.body, accessResult.statusCode);
  }

  if (isGeminiStreamBodyTooLarge(request.headers.get("Content-Length"))) {
    return createJsonResponse(
      {
        message: "请求体不能超过 32KB。",
        causeKind: "gemini_request_failed",
      },
      413,
    );
  }

  const requestBody = await readRequestJsonBody(request);
  if (requestBody.kind === "invalid") {
    return createJsonResponse(requestBody.body, requestBody.statusCode);
  }

  const parseResult = parseGeminiStreamRequestBody(requestBody.body);
  if (parseResult.kind === "invalid") {
    return createJsonResponse(parseResult.body, parseResult.statusCode);
  }

  const eventSource = createGeminiStreamEventSource(parseResult.prompt, process.env);
  if (eventSource.kind === "configuration_error") {
    return createJsonResponse(eventSource.body, eventSource.statusCode);
  }

  const firstEventResult = await readFirstGeminiStreamEvent(eventSource.events, request.signal);
  if (firstEventResult.kind === "upstream_error") {
    return createJsonResponse(firstEventResult.body, firstEventResult.statusCode);
  }
  if (firstEventResult.kind === "aborted") {
    return new Response(null, { status: 499 });
  }

  return new Response(createGeminiReadableStream(eventSource.events, firstEventResult, request.signal), {
    status: 200,
    headers: streamHeaders,
  });
}

/** 读取并解析请求 JSON，失败时统一收敛为请求错误。 */
async function readRequestJsonBody(
  request: Request,
): Promise<
  | { kind: "valid"; body: unknown }
  | { kind: "invalid"; statusCode: 400 | 413; body: GeminiStreamErrorBody }
> {
  let bodyText: string;
  try {
    bodyText = await request.text();
  } catch {
    return {
      kind: "invalid",
      statusCode: 400,
      body: {
        message: "请输入有效问题。",
        causeKind: "gemini_request_failed",
      },
    };
  }

  if (isGeminiStreamBodyTextTooLarge(bodyText)) {
    return {
      kind: "invalid",
      statusCode: 413,
      body: {
        message: "请求体不能超过 32KB。",
        causeKind: "gemini_request_failed",
      },
    };
  }

  try {
    return {
      kind: "valid",
      body: JSON.parse(bodyText) as unknown,
    };
  } catch {
    return {
      kind: "invalid",
      statusCode: 400,
      body: {
        message: "请输入有效问题。",
        causeKind: "gemini_request_failed",
      },
    };
  }
}

/** 创建浏览器可消费的 NDJSON ReadableStream。 */
function createGeminiReadableStream(
  events: AsyncGenerator<GeminiStreamServerEvent>,
  firstEventResult: Extract<GeminiStreamFirstEventResult, { kind: "event" }>,
  abortSignal: AbortSignal,
): ReadableStream<Uint8Array> {
  const state: GeminiReadableStreamState = {
    cancelled: false,
  };

  return new ReadableStream({
    start(controller) {
      void writeGeminiReadableStream(controller, events, firstEventResult.event, abortSignal, state).catch(
        () => undefined,
      );
    },
    cancel() {
      state.cancelled = true;
      closeGeminiStreamEvents(events);
    },
  });
}

/** 写入首个预取事件和剩余事件，流开始后错误以 NDJSON error 表达。 */
async function writeGeminiReadableStream(
  controller: ReadableStreamDefaultController<Uint8Array>,
  events: AsyncGenerator<GeminiStreamServerEvent>,
  firstEvent: GeminiStreamServerEvent,
  abortSignal: AbortSignal,
  state: GeminiReadableStreamState,
): Promise<void> {
  const encoder = new TextEncoder();

  try {
    if (abortSignal.aborted || state.cancelled) {
      state.cancelled = true;
      closeGeminiStreamEvents(events);
      return;
    }

    const handleAbort = (): void => {
      state.cancelled = true;
      closeGeminiStreamEvents(events);
    };
    abortSignal.addEventListener("abort", handleAbort, { once: true });

    controller.enqueue(encoder.encode(serializeGeminiStreamServerEvent(firstEvent)));
    for await (const event of events) {
      if (state.cancelled || abortSignal.aborted) {
        state.cancelled = true;
        closeGeminiStreamEvents(events);
        break;
      }

      controller.enqueue(encoder.encode(serializeGeminiStreamServerEvent(event)));
    }

    abortSignal.removeEventListener("abort", handleAbort);
    if (!state.cancelled) {
      controller.close();
    }
  } catch {
    if (!state.cancelled && !abortSignal.aborted) {
      controller.enqueue(
        encoder.encode(
          serializeGeminiStreamServerEvent({
            kind: "error",
            message: "Gemini 流式回复中断，请稍后重试。",
            causeKind: "gemini_stream_interrupted",
          }),
        ),
      );
      controller.close();
    }
  }
}

/** 创建 JSON 响应并固定中文错误契约。 */
function createJsonResponse(body: GeminiStreamErrorBody, status: number, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...jsonHeaders,
      ...headers,
    },
  });
}
