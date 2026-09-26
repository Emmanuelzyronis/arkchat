# ArkChat

**AI chat mobile app — Expo + Fastify + Azure Foundry**

A cross-platform AI chat application in a Turborepo monorepo. Expo (React Native) frontend, Fastify v5 backend, Supabase auth and database, Azure Foundry for model access.

---

## Demo

> Interactive terminal demo — [view the full case study](https://emmanuelzyronis.vercel.app/work/arkchat)

```text
$ curl -s -X POST http://localhost:3001/api/chat \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"message":"Explain quantum entanglement simply","conversation_id":"conv_8821"}' | jq .

{
  "id": "msg_9f3a2c",
  "role": "assistant",
  "content": "Quantum entanglement: two particles share a state. Measure one — the other resolves instantly, no matter the distance. Einstein called it 'spooky action at a distance'. It can't send information — it's a correlation written into the universe when the particles were created.",
  "model": "claude-sonnet-5",
  "tokens": { "input": 42, "output": 97 },
  "latency_ms": 1284
}
```

---

## Architecture

```
arkchat/
├── apps/
│   ├── mobile/     # Expo (React Native) — iOS + Android
│   └── api/        # Fastify v5 — chat API, auth, streaming
└── packages/
    ├── types/      # Shared TypeScript types
    └── config/     # Shared ESLint, TS config
```

## Stack

| Layer | Technology |
|---|---|
| Mobile | Expo (React Native), TypeScript |
| Backend | Fastify v5, Node.js |
| Auth + DB | Supabase |
| AI models | Azure Foundry (Claude via Azure) |
| Monorepo | Turborepo |

## Setup

```bash
# Install
pnpm install

# Set env vars (see .env.example in each app)
# Apps need: SUPABASE_URL, SUPABASE_ANON_KEY, AZURE_FOUNDRY_KEY

# Run API
cd apps/api && pnpm dev      # http://localhost:3001

# Run mobile
cd apps/mobile && pnpm start  # Expo dev server
```

> Requires a provisioned Supabase project and Azure Foundry resource.
