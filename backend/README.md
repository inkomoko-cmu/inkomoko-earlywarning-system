````markdown
# Backend (FastAPI) — Inkomoko Intelligence Suite

This backend provides **authentication, authorization, and data access control** for the Inkomoko Intelligence Suite.

It is built with **FastAPI + PostgreSQL** and implements:

- Email/password authentication
- JWT-based session tokens
- Role-Based Access Control (RBAC)
- Country-level data scoping
- Admin-managed user provisioning
- Backend-enforced authorization (frontend is only a UI layer)

Portfolio analytics APIs now include executive dashboard endpoints:

- `GET /portfolio/overview`
- `GET /portfolio/risk-distribution`
- `GET /portfolio/trends?months=...`
- `GET /portfolio/by-country`
- `GET /portfolio/by-sector`
- `GET /portfolio/sector-risk-summary`
- `GET /portfolio/country-comparison`
- `GET /portfolio/anomaly-signals`

---

## 1. Architecture Overview

### Core concepts

| Concept       | Description                                                   |
| ------------- | ------------------------------------------------------------- |
| **User**      | A person who can log in (`auth_user`)                         |
| **Role**      | What the user can do (Admin, Program Manager, Advisor, Donor) |
| **Scope**     | Which country’s data a user can access                        |
| **JWT Token** | Short-lived access token proving authentication               |

All authorization decisions are enforced **server-side**.

---

## 2. Requirements

- Python 3.10+
- PostgreSQL 14+
- Conda or virtualenv
- Windows / macOS / Linux

---

## 3. Setup Environment

```bash
cd backend
conda create -n inkomoko-backend
conda activate inkomoko-backend
pip install -r requirements.txt
```
````

---

## 4. Environment Variables

Create `.env` from the example:

```bash
cp .env.example .env
```

Edit `.env`:

```env
DATABASE_URL=postgresql://postgres:<password>@localhost:5432/inkomoko_early_warning
JWT_SECRET=change_this_secret
JWT_ALGORITHM=HS256
JWT_EXPIRES_MINUTES=60
```

⚠️ **JWT_SECRET must be set or the app will not start**

---

## 5. Database Initialization

### 5.1 Create database & schema

Run the SQL files **from the backend directory**:

```bash
psql -U postgres -f ..\db\00_create_db.sql
psql -U postgres -d inkomoko_early_warning -f ..\db\01_schema.sql

```

This creates:

- `auth_user`
- `auth_role`
- `auth_user_role`
- `auth_scope`
- `ref_country`
- supporting lookup tables

---

### 5.2 Seed roles (one-time)

psql -U postgres -d inkomoko_early_warning

```sql
INSERT INTO auth_role (role_key, role_name)
VALUES
  ('admin', 'Admin'),
  ('program_manager', 'Program Manager'),
  ('advisor', 'Advisor'),
  ('donor', 'Donor')
ON CONFLICT (role_key) DO NOTHING;
```

---

### 5.3 Seed countries (required for scope)

```sql
INSERT INTO ref_country (country_code, country_name)
VALUES
  ('RW', 'Rwanda'),
  ('KE', 'Kenya'),
  ('UG', 'Uganda')
ON CONFLICT (country_code) DO NOTHING;
```

> Users cannot be scoped to a country unless it exists in `ref_country`.

---

## 6. Run the Backend

```bash
uvicorn app.main:app --reload --port 8000
```

Health check:

```
GET http://192.198.1.107:8000/health
```

other imports maybe requested:

- pip install passlib[bcrypt]
- pip install email-validator

---

## 7. Demo Users (For Team Development)

The following users are **pre-created for development and demo purposes**.
These credentials are safe to commit because they are **local-only demo accounts**.

| Role                | Email                 | Password             |
| ------------------- | --------------------- | -------------------- |
| **Admin**           | `admin@example.com`   | `AdminPassword123`   |
| **Program Manager** | `pm@example.com`      | `PmPassword123`      |
| **Advisor**         | `advisor@example.com` | `AdvisorPassword123` |
| **Donor**           | `donor@example.com`   | `DonorPassword123`   |

All users authenticate via:

```
POST /auth/login
```

Example:

```json
{
  "email": "admin@example.com",
  "password": "AdminPassword123"
}
```

---

## 8. Authentication Flow (JWT)

### 8.1 Login

```
POST /auth/login
```

Response:

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer"
}
```

- Tokens are **temporary**
- Tokens are **not stored** in the database
- Tokens are **generated on every login**
- Tokens are **stored by the frontend automatically**

---

### 8.2 Current user

```
GET /auth/me
Authorization: Bearer <token>
```

Returns user identity and roles.

---

## 9. User Management (Admin Only)

### 9.1 Create users

```
POST /users
Authorization: Bearer <admin_token>
```

```json
{
  "email": "new.user@example.com",
  "password": "StrongPassword123",
  "full_name": "New User",
  "roles": ["advisor"]
}
```

Supported roles:

- `admin`
- `program_manager`
- `advisor`
- `donor`

---

### 9.2 Assign country scope

Program Managers and Advisors **must** be scoped to a country:

```sql
INSERT INTO auth_scope (user_id, country_code)
VALUES ('<user_uuid>', 'RW');
```

Without scope:

- Requests return **403 Out of scope**

---

## 10. Role & Scope Enforcement

### Roles

| Role            | Access                                         |
| --------------- | ---------------------------------------------- |
| Admin           | Full access                                    |
| Program Manager | Portfolio, Scenarios, Models, Reports (scoped) |
| Advisor         | Advisory, Portfolio (scoped)                   |
| Donor           | Reports only                                   |

### Scope example

```
GET /data/kpis/country_code=RW
```

- Allowed only if user is scoped to `RW`
- Otherwise returns **403 Out of scope**

Backend enforcement **cannot be bypassed** by frontend navigation.

---

## 11.

---

## 12. Verify Users (Debugging)

```sql
SELECT email FROM auth_user;
```

Expected output:

```
admin@example.com
pm@example.com
advisor@example.com
donor@example.com
```

---

## 13. Summary

This backend guarantees:

- Secure authentication
- Backend-enforced RBAC
- Country-level data protection
- Admin-controlled user lifecycle
- Frontend-independent authorization

This setup is **production-grade by design**, even when running with demo data.

---

## 14. Executive Dashboard Contract Checks

Run these smoke checks after backend updates:

```bash
curl -H "Authorization: Bearer <token>" http://127.0.0.1:8000/portfolio/overview
curl -H "Authorization: Bearer <token>" "http://127.0.0.1:8000/portfolio/trends?months=12"
curl -H "Authorization: Bearer <token>" http://127.0.0.1:8000/portfolio/country-comparison
curl -H "Authorization: Bearer <token>" "http://127.0.0.1:8000/portfolio/sector-risk-summary?limit=12"
curl -H "Authorization: Bearer <token>" http://127.0.0.1:8000/portfolio/anomaly-signals
```

```

```
