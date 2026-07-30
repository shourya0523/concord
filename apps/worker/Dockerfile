# syntax=docker/dockerfile:1
# Wave 1 stub — build context is repo root.
# Long scrapes run here (or Cloud Agents), never inside Vercel request handlers.

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

# Placeholder: replace with concrete job entrypoints (glassdoor / corpus / enrich).
CMD ["python", "-c", "print('concord-worker stub: set command to main.py batch or ibpe job')"]
