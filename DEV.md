# Local development — passkeys + zero-access mail

The local stack lives in `~/hypamail-dev` (outside the repo) and consists of:

| Piece | Where | Port |
|---|---|---|
| Stalwart 0.16.13 (single binary) | `~/hypamail-dev/stalwart` | JMAP/HTTP `127.0.0.1:8088`, SMTP `127.0.0.1:2525` |
| PostgreSQL (user-level cluster) | `~/hypamail-dev/pgdata` | `127.0.0.1:5433` |
| Next.js dev server | this repo | `localhost:3000` |

App env is in `.env.local` (Turnstile **official test keys** — the widget always
passes; Stalwart admin is `admin@hypamail.local`, password in the file).

## Start / stop

```bash
# postgres
pg_ctl -D ~/hypamail-dev/pgdata -o "-p 5433" -l ~/hypamail-dev/pg.log start|stop

# stalwart
cd ~/hypamail-dev/stalwart && STALWART_HOSTNAME=mail.hypamail.local ./stalwart -c etc/config.json &
pkill -f 'stalwart -c'   # stop

# app
npm run dev
```

## Invite codes

```bash
node scripts/invites.mjs 5      # prints codes; only SHA-256 hashes are stored
```

## Send yourself a test mail

```bash
python3 - <<'EOF'
import smtplib
s = smtplib.SMTP('127.0.0.1', 2525)
s.sendmail('someone@example.com', ['YOURUSER@hypamail.local'],
  'From: someone@example.com\r\nTo: YOURUSER@hypamail.local\r\nSubject: hi\r\n\r\nhello there\r\n')
s.quit()
EOF
```

The message is PGP-encrypted by Stalwart **before it touches disk** — verify with
`grep -r "hello there" ~/hypamail-dev/stalwart/data/` (no hits).

## Testing passkeys in a browser

- **Chromium/Chrome/Edge**: works out of the box (DevTools → WebAuthn tab also
  offers a virtual authenticator).
- **Firefox on Linux**: no platform authenticator and no PRF yet. Install the
  **Bitwarden extension** (handles passkeys incl. PRF), or test the
  recovery-words + TOTP path which needs no passkey at all.
- The full E2E (signup → encrypted mail → passkey login → recovery) is scripted
  against a CDP virtual authenticator; see the PR description.

## Dev-only Stalwart tweaks (already applied to the local instance)

- SMTP auth requirement relaxed (`MtaStageAuth.require = false`) because the
  default expression requires auth on any port other than 25 and our dev SMTP
  listener is on 2525. **Production listens on 25 — do not apply this there.**
- `127.0.0.1`/`::1` added to the IP allow-list so the webmail proxy can't get
  fail2banned by test logins.

## Production deployment notes (Stalwart ≥ 0.16)

1. Config moved into the DB ("registry"); management is JMAP `x:Object/method`
   calls. `STALWART_ADMIN_USER` is now the full address, e.g. `admin@hypamail.me`.
2. Enforce encryption globally (admin, one-time):
   `x:Email/set {"update":{"singleton":{"encryptAtRest":true,"encryptOnAppend":true}}}`
   — the app also enables it per-account at signup, this is belt-and-braces.
3. Set `WEBAUTHN_RP_ID=hypamail.me` and `WEBAUTHN_ORIGIN=https://hypamail.me`.
4. Allow-list the webmail host's IP in Stalwart (`x:AllowedIp/set`) so failed
   logins can't fail2ban the proxy.
5. **Existing (pre-passkey) accounts**: password login is gone. This build has no
   automated migration — the practical path for the current small user base is a
   fresh invite (new account), or ask for a `/login/legacy` migration flow as a
   follow-up (old password → forced passkey/TOTP/words enrollment → password
   rotated → mailbox key upload; old mail stays readable but unencrypted until
   re-imported).
