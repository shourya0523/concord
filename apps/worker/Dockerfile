# syntax=docker/dockerfile:1
# Worker image stub — build context is repo root.
# Long scrapes run here (or Cloud Agents), never inside Vercel request handlers.
# Health: see docs/deployment/workers.md — import check, not an HTTP server.

FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt pyproject.toml README.md ./
COPY src ./src
COPY scrapers ./scrapers
COPY main.py ./

RUN pip install --no-cache-dir -e .

# Container health = installed package + scrape tree present (no Glassdoor network I/O).
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD python -c "from pathlib import Path; import ibpe_corpus; assert Path('scrapers').is_dir(); assert Path('main.py').is_file(); print('worker_health_ok')"

# Placeholder: replace with concrete job entrypoints (glassdoor / corpus / enrich).
# Do not point GitHub Actions schedule at batch scrape without secrets review.
CMD ["python", "-c", "print('concord-worker stub: set command to main.py batch or ibpe job')"]
