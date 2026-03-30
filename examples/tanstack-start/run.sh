#!/bin/bash
set -e

# Install dependencies
pnpm install

# Start Redis
docker run -d \
  --name redis \
  -p 6379:6379 \
  --restart unless-stopped \
  redis:alpine

# Wait for Redis to be ready
until docker exec redis redis-cli ping | grep -q PONG; do sleep 1; done

# Start development server
pnpm dev
