# Prompts

| File | Purpose |
|------|---------|
| [autonomous-fullstack-build.md](./autonomous-fullstack-build.md) | Cloud-agent programme prompt: orchestrator + parallel workstream subagents |

**Product focus:** interactive **company interview prep** and **concept learning**, auto-prioritising weaker topics, with resource hyperlinks and embedded JS diagrams.

## How a cloud agent should start

1. Open `autonomous-fullstack-build.md` and execute **ORCHESTRATOR PROTOCOL** (§O1–O6).
2. Read slash skills listed there (`/shadcn`, `/vercel-cli`, `/vercel-storage`, `/auth`, `/create-subagent`, `/deployments-cicd`, …).
3. Load or create agents in [`.cursor/agents/`](../../.cursor/agents/).
4. Phase 0 freeze (include sibling-agent check), then **one message with many parallel Task calls** for Wave 1.
