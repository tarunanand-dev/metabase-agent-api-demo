import { useState, useRef, useCallback, useEffect } from "react";
import Markdown from "react-markdown";

const TOOL_LABELS: Record<string, string> = {
  search_data_sources: "Searching for data sources",
  get_table_details: "Inspecting table",
  get_metric_details: "Inspecting metric",
  get_field_values: "Fetching field values",
  run_query: "Running query",
};

// Populated from tool results so we can show human-readable names instead of IDs
const entityNames = {
  tables: new Map<number, string>(),
  metrics: new Map<number, string>(),
  fields: new Map<string, string>(),
};

function humanizeId(id: string): string {
  const cached = entityNames.fields.get(id);
  if (cached) return cached;
  // Only humanize IDs that look like words (e.g. CREATED_AT → Created At).
  // Opaque IDs like "C9-25" get an empty string so callers can fall back.
  if (/^[A-Za-z][A-Za-z_]*$/.test(id)) {
    return id
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }
  return "";
}

function toolDetailText(
  toolName: string,
  args: Record<string, unknown>,
): string {
  switch (toolName) {
    case "search_data_sources": {
      const terms = [
        ...((args.term_queries as string[]) ?? []),
        ...((args.semantic_queries as string[]) ?? []),
      ];
      return terms.length ? terms.map((t) => `\u201c${t}\u201d`).join(", ") : "";
    }
    case "get_table_details":
      return entityNames.tables.get(args.table_id as number) ?? "";
    case "get_metric_details":
      return entityNames.metrics.get(args.metric_id as number) ?? "";
    case "get_field_values":
      return args.field_id ? humanizeId(String(args.field_id)) : "";
    case "run_query": {
      const parts: string[] = [];
      if (args.table_id != null) {
        const name = entityNames.tables.get(args.table_id as number);
        if (name) parts.push(name);
      }
      if (args.metric_id != null) {
        const name = entityNames.metrics.get(args.metric_id as number);
        if (name) parts.push(name);
      }
      if (Array.isArray(args.aggregations)) {
        parts.push(
          args.aggregations
            .map((a: Record<string, unknown>) => {
              const fn = a.function as string | undefined;
              if (fn && a.field_id) {
                const name = humanizeId(String(a.field_id));
                return name ? `${fn} of ${name}` : fn;
              }
              return fn ?? "measure";
            })
            .join(", "),
        );
      }
      if (Array.isArray(args.group_by) && args.group_by.length > 0) {
        const descriptions = (args.group_by as Record<string, unknown>[])
          .map((gb) => {
            const name = humanizeId(String(gb.field_id));
            if (name) return gb.field_granularity ? `${name} by ${gb.field_granularity}` : name;
            return gb.field_granularity ? String(gb.field_granularity) : null;
          })
          .filter(Boolean);
        if (descriptions.length > 0) {
          parts.push(`grouped by ${descriptions.join(", ")}`);
        } else {
          const n = (args.group_by as unknown[]).length;
          parts.push(`grouped by ${n} field${n > 1 ? "s" : ""}`);
        }
      }
      if (Array.isArray(args.filters) && args.filters.length > 0) {
        const n = args.filters.length;
        parts.push(`${n} filter${n > 1 ? "s" : ""}`);
      }
      return parts.join(" \u00b7 ");
    }
    default:
      return "";
  }
}

function formatQueryArgs(args: Record<string, unknown>): string {
  const lines: string[] = [];

  if (args.table_id != null) {
    const name = entityNames.tables.get(args.table_id as number);
    if (name) lines.push(`Table: ${name}`);
  }
  if (args.metric_id != null) {
    const name = entityNames.metrics.get(args.metric_id as number);
    if (name) lines.push(`Metric: ${name}`);
  }

  if (Array.isArray(args.aggregations) && args.aggregations.length > 0) {
    lines.push("Aggregations:");
    for (const agg of args.aggregations as Record<string, unknown>[]) {
      const fn = agg.function as string | undefined;
      const label = fn ? fn.charAt(0).toUpperCase() + fn.slice(1) : null;
      const fieldName = agg.field_id ? humanizeId(String(agg.field_id)) : "";
      if (label && fieldName) {
        lines.push(`  ${label} of ${fieldName}`);
      } else if (label) {
        lines.push(`  ${label}`);
      }
      if (agg.sort_order) lines.push(`    sorted ${agg.sort_order}`);
    }
  }

  if (Array.isArray(args.group_by) && args.group_by.length > 0) {
    lines.push("Group by:");
    for (const gb of args.group_by as Record<string, unknown>[]) {
      const name = humanizeId(String(gb.field_id));
      const gran = gb.field_granularity ? ` (${gb.field_granularity})` : "";
      if (name) {
        lines.push(`  ${name}${gran}`);
      } else if (gb.field_granularity) {
        lines.push(`  ${gb.field_granularity}`);
      }
    }
  }

  if (Array.isArray(args.filters) && args.filters.length > 0) {
    lines.push("Filters:");
    for (const f of args.filters as Record<string, unknown>[]) {
      const name = f.field_id ? humanizeId(String(f.field_id)) : "";
      const op = String(f.operation ?? "").replace(/-/g, " ");
      const val = Array.isArray(f.values)
        ? (f.values as unknown[]).join(", ")
        : (f.value ?? "");
      if (name) {
        lines.push(`  ${name} ${op} ${val}`.trimEnd());
      } else {
        lines.push(`  ${op} ${val}`.trimEnd());
      }
    }
  }

  if (Array.isArray(args.order_by) && args.order_by.length > 0) {
    lines.push("Order by:");
    for (const o of args.order_by as Record<string, unknown>[]) {
      const field = o.field as Record<string, unknown> | undefined;
      const name = field?.field_id ? humanizeId(String(field.field_id)) : "";
      if (name) {
        lines.push(`  ${name} ${o.direction}`);
      } else {
        lines.push(`  ${o.direction}`);
      }
    }
  }

  if (args.limit != null) lines.push(`Limit: ${args.limit}`);

  return lines.join("\n");
}

