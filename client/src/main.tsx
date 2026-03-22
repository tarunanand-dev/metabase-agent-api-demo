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
  useExistingUserSession: true,
  instanceUrl,
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
