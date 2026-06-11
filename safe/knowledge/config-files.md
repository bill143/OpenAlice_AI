# Config Files & Filesystem State

Everything OpenAlice persists is in JSON files under `data/`. Attacking
involves understanding what's in them and what can be read/written/leaked.

## Critical paths (when auth lands)

| Path | Contents | Sensitivity |
|---|---|---|
| `data/config/auth.json` | argon2 hash of admin token + metadata | **Critical** — token recovery / replay |
| `data/config/sessions.json` | active session list | **High** — session hijacking surface |
| `data/control/restart-uta.flag` | timestamp triggering UTA restart | **Medium** — DoS UTA via repeated touch |

These don't all exist yet. `auth.json` and `sessions.json` ship with the
auth implementation. `restart-uta.flag` already exists.

## Already-present paths (pre-auth)

| Path | Contents | Sensitivity |
|---|---|---|
| `data/config/accounts.json` | broker UTA configs — **including API keys & secrets** | **Critical** — direct broker theft |
| `data/config/ai-provider-manager.json` | AI provider keys (Claude/OpenAI/Anthropic) | **High** — credential theft |
| `data/config/connectors.json` | Telegram bot token + allowed chat IDs | **High** — bot impersonation |
| `data/config/cron/jobs.json` | scheduled task definitions | **Medium** — silent code execution paths |
| `data/config/snapshot.json` | snapshot scheduler config | Low |
| `data/config/heartbeat.json` | heartbeat config | Low |
| `data/trading/<utaId>/commit.json` | trading history with operation details | **High** — exposes trade strategy |
| `data/trading/<utaId>/snapshots/*.json` | equity over time | **Medium** — competitive intel |
| `data/workspaces/workspaces.json` | workspace registry (paths + metadata) | Low |
| `data/workspaces/<wsId>/` | per-workspace files including any code/notes/credentials the operator put there | **Variable** — depends on user content |

## File permissions

There's no explicit chmod in any OpenAlice code today. Files are written
with whatever umask the process has — usually `644` (world-readable). For
a self-host user on a multi-user host, **anyone with shell access to the
host can read accounts.json plaintext** today.

After auth lands, `auth.json` and `sessions.json` should be created with
`600` (owner-only). This is an open finding.

## Sample `accounts.json` (sanitized)

```json
[
  {
    "id": "alpaca-paper",
    "presetId": "alpaca",
    "enabled": true,
    "guards": [],
    "presetConfig": {
      "mode": "paper",
      "apiKey": "PKxxxxxxxxxxxxxxxxxxx",
      "apiSecret": "yyyyyyyyyyyyyyyyyyy"
    }
  },
  {
    "id": "mock-paper",
    "presetId": "simulator",
    "enabled": true,
    "guards": [],
    "presetConfig": {}
  }
]
```

`apiKey` and `apiSecret` are **plaintext**. There's no encryption-at-rest.
The threat model accepts this (host root = game over anyway), but it does
mean any read-primitive on this file = full broker compromise.

## Sample `ai-provider-manager.json` (sanitized)

```json
{
  "activeProfile": "claude-sonnet",
  "profiles": {
    "claude-sonnet": {
      "provider": "agent-sdk",
      "model": "claude-sonnet-4-5",
      "apiKey": "sk-ant-api03-..."
    },
    "openai-gpt5": {
      "provider": "vercel-ai-sdk",
      "subProvider": "openai",
      "apiKey": "sk-proj-..."
    }
  }
}
```

Same situation — plaintext API keys.

## Path resolution (attacker-relevant)

The base data directory is resolved by `src/core/paths.ts`:

- In dev: `process.cwd()/data/` (i.e., the repo root)
- In Docker: `OPENALICE_USER_DATA_HOME` env (default `/data`, the mounted volume)
- In Electron (future): `app.getPath('userData')/data/`

An attacker who can convince OpenAlice to read or write a path **outside**
its data root would have a serious primitive. The relevant functions to
audit:

- `src/core/paths.ts` — `dataPath()`, `defaultPath()`, `uiBundlePath()`
- `src/webui/routes/media.ts` — handles attachment IDs (path injection risk?)
- `src/webui/routes/inbox.ts` — workspace doc rendering (path injection?)
- `src/workspaces/service.ts` — workspace dir creation (where does wsId
  come from, is it sanitized?)

## State you can poke (non-destructively)

For static reconnaissance without changing anything:

```bash
# What UTAs are configured?
cat data/config/accounts.json | jq '[.[] | {id, presetId, enabled, mode: .presetConfig.mode}]'

# What broker preset types exist?
curl -s http://localhost:47331/api/trading/config/broker-presets | jq '.presets[].id'

# How many sessions exist? (post-auth)
cat data/config/sessions.json | jq '.sessions | length'

# What workspaces are out there?
cat data/workspaces/workspaces.json | jq
```

## State you can poke (destructively — restore after)

If you need to mutate to test something:

```bash
# Snapshot before mutating
cp -r data/config /tmp/alice-config-snapshot

# Do your testing
# ...

# Restore
rm -rf data/config && mv /tmp/alice-config-snapshot data/config
```

Or use `git stash` / `git checkout data/` if files were committed (they
usually aren't — `data/` is `.gitignore`d).

## Out-of-tree paths

The `OPENALICE_USER_DATA_HOME` env var (defaulting to `/data` in Docker,
cwd in dev) controls the root. An attacker who can influence env vars
(e.g., via container escape or shell-level compromise) can redirect Alice
to read/write a different `data/` tree.

Mitigation: env vars are set by Guardian / Docker entrypoint; not
user-influenced at runtime through any HTTP endpoint. But check the
`src/main.ts` and `services/uta/src/main.ts` for any place a route handler
sets process.env (currently: none, but audit if any get added).
