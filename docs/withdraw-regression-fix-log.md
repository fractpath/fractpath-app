# Withdraw Offer Regression — Fix Log

Date: 2026-03-05

## Files changed

- `src/app/deal/[dealId]/page.tsx`
- `docs/withdraw-regression-fix-log.md` (this file)

## Exact change

### `src/app/deal/[dealId]/page.tsx`

**BEFORE** (lines 8-9):
```ts
import { DealActivityFeed } from "@/components/deal/DealActivityFeed";

type PageProps = {
```

**AFTER** (lines 8-12):
```ts
import { DealActivityFeed } from "@/components/deal/DealActivityFeed";
import { ActiveThreadBanner } from "@/components/deal/ActiveThreadBanner";

type PageProps = {
```

**BEFORE** (lines 120-122):
```tsx
          />

          <DealDetailWidgetPanel
```

**AFTER** (lines 124-133):
```tsx
          />

          {activeThread && (
            <ActiveThreadBanner
              threadId={activeThread.id}
              threadStatus={activeThread.status}
            />
          )}

          <DealDetailWidgetPanel
```

Total: 1 import line added, 5 lines of JSX added. No lines removed or modified.

## Why this is the minimal fix

1. `ActiveThreadBanner` already exists at `src/components/deal/ActiveThreadBanner.tsx` and is correctly implemented (renders "Withdraw Offer" button when `threadStatus === "pending_owner"`, calls `POST /api/threads/{threadId}/withdraw`).
2. The deal page already fetches `activeThread` from the database (lines 92-99) and passes it to `DealHeader`.
3. The only missing piece was importing and rendering `ActiveThreadBanner` on the page.
4. No backend, API, migration, or other component changes were required.

## Verification

### Build
```
$ npm run build
Compiled successfully. All routes compiled, no errors.
```

### Grep
```
$ rg -n "ActiveThreadBanner" src/app/deal/[dealId]/page.tsx src/components/deal/ActiveThreadBanner.tsx

src/components/deal/ActiveThreadBanner.tsx
11:export function ActiveThreadBanner({ threadId, threadStatus }: Props) {

src/app/deal/[dealId]/page.tsx
9:import { ActiveThreadBanner } from "@/components/deal/ActiveThreadBanner";
124:            <ActiveThreadBanner
```

## Manual verification checklist

- [ ] Open /deal/95d3f0b8-1d76-4769-8e86-32dc0926c485
- [ ] Confirm submitted-offer state now renders ActiveThreadBanner (amber banner between header and calculator)
- [ ] Confirm "Withdraw Offer" button is visible when thread.status = pending_owner
- [ ] Confirm clicking "Withdraw Offer" calls POST /api/threads/{threadId}/withdraw and refreshes the page
- [ ] Confirm page still builds and loads correctly
- [ ] Confirm no backend/API changes were required
