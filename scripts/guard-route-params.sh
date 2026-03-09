#!/usr/bin/env bash
set -euo pipefail

FAIL=0

echo "Checking route handlers for non-Promise params patterns..."

if rg -n '\{ params \}: \{ params:' src/app/api --type ts 2>/dev/null; then
  echo "ERROR: Found destructured non-Promise params pattern."
  FAIL=1
fi

if rg -n 'params:.*\| Promise<' src/app/api --type ts 2>/dev/null; then
  echo "ERROR: Found union params pattern (should be Promise only)."
  FAIL=1
fi

if rg -n 'Promise\.resolve\(.*\.params\)' src/app/api --type ts 2>/dev/null; then
  echo "ERROR: Found Promise.resolve(ctx.params) — use await ctx.params directly."
  FAIL=1
fi

if [ "$FAIL" -eq 1 ]; then
  echo ""
  echo "Next.js 16 requires: ctx: { params: Promise<{ ... }> }"
  echo "  with: const { x } = await ctx.params;"
  exit 1
fi

echo "All route handlers use the correct Promise params pattern."
