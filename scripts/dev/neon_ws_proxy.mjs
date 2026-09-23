#!/usr/bin/env node
/**
 * Local stand-in for Neon's WebSocket proxy (dev / CI verification only).
 *
 * `@neondatabase/serverless` Pool/Client tunnel the raw Postgres wire protocol
 * over a WebSocket. This proxy pipes each socket to a local Postgres TCP port
 * so Pool-based scripts (migrate, publish:teaching, embed:rag) run locally:
 *
 *   node scripts/dev/neon_ws_proxy.mjs --port 4445
 *   NEON_WS_PROXY=localhost:4445 DATABASE_URL=postgresql://postgres@localhost:55432/concord_e2e \
 *     npm run publish:teaching -w @ibpe/database
 *
 * The target host:port comes from `?address=host:port` (what the driver sends).
 * Never expose this beyond localhost. It has no auth.
 */
import net from "node:net"
import { WebSocketServer } from "ws"

const portArg = process.argv.indexOf("--port")
const port = portArg > -1 ? Number(process.argv[portArg + 1]) : 4445

const wss = new WebSocketServer({ host: "127.0.0.1", port })
wss.on("connection", (ws, req) => {
  const url = new URL(req.url ?? "/", "http://localhost")
  const [host, targetPort] = (url.searchParams.get("address") ?? "localhost:5432").split(":")
  const socket = net.connect(Number(targetPort ?? 5432), host === "localhost" ? "127.0.0.1" : host)
  socket.on("data", (chunk) => ws.readyState === ws.OPEN && ws.send(chunk))
  socket.on("close", () => ws.close())
  socket.on("error", () => ws.close())
  ws.on("message", (data) => socket.write(data))
  ws.on("close", () => socket.end())
})
console.log(`neon-ws-proxy listening on ws://127.0.0.1:${port}/v1`)
