# iMapSU — Campus Property Management

Interactive 3D map of campus spaces (market stalls, buildings) with tenant management,
rental applications, billing, announcements, maintenance tickets, and feedback.

- **Backend:** Strapi 5 (Node) — `backend/`
- **Frontend:** Nuxt 3 (Vue) — `frontend/`

## Prerequisites

- **Git** — https://git-scm.com
- **Node.js 20 – 26** (LTS 22 recommended) — https://nodejs.org
- **npm** — ships with Node
- **PostgreSQL** — *only* if you choose the full database setup (the quick start
  uses SQLite and needs no install)

## 1. Clone the repository

```bash
git clone https://github.com/karlliangomez/imapsu.git
cd imapsu
```

## 2. Backend

Open a terminal in the `backend` folder:

```bash
cd backend
npm install
```

Create your local environment file:

- **Windows:** `copy .env.example .env`
- **macOS/Linux:** `cp .env.example .env`

Open `backend/.env` and fill in the SMTP block with **your own Gmail** credentials
(see [Gmail app password](#gmail-app-password-one-time) below):

```env
# App
FRONTEND_URL=http://localhost:3000

# Email — use YOUR OWN Gmail credentials
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=yourgmail@gmail.com
SMTP_PASSWORD=your16charapppassword    # no spaces
EMAIL_FROM=iMapSU <yourgmail@gmail.com>
```

Database — the quick start needs nothing installed (files land in `backend/.tmp`):

```env
DATABASE_CLIENT=sqlite
```

*(For the full setup with PostgreSQL, instead comment out the sqlite line and use:)*

```env
# DATABASE_CLIENT=postgres
# DATABASE_HOST=localhost
# DATABASE_PORT=5432
# DATABASE_NAME=imapsu
# DATABASE_USERNAME=postgres
# DATABASE_PASSWORD=yourpostgrespassword
```

Start the backend:

```bash
npm run develop
```

Wait until you see `http://localhost:1337` ready. **First time only:** open
[http://localhost:1337/admin](http://localhost:1337/admin) and create the admin-panel
super admin (Strapi asks once). The app's own roles (Student, Aspiring Tenant, OAS,
Admin) are created automatically on first boot — no manual setup needed.

## 3. Frontend

Open a **second terminal** in the `frontend` folder:

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## 4. Try the app

1. Go to **Create account** (`/register`) and sign up as Student or Aspiring Tenant.
2. Check your Gmail inbox (and **Spam** the first time) for the email
   **"Your iMapSU verification code"**, then click **Enter verification code** on
   the register screen and type in the 6-digit code → your account is activated
   and you're signed in.
3. If you try to sign in *before* verifying, it's blocked with a message and a
   "resend code" option (codes expire after 10 minutes).

A fresh install starts with no buildings/tenants yet — the account, roles, and map
infrastructure are there waiting for data.

## Gmail app password (one-time)

Gmail no longer allows your normal password for apps, so create a dedicated one:

1. Go to [myaccount.google.com/security](https://myaccount.google.com/security) and turn on **2-Step Verification**.
2. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords).
3. App name: `iMapSU` → **Create**.
4. Copy the 16-character code and **remove the spaces** — use it as `SMTP_PASSWORD`.

Notes: an app password gives apps the ability to send email *as you* — keep it
private, and revoke it anytime from the same page. Gmail caps SMTP sends around
500 messages/day (fine for development).

## Troubleshooting

| Symptom | Fix |
|---|---|
| Backend edits to `.env` not applied | Restart the backend (`.env` is read at startup) |
| Port 1337 or 3000 already in use | Change `PORT` in `backend/.env`, or set `NUXT_PUBLIC_STRAPI_URL` to the new backend URL in `frontend` |
| Verification email not arriving | Check the **Spam** folder; confirm `SMTP_HOST`/`SMTP_USER`/`SMTP_PASSWORD`; watch the backend terminal log |
| Wrong Gmail password error in logs | Regenerate the app password, remove spaces |
| `npm install` errors | Use Node LTS (22); delete `node_modules` + `package-lock.json` and retry |

## Security notes

- `backend/.env` contains secrets (DB + Gmail app password). It is gitignored —
  never commit it or share it.
- The example secrets in `.env.example` are fine for a local try; generate your own
  for anything shared or deployed.