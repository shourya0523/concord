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

# Pages
check GET "/" 200
check GET "/dashboard" 200
check GET "/study" 200
check GET "/simulator" 200
check GET "/onboarding" 200
check GET "/sign-in" 200
check GET "/sign-up" 200
check GET "/settings" 200
check GET "/prep/heat" 200
check GET "/prep/rag" 200
check GET "/companies/goldman-sachs" 200

# APIs
check GET "/api/health" 200
check GET "/api/questions" 200
check GET "/api/firms/goldman-sachs/heat" 200
check GET "/api/mastery" 200
check GET "/api/notes" 200
# GET /api/search coerces limit/offset as strings → 400 today; POST is the supported probe
check POST "/api/search" 200 \
  -H "content-type: application/json" \
  -d '{"q":"LBO","limit":5,"offset":0}'
check POST "/api/practice/sessions" 201 \
  -H "content-type: application/json" \
  -d '{}'

# Admin status may be 503 when Neon unset — accept 200 or 503
admin_code="$(curl -sS -o /dev/null -w "%{http_code}" -A "$UA" --max-time 30 \
  "${BASE_URL}/api/admin/status" || echo 000)"
if [[ "$admin_code" == "200" || "$admin_code" == "503" ]]; then
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
