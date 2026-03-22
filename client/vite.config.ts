import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "..", "");
  const metabaseInstanceUrl = (
    env.METABASE_INSTANCE_URL?.trim() || "http://localhost:3000"
  ).replace(/\/$/, "");

  return {
    define: {
      "import.meta.env.VITE_METABASE_INSTANCE_URL": JSON.stringify(
        metabaseInstanceUrl,
      ),
    },
    plugins: [react()],
    server: {
      port: parseInt(env.CLIENT_PORT || "3100"),
      proxy: {
        "/api": `http://localhost:${env.SERVER_PORT || "3001"}`,
      },
    },
  };
});
