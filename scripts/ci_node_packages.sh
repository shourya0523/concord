#!/usr/bin/env bash
# CI helper: validate Node package manifests; isolated typecheck for @ibpe/contracts.
# Avoids npm workspace protocol failures when installing inside a single package folder.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

pkgs=()
while IFS= read -r line; do
  pkgs+=("$line")
done < <(find packages apps -maxdepth 2 -name package.json -not -path '*/node_modules/*' 2>/dev/null | sort)

if [[ ${#pkgs[@]} -eq 0 ]]; then
  echo "No package.json files under packages/ or apps/ - skip node checks"
  exit 0
fi

echo "== Parse package.json manifests =="
for pkg in "${pkgs[@]}"; do
  node -e "const p=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); console.log(p.name||process.argv[1], p.version||'')" "$pkg"
done

if [[ -f packages/contracts/package.json && -d packages/contracts/src ]]; then
  echo "== @ibpe/contracts: isolated zod + typecheck =="
  TMP="$(mktemp -d)"
  cleanup() { rm -rf "$TMP"; }
  trap cleanup EXIT
  mkdir -p "$TMP/src"
  cp -R packages/contracts/src/. "$TMP/src/"
  cat >"$TMP/tsconfig.json" <<'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"]
}
EOF
  (
    cd "$TMP"
    npm init -y >/dev/null 2>&1
    npm install --no-save --no-package-lock zod@^3.23.8 typescript@5.6.3 >/dev/null
    npx tsc --noEmit
  )
  echo "contracts ok"
  trap - EXIT
  cleanup
else
  echo "== @ibpe/contracts: skip typecheck (src not present on this branch) =="
fi

if [[ -f apps/web/package.json ]]; then
  echo "== apps/web: package.json scripts =="
  node -e "const p=require('./apps/web/package.json'); console.log(Object.keys(p.scripts||{}).join(', ')||'(none)')"
fi

echo "node package checks passed"
