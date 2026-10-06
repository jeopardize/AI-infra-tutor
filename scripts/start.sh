#!/usr/bin/env bash
cd "$(dirname "$0")/.."
set -a; source .env; set +a
exec npx next start -p 8001
