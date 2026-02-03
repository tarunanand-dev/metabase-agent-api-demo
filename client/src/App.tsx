import { useState, useRef, useCallback, useEffect } from "react";
import Markdown from "react-markdown";

const TOOL_LABELS: Record<string, string> = {
  search_data_sources: "Searching for data sources",
  get_table_details: "Inspecting table",
  get_metric_details: "Inspecting metric",
  get_field_values: "Fetching field values",
  construct_query: "Building query",
  execute_query: "Running query",
};

// Matches the data-stream protocol chunks we care about.
interface TextPart {
  type: "text";
  text: string;
}
interface ToolInvocationPart {
  type: "tool-invocation";
  toolName: string;
  state: "call" | "result";
}
type Part = TextPart | ToolInvocationPart;

interface Message {
  id: string;
  role: "user" | "assistant";
  parts: Part[];
}

function ToolCallStatus({
  toolName,
  state,
}: {
  toolName: string;
  state: string;
}) {
  const label = TOOL_LABELS[toolName] ?? toolName;
  const done = state === "result";
  return (
    <div className={`tool-status ${done ? "done" : "pending"}`}>
      <span className="tool-icon">{done ? "\u2713" : "\u2026"}</span>
      <span>{label}</span>
    </div>
  );
}

/**
 * Parse the Vercel AI SDK data-stream format. Each line is prefixed with a
 * type code and a colon, e.g.:
 *   0:"hello "          — text delta
 *   9:{...}             — tool call begin
 *   a:{...}             — tool result
 *   e:{...}             — error
 *   d:{...}             — finish
 */
function parseStreamChunk(
  line: string,
  parts: Part[],
): Part[] {
  if (!line || !line.includes(":")) return parts;

  const code = line[0];
  const payload = line.slice(2);

  switch (code) {
    // Text delta
    case "0": {
      const text = JSON.parse(payload) as string;
      const last = parts[parts.length - 1];
      if (last?.type === "text") {
        return [...parts.slice(0, -1), { type: "text", text: last.text + text }];
      }
      return [...parts, { type: "text", text }];
    }
    // Tool call begin
    case "9": {
      const { toolName } = JSON.parse(payload);
      return [...parts, { type: "tool-invocation", toolName, state: "call" }];
    }
    // Tool result
    case "a": {
      const { toolName } = JSON.parse(payload);
      // Mark the matching pending call as done
      return parts.map((p) =>
        p.type === "tool-invocation" && p.toolName === toolName && p.state === "call"
          ? { ...p, state: "result" as const }
          : p,
      );
    }
    default:
      return parts;
  }
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const conversationId = useRef("conv-" + crypto.randomUUID());
  const msgCounter = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const text = input.trim();
      if (!text || isLoading) return;

      setInput("");
      setError(null);

      const userMsg: Message = {
        id: String(++msgCounter.current),
        role: "user",
        parts: [{ type: "text", text }],
      };
      const assistantId = String(++msgCounter.current);

      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);

      try {
        const controller = new AbortController();
        abortRef.current = controller;

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            conversationId: conversationId.current,
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const errText = await res.text();
          throw new Error(errText || `HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let parts: Part[] = [];
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          // Keep the last (possibly incomplete) line in the buffer
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            parts = parseStreamChunk(trimmed, parts);
            setMessages((prev) => {
              const withoutCurrent = prev.filter((m) => m.id !== assistantId);
              return [
                ...withoutCurrent,
                { id: assistantId, role: "assistant", parts: [...parts] },
              ];
            });
          }
        }

        // Process any remaining buffer
        if (buffer.trim()) {
          parts = parseStreamChunk(buffer.trim(), parts);
          setMessages((prev) => {
            const withoutCurrent = prev.filter((m) => m.id !== assistantId);
            return [
              ...withoutCurrent,
              { id: assistantId, role: "assistant", parts: [...parts] },
            ];
          });
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // User cancelled — leave partial response visible
        } else {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        abortRef.current = null;
        setIsLoading(false);
      }
    },
    [input, isLoading],
  );

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Metabase Agent</h1>
        <p>Ask questions about your data</p>
      </header>

      <div className="messages">
        {messages.map((message) => (
          <div key={message.id} className={`message ${message.role}`}>
            <div className="message-label">
              {message.role === "user" ? "You" : "Agent"}
            </div>
            <div className="message-body">
              {message.parts.map((part, i) => {
                switch (part.type) {
                  case "text":
                    return part.text.length > 0 ? (
                      <Markdown key={i}>{part.text}</Markdown>
                    ) : null;
                  case "tool-invocation":
                    return (
                      <ToolCallStatus
                        key={i}
                        toolName={part.toolName}
                        state={part.state}
                      />
                    );
                  default:
                    return null;
                }
              })}
            </div>
          </div>
        ))}

        {isLoading && messages.at(-1)?.role === "user" && (
          <div className="message assistant">
            <div className="message-label">Agent</div>
            <div className="message-body thinking">Thinking&hellip;</div>
          </div>
        )}

        {error && (
          <div className="message error">
            <div className="message-label">Error</div>
            <div className="message-body">{error}</div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form className="input-area" onSubmit={handleSubmit}>
        <div className={`input-container ${isLoading ? "loading" : ""}`}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your data&#x2026;"
            disabled={isLoading}
          />
          {isLoading ? (
            <button
              type="button"
              className="cancel-btn"
              onClick={handleCancel}
              aria-label="Cancel"
            >
              &#9632;
            </button>
          ) : (
            <button
              type="submit"
              className="send-btn"
              disabled={!input.trim()}
              aria-label="Send"
            >
              &#8593;
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