// Matches the data-stream protocol chunks we care about.
interface TextPart {
  type: "text";
  text: string;
}
interface ToolInvocationPart {
  type: "tool-invocation";
  toolCallId: string;
  toolName: string;
  state: "call" | "result";
  detail: string;
  args: Record<string, unknown>;
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
  detail,
  args,
}: {
  toolName: string;
  state: string;
  detail: string;
  args: Record<string, unknown>;
}) {
  const [expanded, setExpanded] = useState(false);
  const label = TOOL_LABELS[toolName] ?? toolName;
  const done = state === "result";
  const canExpand =
    toolName === "run_query" && args && Object.keys(args).length > 0;

  return (
    <div
      className={`tool-card ${done ? "done" : "pending"} ${canExpand ? "expandable" : ""}`}
      onClick={canExpand ? () => setExpanded((v) => !v) : undefined}
    >
      <div className="tool-card-header">
        <div className="tool-card-text">
          <span className="tool-card-label">{label}</span>
          {detail && <span className="tool-card-detail">{detail}</span>}
        </div>
        {canExpand && (
          <span className="tool-card-chevron">
            {expanded ? "\u25be" : "\u25b8"}
          </span>
        )}
      </div>
      {expanded && (
        <div className="tool-card-body">
          <pre>{formatQueryArgs(args)}</pre>
        </div>
      )}
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
      const { toolCallId, toolName, args } = JSON.parse(payload);
      const detail = toolDetailText(toolName, args ?? {});
      return [
        ...parts,
        {
          type: "tool-invocation" as const,
          toolCallId,
          toolName,
          state: "call" as const,
          args: args ?? {},
          detail,
        },
      ];
    }
    // Tool result — match by toolCallId and extract entity names
    case "a": {
      const { toolCallId, result } = JSON.parse(payload);

      const match = parts.find(
        (p): p is ToolInvocationPart =>
          p.type === "tool-invocation" && p.toolCallId === toolCallId,
      );

      if (match && result && !result.error) {
        try {
          if (match.toolName === "search_data_sources") {
            for (const t of result.tables ?? []) {
              if (t.id != null && t.name) entityNames.tables.set(t.id, t.name);
            }
            for (const m of result.metrics ?? []) {
              if (m.id != null && m.name) entityNames.metrics.set(m.id, m.name);
            }
          }
          if (match.toolName === "get_table_details") {
            if (result.id != null && result.name) {
              entityNames.tables.set(result.id, result.name);
            }
            for (const f of result.fields ?? []) {
              const fname = f.name ?? f.display_name;
              if (f.id != null && fname) entityNames.fields.set(String(f.id), fname);
            }
          }
          if (match.toolName === "get_metric_details") {
            if (result.id != null && result.name) {
              entityNames.metrics.set(result.id, result.name);
            }
            for (const d of result.queryable_dimensions ?? result.dimensions ?? []) {
              if (d.id != null && d.name) entityNames.fields.set(String(d.id), d.name);
            }
          }
        } catch {
          // Ignore unexpected result shapes — name cache is best-effort
        }
      }

      return parts.map((p) =>
        p.type === "tool-invocation" && p.toolCallId === toolCallId
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
                      <Markdown key={`${i}-${part.text.length}`}>{part.text}</Markdown>
                    ) : null;
                  case "tool-invocation":
                    return (
                      <ToolCallStatus
                        key={i}
                        toolName={part.toolName}
                        state={part.state}
                        detail={part.detail}
                        args={part.args}
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
