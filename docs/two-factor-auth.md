# Two-Factor Authentication (SMS OTP)

Two-factor login by SMS for **all** users (students on mobile, staff on the web portal).
Built dark behind a flag; turn it on only once a real SMS sender is configured.

## Turning it on / off

- `OTP_2FA_ENABLED=true` on the **API server** enables it. Default/unset = off → login
  behaves exactly as before (`/auth/login` returns `{ user, token }` directly).
- When on, a correct password no longer returns a session. Instead `/auth/login` returns:
  - `{ twoFactor: { stage: "otp", challengeId, maskedDestination, channel, devCode? } }`
    when the user already has a **verified** phone, or
  - `{ twoFactor: { stage: "phone_setup", setupTicket } }` when they don't (first time).

## Endpoints (all under `/api`)

| Endpoint | Purpose |
| --- | --- |
| `POST /auth/login` | password step → returns a `twoFactor` challenge (or session if 2FA off) |
| `POST /auth/login/verify-otp` `{challengeId, code}` | verify the login code → `{user, token}` |
| `POST /auth/2fa/phone` `{setupTicket, phone}` | first-time: store phone, send verify code |
| `POST /auth/2fa/phone/verify` `{challengeId, code}` | verify phone → mark verified → `{user, token}` |
| `POST /auth/2fa/resend` `{challengeId}` | resend the current code (throttled) |
| `POST /admin/users/:id/reset-2fa` | admin recovery: clear a user's phone + verification |

Rolling sessions: `/auth/me` now returns a freshly-rolled `token` once the current one is
older than 7 days, so an actively-used app effectively never forces a re-login (and so
rarely re-triggers an SMS). Clients store the new token when present.

## What the owner must provide to go LIVE

The OTP engine is provider-agnostic (`api-server/src/lib/sms.ts`). Until real credentials
are set, `SMS_PROVIDER=console` (the default) just logs the code to the server log and
returns it as `devCode` for local testing — **no SMS is sent**.

To send real SMS, set on the API server one of:

### Option A — generic HTTP gateway (most Egyptian providers: SMSMisr, Victory Link, Cequens, Connekio)
```
SMS_PROVIDER=http
SMS_SENDER_ID=<approved NTRA sender name, e.g. Eltafouk>
SMS_HTTP_URL=<gateway URL, may contain {to} {text} {sender}>
SMS_HTTP_METHOD=GET            # or POST
SMS_HTTP_BODY=<optional POST body template with {to} {text} {sender}>
SMS_HTTP_HEADERS=<optional JSON, e.g. {"Authorization":"Bearer ..."}>
```

### Option B — Twilio
```
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM=<a Twilio number, or a Messaging Service SID starting with MG>
```

**Owner action items:** open an account with an SMS provider, register a sender ID (اسم
المرسل) with NTRA (takes time), and hand over the API key + URL + sender name. No app code
changes are then required — just set the env vars and flip `OTP_2FA_ENABLED=true`.

### Email fallback (optional, later)
There is currently **no email infrastructure** in the project. The primary lost-phone
recovery is the admin **reset-2fa** action. An email OTP channel would require adding an
email provider (Resend / SendGrid / SES) + its API key.

## Tunables (env, all optional)
`OTP_CODE_LENGTH` (default 6), `OTP_TTL_SECONDS` (300), `OTP_MAX_ATTEMPTS` (5),
`OTP_MAX_RESENDS` (5), `OTP_RESEND_COOLDOWN_SECONDS` (60).

## Deploy coupling
Adds table `auth_otp_challenges` and column `users.phone_verified_at` (both additive/safe).
Run `pnpm --filter @workspace/db run push` before/with the deploy.
