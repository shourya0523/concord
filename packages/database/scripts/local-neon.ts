/**
 * Dev / CI only: point Pool-based scripts at scripts/dev/neon_ws_proxy.mjs
 * instead of Neon's WebSocket endpoint when NEON_WS_PROXY is set.
 */
import { neonConfig } from "@neondatabase/serverless";

export function applyLocalNeonProxy(): void {
  const proxy = process.env.NEON_WS_PROXY?.trim();
  if (!proxy) return;
  neonConfig.wsProxy = (host, port) => `${proxy}/v1?address=${host}:${port}`;
  neonConfig.useSecureWebSocket = false;
  neonConfig.pipelineTLS = false;
  neonConfig.pipelineConnect = false;
  neonConfig.forceDisablePgSSL = true;
}
