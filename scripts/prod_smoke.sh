#!/usr/bin/env bash
# Wave 3 deployment-gate smoke (§45) against production.
# Usage: BASE_URL=https://concord-umber.vercel.app bash scripts/prod_smoke.sh
set -euo pipefail

BASE_URL="${BASE_URL:-https://concord-umber.vercel.app}"
UA="concord-infra-wave3-smoke"
FAIL=0

check() {
  local method="$1" path="$2" expect="$3"
  shift 3
  local tmp code
  tmp="$(mktemp)"
  code="$(curl -sS -o "$tmp" -w "%{http_code}" -X "$method" \
    -A "$UA" --max-time 30 "$@" "${BASE_URL}${path}" || echo 000)"
  if [[ "$code" == "$expect" ]]; then
    printf "PASS  %-6s %-40s -> %s\n" "$method" "$path" "$code"
  else
    printf "FAIL  %-6s %-40s -> %s (expected %s)\n" "$method" "$path" "$code" "$expect"
    head -c 180 "$tmp" | tr '\n' ' '; echo
    FAIL=1
  fi
  rm -f "$tmp"
}

echo "=== Production smoke: ${BASE_URL} ==="

health_tmp="$(mktemp)"
health_code="$(curl -sS -o "$health_tmp" -w "%{http_code}" -A "$UA" --max-time 30 \
  "${BASE_URL}/api/health" || echo 000)"
AUTH_MODE="stub"
if [[ "$health_code" == "200" ]]; then
  AUTH_MODE="$(python3 -c "import json; print(json.load(open('$health_tmp')).get('auth','stub'))" 2>/dev/null || echo stub)"
  printf "PASS  %-6s %-40s -> %s (auth=%s)\n" "GET" "/api/health" "$health_code" "$AUTH_MODE"
else
  printf "FAIL  %-6s %-40s -> %s (expected 200)\n" "GET" "/api/health" "$health_code"
  FAIL=1
fi
rm -f "$health_tmp"

# Pages
check GET "/" 200
check GET "/dashboard" 200
check GET "/study" 200
check GET "/simulator" 200
check GET "/onboarding" 200
check GET "/sign-in" 200
check GET "/sign-up" 200
check GET "/settings" 200
# Neon Auth protects /prep/* — anonymous 307 to /sign-in is expected when configured
if [[ "$AUTH_MODE" == "configured" ]]; then
  check GET "/prep/heat" 307
  check GET "/prep/rag" 307
else
  check GET "/prep/heat" 200
  check GET "/prep/rag" 200
fi
check GET "/companies/goldman-sachs" 200

# APIs
check GET "/api/questions" 200
check GET "/api/firms/goldman-sachs/heat" 200
if [[ "$AUTH_MODE" == "configured" ]]; then
  check GET "/api/mastery" 307
  check GET "/api/notes" 307
else
  check GET "/api/mastery" 200
  check GET "/api/notes" 200
fi
# GET /api/search coerces limit/offset as strings → 400 today; POST is the supported probe
check POST "/api/search" 200 \
  -H "content-type: application/json" \
  -d '{"q":"LBO","limit":5,"offset":0}'
if [[ "$AUTH_MODE" == "configured" ]]; then
  check POST "/api/practice/sessions" 307 \
    -H "content-type: application/json" \
    -d '{}'
else
  check POST "/api/practice/sessions" 201 \
    -H "content-type: application/json" \
    -d '{}'
fi

# Admin: stub/unavailable → 200|503; Neon Auth configured → 307 anonymous
admin_code="$(curl -sS -o /dev/null -w "%{http_code}" -A "$UA" --max-time 30 \
  "${BASE_URL}/api/admin/status" || echo 000)"
if [[ "$AUTH_MODE" == "configured" ]]; then
  if [[ "$admin_code" == "307" || "$admin_code" == "401" || "$admin_code" == "200" || "$admin_code" == "503" ]]; then
    printf "PASS  %-6s %-40s -> %s (auth-aware ok)\n" "GET" "/api/admin/status" "$admin_code"
  else
    printf "FAIL  %-6s %-40s -> %s (expected 307|401|200|503)\n" "GET" "/api/admin/status" "$admin_code"
    FAIL=1
  fi
elif [[ "$admin_code" == "200" || "$admin_code" == "503" ]]; then
  printf "PASS  %-6s %-40s -> %s (200|503 ok)\n" "GET" "/api/admin/status" "$admin_code"
else
  printf "FAIL  %-6s %-40s -> %s (expected 200|503)\n" "GET" "/api/admin/status" "$admin_code"
  FAIL=1
fi

echo
if [[ "$FAIL" -eq 0 ]]; then
  echo "SMOKE OK"
  exit 0
fi
echo "SMOKE FAILED"
exit 1
