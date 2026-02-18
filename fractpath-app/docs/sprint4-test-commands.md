# Sprint 4 Test Commands

Base URL: `https://e65d6c0f-2424-4792-91b7-dbc5497fad14-00-3p7hkgjzlnfo9.spock.replit.dev`

## Test User
- Email: `cookie-test@example.com`
- Password: `TestPassw0rd`

---

## 1. Login Flow

### Browser QA
1. Navigate to `/login`
2. Enter test credentials
3. Submit form
4. Verify redirect to `/protected`
5. Verify email shown on protected page

### curl Test
```bash
# Login (returns 303 redirect with set-cookie)
curl -i -X POST \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "email=cookie-test@example.com&password=TestPassw0rd" \
  "https://e65d6c0f-2424-4792-91b7-dbc5497fad14-00-3p7hkgjzlnfo9.spock.replit.dev/auth/login"
```

---

## 2. Protected Page

### Browser QA
1. Log in first
2. Navigate to `/protected`
3. Verify shows "Signed in as [email]"
4. Click "Log out" button
5. Verify redirected to login

### curl Test
```bash
# Without auth (should redirect to login)
curl -i "https://e65d6c0f-2424-4792-91b7-dbc5497fad14-00-3p7hkgjzlnfo9.spock.replit.dev/protected"
```

---

## 3. My Scenarios

### Browser QA
1. Log in first
2. Navigate to `/my-scenarios`
3. Verify list of scenarios loads (or "No scenarios found")
4. If unauthorized, verify login link shown

### curl Test
```bash
# Get scenarios (requires auth cookie)
curl -i "https://e65d6c0f-2424-4792-91b7-dbc5497fad14-00-3p7hkgjzlnfo9.spock.replit.dev/api/scenario?limit=20"
```

---

## 4. Signup Flow

### Browser QA
1. Navigate to `/signup`
2. Enter new email and password
3. Submit form
4. Verify redirect to `/verify-email`
5. Check email for confirmation link

### curl Test
```bash
# Signup (returns 303 redirect to verify-email)
curl -i -X POST \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "email=test-new@example.com&password=TestPassw0rd" \
  "https://e65d6c0f-2424-4792-91b7-dbc5497fad14-00-3p7hkgjzlnfo9.spock.replit.dev/auth/signup"
```

---

## 5. Reset Password Flow

### Browser QA
1. Navigate to `/reset-password`
2. Enter email
3. Submit form
4. Verify "Check your email" message
5. Click link in email
6. Verify redirected to `/update-password`
7. Enter new password and submit

---

## 6. Update Password

### Browser QA
1. Complete reset password flow first
2. On `/update-password` page, enter new password twice
3. Submit form
4. Verify redirected to home page

---

## 7. API: /api/me

### curl Test
```bash
# Get current user (requires auth cookie)
curl -i "https://e65d6c0f-2424-4792-91b7-dbc5497fad14-00-3p7hkgjzlnfo9.spock.replit.dev/api/me"
```

Expected: 401 Unauthorized without auth, 200 with user data when authenticated

---

## 8. API: /api/scenario POST

### curl Test
```bash
# Create scenario (requires auth cookie)
curl -i -X POST \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Scenario","scenario_summary":"Test summary"}' \
  "https://e65d6c0f-2424-4792-91b7-dbc5497fad14-00-3p7hkgjzlnfo9.spock.replit.dev/api/scenario"
```

Expected: 401 without auth, 201 with scenario ID when authenticated

---

## Route Summary

| Route | Type | Auth Required | Status |
|-------|------|---------------|--------|
| `/` | Page | No | OK |
| `/login` | Page | No | OK |
| `/signup` | Page | No | OK |
| `/protected` | Page | Yes | OK |
| `/my-scenarios` | Page | Yes (soft) | OK |
| `/reset-password` | Page | No | OK |
| `/update-password` | Page | Yes (via link) | OK |
| `/verify-email` | Page | No | OK |
| `/me` | Page (debug) | No | OK |
| `/auth/login` | API | No | OK |
| `/auth/signup` | API | No | OK |
| `/auth/logout` | API | No | OK |
| `/auth/callback` | API | No | OK |
| `/api/me` | API | Yes | OK |
| `/api/scenario` | API | Yes | OK |
| `/api/submit` | API | No | OK |
