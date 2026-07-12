# SreevaAI — Command Reference

## 1. Local Dev

| Command | Use case |
|---|---|
| `npm run dev` | Start website at localhost:3000 |
| `npm run dev:worker` / `npm run worker` | Run all background job queues |
| `npm run agent:dev` (= `python agent.py dev`) | Run Python AI agent locally, hot reload |
| `npm run agent` (= `python agent.py start`) | Run Python AI agent locally, production mode (no hot reload) |
| `npx tsx --env-file=.env scripts/create-super-admin.ts <email> <password> [name]` | Create/reset a super admin login |

## 2. Docker / AWS

| Command | Use case |
|---|---|
| `docker compose -f aws-deployment/docker-compose.prod.yml up -d --build` | Build + start/redeploy the whole stack |
| `docker compose -f aws-deployment/docker-compose.prod.yml down` | Stop all containers |
| `docker compose -f aws-deployment/docker-compose.prod.yml logs -f` | Tail live logs |
| `docker ps` | Check running containers (expect: Frontend, Normal-worker, redis, traefik) |
| `docker exec Frontend npx prisma db push --accept-data-loss` | Force-sync DB schema after a Prisma change (required, or site 500s) |
| `docker system prune -af` | Clear unused images/cache to free disk space |

**Deploy to AWS:** `git push` to `main` → auto-deploys via GitHub Actions. Manual fallback: `ssh ubuntu@<AWS_IP>` → `cd SreevaAI` → `git pull origin main` → run the `up -d --build` command above.

## 3. LiveKit (AI Agent)

| Command | Use case |
|---|---|
| `lk agent deploy` | Manually deploy agent code (run from `livekit-python-agent/`) |
| `lk agent logs` | Stream live agent logs |
| `lk agent update-secrets --secrets-file .envprod` | Push updated API keys to the live agent (restarts it) |
| `lk agent create` | First-time setup only — creates a new LiveKit agent project + `livekit.toml` (choose "Python") |
| `lk agent delete` | Delete the LiveKit agent project (destructive — only if rebuilding from scratch) |

**Deploy:** `git push` → auto-deploys via GitHub Actions.

## 4. Modal (extraction / brief / report)

| Command | Use case |
|---|---|
| `modal deploy modal_app/extract_and_score.py` | Deploy resume/JD extraction + scoring |
| `modal deploy modal_app/generate_brief.py` | Deploy brief generation |
| `modal deploy modal_app/generate_report.py` | Deploy report generation |
| `modal app logs sreevaai-extract-and-score` | Stream logs for extraction/scoring |
| `modal app logs sreevaai-generate-brief` | Stream logs for brief generation |
| `modal app logs sreevaai-generate-report` | Stream logs for report generation |

Deploy only the file you changed — each is independent. App names come from `modal.App(...)` in each file.

## 5. Database

| Command | Use case |
|---|---|
| `npx prisma migrate dev --name your_change` | Local: create + apply a migration |
| `npx prisma migrate deploy` | Production: apply pending migrations safely |
| `npx prisma db push --accept-data-loss` | Force schema to match `schema.prisma` directly, skipping migration history — dev/early-stage DBs only |
| `npx prisma generate` | Regenerate Prisma client after any schema change |

## Cheat sheet

- Frontend/UI change → `git push`
- Agent/prompt change → `git push`
- Schema change → migrate + `git push` + `docker exec Frontend npx prisma db push --accept-data-loss` if urgent
- New API key → update `.envprod` → `lk agent update-secrets --secrets-file .envprod`
- Site down → `ssh`, `docker ps`, `docker compose ... logs -f`
- Agent down → `lk agent logs`
