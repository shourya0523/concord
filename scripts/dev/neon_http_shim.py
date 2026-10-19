#!/usr/bin/env python3
"""Local stand-in for Neon's HTTP SQL endpoint (dev / CI verification only).

The web app talks to Postgres through `@neondatabase/serverless` `neon()`
(HTTP). This shim speaks the same wire format against any local Postgres so
the product APIs can be exercised end-to-end without a Neon project:

    python3 scripts/dev/neon_http_shim.py --port 4444
    NEON_FETCH_ENDPOINT=http://localhost:4444/sql \
    DATABASE_URL=postgresql://concord_app@localhost:55432/concord_e2e \
    npm run dev --workspace=@ibpe/web

Request:  POST {query, params} or {queries: [{query, params}, ...]}
          (a batch runs in one transaction, like Neon's HTTP transactions)
Response: {command, rowCount, fields: [{name, dataTypeID}], rows: [[text…]]}
          or {results: [...]} for batches; HTTP 400 {message, code, …} on SQL error.

Never point this at production data. It has no auth.
"""
from __future__ import annotations

import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import psycopg
from psycopg import sql as _sql  # noqa: F401  (keeps psycopg.sql importable for callers)

ISOLATION = {
    "Serializable": psycopg.IsolationLevel.SERIALIZABLE,
    "RepeatableRead": psycopg.IsolationLevel.REPEATABLE_READ,
    "ReadCommitted": psycopg.IsolationLevel.READ_COMMITTED,
    "ReadUncommitted": psycopg.IsolationLevel.READ_UNCOMMITTED,
}


def _run(cur: psycopg.RawCursor, query: str, params: list) -> dict:
    cur.execute(query, params or None, prepare=False)
    res = cur.pgresult
    fields = []
    rows = []
    command = (cur.statusmessage or "").split(" ")[0]
    if res is not None and res.nfields:
        fields = [
            {"name": res.fname(i).decode(), "dataTypeID": res.ftype(i)}
            for i in range(res.nfields)
        ]
        for r in range(res.ntuples):
            row = []
            for c in range(res.nfields):
                value = res.get_value(r, c)
                row.append(None if value is None else bytes(value).decode())
            rows.append(row)
    return {
        "command": command,
        "rowCount": cur.rowcount if cur.rowcount is not None and cur.rowcount >= 0 else len(rows),
        "fields": fields,
        "rows": rows,
        "rowAsArray": True,
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "neon-http-shim/1"

    def log_message(self, fmt, *args):  # quieter default logging
        if self.server.verbose:  # type: ignore[attr-defined]
            super().log_message(fmt, *args)

    def _send(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):  # noqa: N802
        dsn = self.headers.get("Neon-Connection-String") or self.server.dsn  # type: ignore[attr-defined]
        length = int(self.headers.get("Content-Length") or 0)
        payload = json.loads(self.rfile.read(length) or b"{}")
        batch = "queries" in payload
        try:
            with psycopg.connect(dsn, autocommit=not batch) as conn:
                if batch:
                    level = self.headers.get("Neon-Batch-Isolation-Level")
                    if level in ISOLATION:
                        conn.isolation_level = ISOLATION[level]
                    if self.headers.get("Neon-Batch-Read-Only") == "true":
                        conn.read_only = True
                with psycopg.RawCursor(conn) as cur:
                    if batch:
                        results = [_run(cur, q["query"], q.get("params") or []) for q in payload["queries"]]
                        conn.commit()
                        self._send(200, {"results": results})
                    else:
                        self._send(200, _run(cur, payload["query"], payload.get("params") or []))
        except psycopg.Error as exc:
            diag = getattr(exc, "diag", None)
            self._send(
                400,
                {
                    "message": str(exc).strip().splitlines()[0] if str(exc) else "database error",
                    "code": getattr(diag, "sqlstate", None) if diag else None,
                    "detail": getattr(diag, "message_detail", None) if diag else None,
                    "hint": getattr(diag, "message_hint", None) if diag else None,
                    "severity": getattr(diag, "severity", None) if diag else None,
                },
            )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--port", type=int, default=4444)
    parser.add_argument("--dsn", default="", help="Fallback DSN when the request has none")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    server.dsn = args.dsn  # type: ignore[attr-defined]
    server.verbose = args.verbose  # type: ignore[attr-defined]
    print(f"neon-http-shim listening on http://127.0.0.1:{args.port}/sql", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
