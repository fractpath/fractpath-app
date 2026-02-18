#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3000}"

echo "== smoke: /login should be 200 =="
curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:${PORT}/login" | grep -q "^200$"

echo "== smoke: /api/me should be 401 when logged out =="
code="$(curl -s -o /tmp/me.json -w "%{http_code}\n" "http://127.0.0.1:${PORT}/api/me")"
cat /tmp/me.json
test "$code" = "401"

echo "== smoke: OK =="
