#!/usr/bin/env bash
set -euo pipefail
# Start Redis

docker run -d \
  --name redis \
  -p 6379:6379 \
  --restart unless-stopped \
  redis:alpine >/dev/null

curl -fsSL https://bun.sh/install | bash

# Install dependencies
bun install

# Build-time: set `VITE_CHAT_WIDGET_ENABLED=false`
# Runtime (URL): add `?chatWidget=0` (also supports `?chat=0`)
# Chat widget is disabled by default (can override by exporting VITE_CHAT_WIDGET_ENABLED=true)
export VITE_CHAT_WIDGET_ENABLED="${VITE_CHAT_WIDGET_ENABLED:-false}"

# Start development server
bun run dev
