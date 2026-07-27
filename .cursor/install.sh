#!/usr/bin/env bash
# Idempotent dependency install for Cursor Cloud agents.
set -euo pipefail

export PATH="${HOME}/.npm-global/bin:${HOME}/.local/bin:${PATH}"

echo "==> concord cloud install"

mkdir -p "${HOME}/.npm-global" "${HOME}/.local/bin"

# Node / JS
if [[ -f package-lock.json ]]; then
  echo "Installing npm dependencies..."
  npm ci
elif [[ -f pnpm-lock.yaml ]]; then
  echo "Installing pnpm dependencies..."
  corepack enable >/dev/null 2>&1 || true
  pnpm install --frozen-lockfile
elif [[ -f yarn.lock ]]; then
  echo "Installing yarn dependencies..."
  yarn install --frozen-lockfile
elif [[ -f package.json ]]; then
  echo "Installing npm dependencies (no lockfile)..."
  npm install
else
  echo "No Node package manifest found; skipping JS install."
fi

# Python (prefer project venv)
if [[ -f requirements.txt ]] || [[ -f pyproject.toml ]]; then
  echo "Ensuring Python venv and dependencies..."
  if [[ ! -d .venv ]]; then
    python3 -m venv .venv
  fi
  # shellcheck disable=SC1091
  source .venv/bin/activate
  python -m pip install --upgrade pip >/dev/null
  if [[ -f requirements.txt ]]; then
    pip install -r requirements.txt
  elif [[ -f pyproject.toml ]] && command -v uv >/dev/null 2>&1; then
    uv sync || uv pip install -e ".[dev]" || true
  fi
else
  echo "No Python project found; skipping Python install."
fi

# Rust
if [[ -f Cargo.toml ]]; then
  echo "Fetching Rust dependencies..."
  cargo fetch
fi

# Go
if [[ -f go.mod ]]; then
  echo "Downloading Go modules..."
  go mod download
fi

echo "==> install complete"
