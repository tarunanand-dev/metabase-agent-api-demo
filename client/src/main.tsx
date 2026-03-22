import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.js";
import "./App.css";

const instanceUrl = import.meta.env.VITE_METABASE_INSTANCE_URL;

if (!instanceUrl) {
  throw new Error(
    "Missing METABASE_INSTANCE_URL (exposed as import.meta.env.VITE_METABASE_INSTANCE_URL).",
  );
}

window.metabaseConfig = {
  instanceUrl,
  preferredAuthMethod: "jwt",
  fetchRequestToken: async () => {
    const response = await fetch("/api/embed-token", { credentials: "include" });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `Embed JWT failed (${response.status}): ${detail || response.statusText}`,
      );
    }
    return response.json() as Promise<{ jwt: string }>;
  },
};

const embedScript = document.createElement("script");
embedScript.src = `${instanceUrl}/app/embed.js`;
embedScript.addEventListener("load", () => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
embedScript.addEventListener("error", () => {
  document.getElementById("root")!.textContent =
    `Failed to load Metabase embed from ${embedScript.src}. Check METABASE_INSTANCE_URL and CORS.`;
});
document.head.appendChild(embedScript);
