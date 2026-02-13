# Metabase Agent API Demo

A sample chat app for the Metabase Agent API. Ask natural language questions about your data and get answers powered by Claude.

## Prerequisites

- Metabase v59+ (Enterprise) with the `agent-api` feature flag
- Anthropic API key

## Metabase setup

**Enable JWT authentication**: Admin Settings > Authentication > JWT. Click "Generate key" and copy the secret.

## Configuration

```sh
cp .env.example .env
```

Fill in your `.env`:

| Variable | Description |
|----------|-------------|
| `METABASE_INSTANCE_URL` | Your Metabase URL (no trailing slash) |
| `METABASE_JWT_SHARED_SECRET` | JWT signing key from admin settings |
| `METABASE_USER_EMAIL` | Email of an existing Metabase user |
| `ANTHROPIC_API_KEY` | Your Anthropic API key |

## Run

```sh
npm run install:all
npm run dev
```

Open [http://localhost:3100](http://localhost:3100).
