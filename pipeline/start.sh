#!/usr/bin/env bash
# Local launcher: key is read privately and kept only in the server environment.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  read -r -s -p "Lablup API key (hidden): " OPENAI_API_KEY
  printf '\n'
  export OPENAI_API_KEY
fi
if [[ -z "$OPENAI_API_KEY" ]]; then
  printf 'No key entered. Server was not started.\n' >&2
  exit 1
fi
exec python3 -m pipeline.server "$@"
