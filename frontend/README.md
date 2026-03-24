````markdown
# Inkomoko Impact & Early Warning Dashboard (v2) — Frontend (Next.js)

This frontend is a **Next.js (App Router)** dashboard for the Inkomoko Intelligence Suite.

It includes:

- Login page (email/password)
- Session handling (JWT stored client-side)
- Role-aware navigation (sidebar)
- Page-level RBAC guard (prevents viewing routes you don’t have access to)
- UI screens: Overview, Portfolio, Scenarios, Advisory, Model Cards, Data Quality, Audit, Reports, Settings
- Export utilities (CSV / Excel / PDF)

### Overview Page (Executive Dashboard)

The Overview page now uses a high-density executive analytics contract and orchestrates all data loads in one place.

Primary API calls:

- `GET /portfolio/overview`
- `GET /portfolio/risk-distribution`
- `GET /portfolio/trends?months=<3|6|12|24>`
- `GET /portfolio/country-comparison`
- `GET /portfolio/sector-risk-summary?limit=12`
- `GET /portfolio/anomaly-signals`
- `GET /portfolio/enterprises`

The legacy standalone overview widgets were removed and replaced by a single composed page in:

- `frontend/app/(app)/page.tsx`

> **Important:** The frontend enforces UI restrictions for user experience, but the **backend is the source of truth** for authorization.

---

## 1) Requirements

- Node.js **18+** /or conda install -c conda-forge nodejs
- Backend running at: `http://127.0.0.1:8000`

---

## 2) Install & Run

From the `frontend/` folder:
/maybe you may need to run first: python -m pip install --upgrade pip

```bash
npm install
npm run dev
```
````

Open:

- [http://localhost:3000](http://localhost:3000)

---

## 3) Configure API Base URL

The frontend calls the backend via `lib/api.ts`.

Check or set the backend base URL in your environment variables:

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_BASE=http://127.0.0.1:8000
```

Restart the dev server after editing `.env.local`.

---

## 4) Demo Users (Use these to login)

These accounts are created in the backend database for team development:

| Role                | Email                 | Password             |
| ------------------- | --------------------- | -------------------- |
| **Admin**           | `admin@example.com`   | `AdminPassword123`   |
| **Program Manager** | `pm@example.com`      | `PmPassword123`      |
| **Advisor**         | `advisor@example.com` | `AdvisorPassword123` |
| **Donor**           | `donor@example.com`   | `DonorPassword123`   |

---

## 5) How Login Works

When you click **Sign in**, the frontend:

1. Calls `POST /auth/login` with `{ email, password }`
2. Receives `access_token` (JWT)
3. Calls `GET /auth/me` using that token
4. Builds a `UserSession` object:
   - user_id
   - email
   - name
   - role (primary role)
   - roles (all roles)
   - access_token

5. Saves session locally (browser storage) so you stay logged in

Tokens are **temporary** and refresh by logging in again.

---

## 6) RBAC in the Frontend

Frontend RBAC is implemented in **two layers**:

### A) Sidebar filtering (navigation RBAC)

Only shows routes allowed for the current role.

File:

- `frontend/components/layout/Sidebar.tsx`

### B) Page-level guard (route RBAC)

Even if a user manually types a URL, the page guard blocks access.

File(s):

- `frontend/components/auth/RequireRole.tsx` (role gate)
- Each restricted page wraps content with `<RequireRole allowed={[...]} />`

---

## 7) Session & Auth Files You Will Edit

### Auth provider (login/logout + session)

- `frontend/components/auth/AuthProvider.tsx`

### Route protection (redirect to /login)

- `frontend/components/auth/RequireAuth.tsx`

### Login page (calls login and handles errors)

- `frontend/app/login/page.tsx`

---

## 8) Settings Page Access (All Roles)

The **Settings** page is intentionally visible to all roles in this version, because it contains:

- platform info
- governance overview
- versioning notes

It does **not** expose sensitive operations.

If you want to restrict it:

- remove `/settings` from the donor/advisor/program_manager allowed sets in `Sidebar.tsx`
- and add a `<RequireRole ...>` wrapper in `settings/page.tsx`

---

## 9) Troubleshooting

### “Login works but no redirect”

- Ensure `(app)` layout wraps everything in `RequireAuth`:

File:

- `frontend/app/(app)/layout.tsx`

```tsx
<RequireAuth>
  <AppShell>{children}</AppShell>
</RequireAuth>
```

### “Overview flashes then routes to another page”

Usually caused by:

- Sidebar active route detection using strict `pathname === href`
  Fix is already applied:
- `pathname === item.href || pathname.startsWith(item.href + "/")`

### “Backend calls failing (401 / Invalid token)”

- Make sure the backend is running
- Check `NEXT_PUBLIC_API_BASE`
- Re-login to refresh token

---

## 10) Contract Smoke Checklist

After backend/frontend changes, validate:

1. Overview loads without duplicate `GET /portfolio/overview` calls.
2. Leaderboards render from `country-comparison` and `sector-risk-summary`.
3. Anomaly rail renders from `anomaly-signals`.
4. Month window toggles update `trends` query (`3/6/12/24`).
5. Exports still work from the overview header.

---

```

```
