# Phase 4: Share Link Email Delivery via Resend

## Overview

The Share modal now supports sending deal share links via email using the Resend email API. If email delivery fails, the share URL is still returned so users can copy and share it manually.

## Environment Variables Required

| Variable | Type | Description |
|----------|------|-------------|
| `RESEND_API_KEY` | Secret | Resend API key for email delivery |
| `SHARE_FROM_EMAIL` | Env var | Sender address, e.g. `FractPath <noreply@notify.fractpath.com>` |

Both must be set for email delivery to work. If missing, the share link is still generated — only email sending is skipped with a warning.

## How It Works

1. User opens Share modal and enters an email address
2. Clicks "Send share link"
3. Client calls `POST /api/deals/[dealId]/share` with `{ email: "..." }`
4. Server mints a share token (unchanged behavior)
5. Server builds `shareUrl` (unchanged behavior)
6. If email is provided and valid:
   - Server calls Resend API to send the email
   - Returns `{ ok: true, shareUrl, emailed: true }`
7. If email send fails:
   - Returns `{ ok: true, shareUrl, emailed: false, warning: "..." }`
   - User sees warning + can copy the link manually
8. "Copy link only" button generates a link without sending email

## Failure Behavior

| Scenario | Result |
|----------|--------|
| No email provided | Link generated, no email sent |
| Invalid email (no @) | Send button disabled client-side |
| RESEND_API_KEY missing | Warning returned, link still available |
| SHARE_FROM_EMAIL missing | Warning returned, link still available |
| Resend API returns error | Warning returned, link still available |
| Token mint fails | Error returned (existing behavior) |

The principle: email delivery is best-effort. The share URL is always returned if the token mint succeeds.

## API Response Shape

```json
{
  "ok": true,
  "token": "...",
  "shareUrl": "https://app.fractpath.com/share?t=...",
  "recipientEmail": "user@example.com",
  "emailed": true,
  "warning": null
}
```

New fields added (backward-compatible):
- `emailed` (boolean) — whether email was successfully sent
- `warning` (string | undefined) — user-facing warning if email failed

Existing fields unchanged: `ok`, `token`, `shareUrl`, `recipientEmail`.

## Email Content

- **From:** `FractPath <noreply@notify.fractpath.com>` (configurable via SHARE_FROM_EMAIL)
- **Subject:** "FractPath deal link"
- **Body:** Contains the share URL with a brief description
- **HTML:** Simple HTML version with a clickable link

## Files Changed

| File | Change |
|------|--------|
| `src/lib/email/sendShareLinkEmail.ts` | New — Resend email helper |
| `src/app/api/deals/[dealId]/share/route.ts` | Updated — optional email send after token mint |
| `src/components/deal/ShareDealModal.tsx` | Updated — Send share link button, success/warning states |

## Manual Test Plan

### 1. Send share link via email
- Open a deal you own
- Click Share
- Enter a valid email address
- Click "Send share link"
- Verify green success message appears
- Verify share URL is displayed below
- Check recipient's inbox for email with link

### 2. Copy link only (no email)
- Open Share modal
- Click "Copy link only" without entering email
- Verify link is generated and displayed
- Click Copy, verify clipboard contains the URL

### 3. Email send failure
- Temporarily set an invalid RESEND_API_KEY
- Try sending a share link
- Verify amber warning appears
- Verify share URL is still displayed and copyable

### 4. Missing env vars
- Remove SHARE_FROM_EMAIL
- Try sending a share link
- Verify warning: "Email sending is not configured. Use the link to share."
- Verify link is still generated

### 5. Invalid email
- Enter "notanemail" in the email field
- Verify "Send share link" button is disabled
