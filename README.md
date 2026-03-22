# Appice Agent API Demo

A sample chat app for the Metabase Agent API, branded as **Appice** in the UI. Ask natural language questions about your data and get answers powered by Claude.

## Prerequisites

- Metabase v59+ (Enterprise) with the `agent-api` feature flag — this powers your Appice-branded analytics instance
- Anthropic API key

## Instance setup

**Enable JWT authentication**: Admin Settings > Authentication > JWT. Click "Generate key" and copy the secret.

## Configuration

```sh
cp .env.example .env
```

Fill in your `.env`:

| Variable | Description |
|----------|-------------|
| `METABASE_INSTANCE_URL` | Your instance URL (no trailing slash) |
| `METABASE_JWT_SHARED_SECRET` | JWT signing key from admin settings |
| `METABASE_USER_EMAIL` | Email of an existing user on the instance |
| `ANTHROPIC_API_KEY` | Your Anthropic API key |

## Run

```sh
npm run install:all
npm run dev
```

Open [http://localhost:3100](http://localhost:3100).

## Production build

`METABASE_INSTANCE_URL` from the repo-root `.env` is mapped at build time to `import.meta.env.VITE_METABASE_INSTANCE_URL` (see `client/vite.config.ts` `define`). `main.tsx` uses that value for `window.metabaseConfig` and to load `embed.js`. Set the variable in the environment or `.env` **before** `vite build` / `npm run dev` so the client points at your real Metabase host.

On the **Metabase** side, typical requirements are:

- **CORS** — Allow your deployed app origin (or use a reverse proxy so the app and Metabase share an origin).
- **HTTPS** — If the app is served over HTTPS, the Metabase URL should be HTTPS too so the browser does not block mixed content when loading `embed.js`.
- **Embedding / interactive embedding** — Enable whatever your Metabase edition needs for the embedded browser and session behavior you use (`useExistingUserSession`, JWT SSO, etc.).

The Node server still reads `METABASE_INSTANCE_URL` at **runtime** for API calls; keep that value aligned with what you used at build time unless you rebuild after changing hosts.

## Branding

- **This app**: Replace assets in `client/public/` — `appice-logo-square.png` (left pane header) and `appice-icon.png` (chat header + favicon).
- **Embedded browser** (`<metabase-browser>`): Still served by Metabase; its chrome (navbar, login, etc.) shows **Metabase** branding unless you [customize the Metabase deployment](https://www.metabase.com/docs/latest/configuring-metabase/customizing-jetty-webserver) (logo files, `application-name`, or a fork). White-labeling is done on the Metabase server, not only in this demo.

## Reporting issues

For bugs and feature requests, please [open an issue](https://github.com/metabase/metabase-agent-api-demo/issues). For security issues, please see our [Security Policy](https://github.com/metabase/metabase/security/policy).

## License

This project is licensed under the [MIT License](./LICENSE).
