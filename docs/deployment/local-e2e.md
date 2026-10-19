# Local end-to-end verification (no Neon)

The web app and the Pool-based DB scripts can run against a local Postgres 16 +
pgvector through two small dev-only shims. Nothing here touches Neon.

| Piece | What it stands in for | Enabled by |
|-------|-----------------------|------------|
| `scripts/dev/neon_http_shim.py` (needs `psycopg[binary]`) | Neon HTTP `/sql` used by `neon()` in `packages/database/src/client.ts` | `NEON_FETCH_ENDPOINT=http://127.0.0.1:4444/sql` (ignored when `VERCEL_ENV=production`) |
| `scripts/dev/neon_ws_proxy.mjs` | Neon WebSocket proxy used by `Pool` in `packages/database/scripts/*` | `NEON_WS_PROXY=localhost:4445` |

```bash
# Postgres 16 + pgvector listening on localhost:55432 (trust auth for local only)
createdb -h localhost -p 55432 -U postgres concord_e2e
for f in migrations/0{10,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46}_*.sql; do
  psql -h localhost -p 55432 -U postgres -d concord_e2e -v ON_ERROR_STOP=1 -f "$f"
done
# (020 predates 034's occurrence topic column. Apply 037 instead of 020 on a fresh DB.)

python3 scripts/dev/neon_http_shim.py --port 4444 &
node scripts/dev/neon_ws_proxy.mjs --port 4445 &

NEON_WS_PROXY=localhost:4445 DATABASE_URL=postgresql://postgres@localhost:55432/concord_e2e \
  npm run publish:teaching -w @ibpe/database

# Run the app as the RLS-bound role (042) so policies are exercised:
NEON_FETCH_ENDPOINT=http://127.0.0.1:4444/sql \
DATABASE_URL=postgresql://concord_app@localhost:55432/concord_e2e \
  npm run dev --workspace=@ibpe/web
```
