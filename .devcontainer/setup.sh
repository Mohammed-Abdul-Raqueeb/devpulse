#!/usr/bin/env bash
# Runs once, after the container is created.
set -euo pipefail

echo "Installing dependencies..."
npm ci

# The API refuses to boot without a secret, so generate one rather than leaving
# the first `npm run dev` to fail with a config error.
if [ ! -f .env ]; then
  echo "Creating .env with a generated JWT_SECRET..."
  cp .env.example .env
  secret="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
  # Replace the empty JWT_SECRET line rather than appending a duplicate.
  node -e "
    const fs = require('fs');
    const env = fs.readFileSync('.env', 'utf8').replace(/^JWT_SECRET=.*$/m, 'JWT_SECRET=$secret');
    fs.writeFileSync('.env', env);
  "
fi

echo "Building shared packages..."
npm run build --workspace=@devpulse/shared

echo
echo "Ready. Next steps:"
echo "  npm run seed    # 60 days of demo traffic"
echo "  npm run dev     # API on :4000, dashboard on :5173"
