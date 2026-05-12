export interface ChatStreamEvent {
  type: "token" | "done" | "error";
  text?: string;
  message?: string;
  finishReason?: string | null;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface SendAdminChatStreamArgs {
  messages: ChatMessage[];
  pageContext?: unknown;
  pageIdentifier?: string;
  onEvent: (event: ChatStreamEvent) => void;
  signal?: AbortSignal;
}

/**
 * Client-side helper that POSTs to the admin streaming chat endpoint and
 * parses the returned SSE stream chunk-by-chunk, dispatching one onEvent
 * call per parsed SSE event.
 *
 * Uses fetch + ReadableStream rather than EventSource because EventSource
 * is GET-only and we need to POST the messages array. The on-the-wire
 * format is still SSE — only the client API differs.
 *
 * Pass an AbortSignal to cancel mid-stream (e.g., on component unmount or
 * when the user starts a new turn while a previous one is still streaming).
 */
export async function sendAdminChatStream(
  args: SendAdminChatStreamArgs,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch("/api/admin/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: args.messages,
        pageContext: args.pageContext,
        pageIdentifier: args.pageIdentifier,
      }),
      credentials: "include",
      signal: args.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return; // intentional abort, not an error
    }
    args.onEvent({
      type: "error",
      message:
        err instanceof Error
          ? `Network: ${err.message}`
          : "Network request failed",
    });
    return;
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    args.onEvent({
      type: "error",
      message: `Server returned ${response.status}: ${text.slice(0, 500)}`,
    });
    return;
  }
  if (!response.body) {
    args.onEvent({ type: "error", message: "Empty response body" });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";

      for (const ev of events) {
        const dataLine = ev.split("\n").find((l) => l.startsWith("data: "));
        if (!dataLine) continue;
        try {
          const parsed = JSON.parse(dataLine.slice(6)) as ChatStreamEvent;
          args.onEvent(parsed);
        } catch {
          // Ignore unparseable lines (shouldn't happen with our server's
          // event shape but defensive).
        }
      }
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return;
    }
    args.onEvent({
      type: "error",
      message:
        err instanceof Error
          ? `Stream interrupted: ${err.message}`
          : "Stream interrupted",
    });
  }
}
