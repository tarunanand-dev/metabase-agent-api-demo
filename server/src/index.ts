import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import { type CoreMessage, streamText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { systemPrompt } from "./prompt.js";
import { agentTools } from "./tools.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../../.env");
dotenv.config({ path: envPath });

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const PORT = parseInt(process.env.SERVER_PORT || "3001");

// Server-side conversation storage so tool results (which can be large)
// never round-trip through the client.
const conversations = new Map<string, CoreMessage[]>();

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/chat", async (req, res) => {
  const { message, conversationId = "default" } = req.body;

  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "Missing 'message' field" });
    return;
  }

  const history = conversations.get(conversationId) ?? [];
  history.push({ role: "user", content: message });

  const result = streamText({
    model: anthropic("claude-sonnet-4-20250514"),
    system: systemPrompt,
    messages: history,
    tools: agentTools,
    maxSteps: 15,
    onFinish({ response }) {
      history.push(...(response.messages as CoreMessage[]));
      conversations.set(conversationId, history);
    },
  });

  result.pipeDataStreamToResponse(res);
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
