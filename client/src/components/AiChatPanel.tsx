import { useEffect, useRef, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { AIChatBox, type Message } from "@/components/AIChatBox";
import { sendAdminChatStream } from "@/lib/admin-chat-stream";
import { useAiPageContext } from "@/lib/ai-page-context";
import { toast } from "sonner";

export interface AiChatPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** JSON snapshot of the current page's data; passed through to send-message in later checkpoints */
  pageContext?: unknown;
  /** Identifier for the current admin page (e.g., "/users", "/health/:fingerprint") */
  pageIdentifier?: string;
}

const QUICK_ACTIONS = [
  "Summarize this view",
  "What changed this week?",
  "Top issues today",
];

/**
 * Slide-in AI chat panel for the admin dashboard. Opens from the right at
 * ~380px wide, full viewport height. On desktop it overlays page content
 * without a dim backdrop (uses Sheet's underlying Dialog, with the overlay
 * styled transparent on md+ breakpoints). On mobile widths, the default
 * Sheet backdrop dim kicks in.
 *
 * Checkpoint 4: switched from one-shot tRPC mutation to SSE token streaming
 * via POST /api/admin/chat/stream. Per turn, appends a user message AND an
 * empty assistant placeholder BEFORE the stream starts; tokens then mutate
 * the placeholder's `content` field as they arrive. `Streamdown` inside
 * `AIChatBox` renders progressive markdown — `AIChatBox` itself is
 * unchanged. Page context props are still accepted and forwarded but the
 * server ignores them until checkpoint 5. Errors hard-fail and are surfaced
 * both inside the assistant message (so the operator sees what went wrong
 * in context) and via a sonner toast.
 *
 * In-flight streams are cancelled on (a) the user sending a new turn,
 * (b) the panel being closed, and (c) the component unmounting.
 */
export function AiChatPanel({
  open,
  onOpenChange,
  pageContext,
  pageIdentifier,
}: AiChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Page context from the provider. Props take priority for explicit
  // overrides; otherwise the panel reads whatever the currently-mounted
  // page populated via useSetAiPageContext.
  const ctxProvider = useAiPageContext();
  const effectivePageContext = pageContext ?? ctxProvider.pageContext;
  const effectivePageIdentifier = pageIdentifier ?? ctxProvider.pageIdentifier;

  // Cleanup: cancel any in-flight stream when the panel closes (Sheet keeps
  // the component mounted, so we still want to abort a stream the admin
  // walked away from) or when the component unmounts.
  useEffect(() => {
    if (!open && abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setIsStreaming(false);
    }
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, [open]);

  const handleSend = (content: string) => {
    const trimmed = content.trim();
    if (trimmed.length === 0) return;

    // Cancel any in-flight stream from the previous turn.
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const userTurn: Message = { role: "user", content: trimmed };
    const assistantPlaceholder: Message = { role: "assistant", content: "" };

    // Capture the request payload BEFORE state updates so the empty
    // placeholder isn't included in what we send upstream.
    const messagesForRequest: Message[] = [...messages, userTurn];
    // Index of the placeholder in the next state — used by onEvent
    // callbacks to mutate the right slot as tokens arrive.
    const placeholderIdx = messagesForRequest.length;

    setMessages([...messagesForRequest, assistantPlaceholder]);
    setIsStreaming(true);

    void sendAdminChatStream({
      messages: messagesForRequest,
      pageContext: effectivePageContext,
      pageIdentifier: effectivePageIdentifier,
      signal: ac.signal,
      onEvent: (event) => {
        if (event.type === "token" && typeof event.text === "string") {
          setMessages((prev) => {
            // The placeholder might have been removed if the user reset.
            if (placeholderIdx >= prev.length) return prev;
            const next = prev.slice();
            const current = next[placeholderIdx];
            if (current?.role === "assistant") {
              next[placeholderIdx] = {
                ...current,
                content: current.content + (event.text ?? ""),
              };
            }
            return next;
          });
        } else if (event.type === "tool_call" || event.type === "tool_result") {
          // Structured event — server already emitted the markdown form
          // via a separate `token` event, so the visible thread renders
          // through the existing path. These structured events are
          // tracked for future audit logging (checkpoint 6) — log only.
          // eslint-disable-next-line no-console
          console.debug(
            "[admin-ai]",
            event.type,
            event.name,
            event.input ?? event.summary,
          );
        } else if (event.type === "done") {
          // Terminal — release the streaming state. Content already lives
          // in the placeholder.
          setIsStreaming(false);
          if (abortRef.current === ac) abortRef.current = null;
        } else if (event.type === "error") {
          const msg = event.message ?? "Unknown stream error";
          setMessages((prev) => {
            if (placeholderIdx >= prev.length) return prev;
            const next = prev.slice();
            const current = next[placeholderIdx];
            // If we already started streaming tokens, preserve them and
            // append the error. If the placeholder is still empty, replace
            // with just the error.
            if (current?.role === "assistant") {
              const prefix =
                current.content.length > 0 ? current.content + "\n\n" : "";
              next[placeholderIdx] = {
                ...current,
                content: `${prefix}**Couldn't reach the AI:** ${msg}`,
              };
            }
            return next;
          });
          setIsStreaming(false);
          if (abortRef.current === ac) abortRef.current = null;
          toast.error(msg);
        }
      },
    }).catch(() => {
      // sendAdminChatStream is designed to never throw; this is a
      // defensive catch in case of a programming error. Errors are
      // already surfaced via onEvent.
      setIsStreaming(false);
      if (abortRef.current === ac) abortRef.current = null;
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        // Width: 380px (per spec). Tailwind arbitrary value to be precise.
        // Override the default Sheet overlay backdrop on md+ so the panel
        // overlays without dimming desktop dashboard content; mobile keeps
        // the default dim.
        className="w-[380px] sm:max-w-[380px] p-0 flex flex-col"
      >
        <SheetHeader className="px-4 py-3 border-b">
          <SheetTitle className="text-base">Ask about your data</SheetTitle>
          <SheetDescription className="sr-only">
            AI assistant for the admin dashboard.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 min-h-0 p-2">
          <AIChatBox
            messages={messages}
            onSendMessage={handleSend}
            isLoading={isStreaming}
            placeholder="Ask anything about the data on this page…"
            emptyStateMessage="Ask about your data"
            suggestedPrompts={QUICK_ACTIONS}
            // Fill the panel: AIChatBox accepts string|number; "100%" makes it
            // stretch to the parent flex container.
            height="100%"
            className="border-0 shadow-none rounded-none h-full"
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
