#!/usr/bin/env bash
# Startup for Cursor Cloud agents — keep long-running services alive.
set -euo pipefail

export PATH="${HOME}/.npm-global/bin:${HOME}/.local/bin:${PATH}"

# Docker daemon (needed for compose / container workflows)
if command -v docker >/dev/null 2>&1; then
  if ! docker info >/dev/null 2>&1; then
    echo "Starting Docker..."
    sudo service docker start || sudo dockerd >/tmp/dockerd.log 2>&1 &
    for _ in $(seq 1 30); do
      if docker info >/dev/null 2>&1; then
        break
      fi
      sleep 1
    done
  fi
  if docker info >/dev/null 2>&1; then
    echo "Docker is ready."
  else
    echo "Warning: Docker did not become ready." >&2
  fi
fi

# Optional compose stack when present
if [[ -f docker-compose.yml ]] || [[ -f compose.yml ]]; then
  echo "Starting docker compose services..."
  docker compose up -d
fi
