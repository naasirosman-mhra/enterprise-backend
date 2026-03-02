# Inventora — Backend API

[![CI](https://github.com/naasirosman-mhra/enterprise-backend/actions/workflows/ci.yml/badge.svg)](https://github.com/naasirosman-mhra/enterprise-backend/actions/workflows/ci.yml)

REST API for the **Inventora** inventory management system. Handles authentication, inventory CRUD, stock audit logging, profile management, and dashboard statistics.

---

## Architecture

```mermaid
flowchart LR
    Browser["React SPA\n(Vite + Tailwind CSS)"]
    API["Express REST API\n(Node.js 20 · ESM)"]
    DB[("PostgreSQL 16\nvia Prisma ORM")]
    SG["SendGrid\n(Password Reset Emails)"]
    CL["Cloudinary\n(Profile Image Storage)"]

    Browser -->|"JWT Bearer / HTTPS"| API
    API <-->|"Prisma queries"| DB
    API -->|"Reset link email"| SG
    API -->|"Image upload stream"| CL
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 (ESM — `"type": "module"`) |
| Framework | Express 5 |
| Database | PostgreSQL 16 |
| ORM | Prisma 6 |
| Auth | JSON Web Tokens (`jsonwebtoken`) |
| Password hashing | bcryptjs (cost factor 12) |
| Image storage | Cloudinary SDK v2 |
| Email | SendGrid (`@sendgrid/mail`) |
| File upload | Multer (memory storage) |
| Validation | express-validator |
| Rate limiting | express-rate-limit |
| Security headers | Helmet |
| Logging | Morgan |
| Testing | Jest 29 + Supertest |

---

## Prerequisites

- **Node.js** ≥ 20
- **PostgreSQL 16** running locally (`brew install postgresql@16` on macOS)
- A free **Cloudinary** account — [cloudinary.com](https://cloudinary.com)
- A **SendGrid** account with a verified sender address — [sendgrid.com](https://sendgrid.com)

---

## Local Setup

```bash
# 1. Clone and install
git clone https://github.com/naasirosman-mhra/enterprise-backend.git
cd enterprise-backend
npm install

# 2. Create and configure environment file
cp .env.example .env
# Edit .env — fill in every variable (see table below)

# 3. Create the local database
createdb inventory_db

# 4. Run migrations and generate the Prisma client
npx prisma migrate dev

# 5. Start the development server
npm run dev   # http://localhost:3000
```

**Prisma Studio** — visual database browser:

```bash
npx prisma studio   # opens at http://localhost:5555
```

---

## Environment Variables

Create `.env` by copying `.env.example` and filling in every value.

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/inventory_db` |
| `JWT_SECRET` | Secret for signing access tokens — min. 32 chars | `a_very_long_random_string_here` |
| `JWT_REFRESH_SECRET` | Secret for signing refresh tokens — must differ from `JWT_SECRET` | `another_long_random_string_here` |
| `PORT` | Port the HTTP server binds to | `3000` |
| `CLOUDINARY_CLOUD_NAME` | Your Cloudinary cloud name | `my_cloud_name` |
| `CLOUDINARY_API_KEY` | Cloudinary API key | `123456789012345` |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret | `abc123xyz...` |
| `SENDGRID_API_KEY` | SendGrid API key — must start with `SG.` | `SG.xxxxxxxxxxxx` |
| `SENDGRID_FROM_EMAIL` | Verified sender address in your SendGrid account | `no-reply@yourdomain.com` |
| `FRONTEND_URL` | Frontend origin — embedded in password reset email links | `https://inventora.onrender.com` |

---

## API Reference

### Response envelope

All endpoints return JSON in this shape:

```json
{
  "success": true,
  "message": "Human-readable description",
  "data": {},
  "errors": []
}
```

Validation failures return HTTP `422`:

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [{ "field": "email", "message": "Enter a valid email" }]
}
```

---

### Health check

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | — | Returns `{ status: "ok", timestamp }` |

---

### Authentication — `/api/auth`

> `/register`, `/login`, `/refresh`, `/forgot-password`, and `/reset-password` are rate-limited to **20 requests per IP per 15 minutes**.

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | No | Register a new user. Returns user object + access/refresh token pair. |
| `POST` | `/api/auth/login` | No | Login with email + password. Returns user object + token pair. |
| `POST` | `/api/auth/refresh` | No | Rotate the token pair. Body: `{ "refreshToken": "..." }`. |
| `POST` | `/api/auth/logout` | Yes | Logout the authenticated user (client is responsible for discarding tokens). |
| `GET` | `/api/auth/profile` | Yes | Fetch the current user's profile. |
| `PUT` | `/api/auth/profile` | Yes | Update `firstName`, `lastName`, and/or `email`. |
| `POST` | `/api/auth/profile/image` | Yes | Upload a profile photo (`multipart/form-data`, field name `image`, max 5 MB). Stored on Cloudinary. |
| `POST` | `/api/auth/forgot-password` | No | Send a password reset email. Always returns `200` to prevent email enumeration. |
| `POST` | `/api/auth/reset-password` | No | Reset password using the one-time token from the email. Token expires after 1 hour. |

**Token lifetimes:** access token **15 minutes** · refresh token **7 days**.

---

### Inventory — `/api/inventory`

All routes require a valid `Authorization: Bearer <token>` header.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/inventory` | List items — paginated, filterable, and searchable (see query params below). |
| `GET` | `/api/inventory/:id` | Get a single inventory item by ID. |
| `POST` | `/api/inventory` | Create a new inventory item. |
| `PUT` | `/api/inventory/:id` | Update an item. Automatically writes a `StockAuditLog` entry when `quantity` changes. |
| `DELETE` | `/api/inventory/:id` | Delete an item. Only the original creator or an `ADMIN` user may delete. |

**Query parameters for `GET /api/inventory`:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | integer | `1` | Page number |
| `limit` | integer | `20` | Items per page (max 100) |
| `search` | string | — | Case-insensitive match against `name` and `sku` |
| `categoryId` | UUID | — | Filter to a single category |
| `sortBy` | string | `createdAt` | One of: `name`, `sku`, `quantity`, `createdAt`, `updatedAt` |
| `sortOrder` | string | `desc` | `asc` or `desc` |

**Request body for `POST /api/inventory`:**

```json
{
  "name": "Laptop Stand",
  "sku": "LS-001",
  "quantity": 50,
  "lowStockThreshold": 10,
  "categoryId": "<uuid>",
  "description": "Adjustable aluminium stand"
}
```

`PUT` supports partial updates — only fields present in the body are written. Include `changeReason` (string) to annotate a quantity change in the audit log.

---

### Categories — `/api/categories`

All routes require a valid `Authorization: Bearer <token>` header.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/categories` | List all categories sorted by name. Supports `?search=` for name filtering. |
| `GET` | `/api/categories/:id` | Get a category plus all its linked inventory items. |
| `POST` | `/api/categories` | Create a category. Names must be globally unique. |
| `PUT` | `/api/categories/:id` | Update a category name or description. Creator or `ADMIN` only. |
| `DELETE` | `/api/categories/:id` | Delete a category. Returns `400` if any inventory items are still linked. Creator or `ADMIN` only. |

---

### Dashboard — `/api/dashboard`

Requires a valid `Authorization: Bearer <token>` header.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/dashboard/stats` | Returns `totalItems`, `totalCategories`, `outOfStockCount`, `lowStockCount`, and a `lowStockItems` array (up to 10 items, sorted by quantity ascending). |

---

### Audit Log — `/api/audit-log`

Requires a valid `Authorization: Bearer <token>` header.
Regular users (`USER` role) see only their own entries. `ADMIN` users see all entries.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/audit-log` | Paginated stock change history. |

**Query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `page` | integer | Page number (default `1`) |
| `limit` | integer | Entries per page (default `20`, max `100`) |
| `itemId` | UUID | Filter by inventory item |
| `userId` | UUID | Filter by user — admin only |
| `fromDate` | ISO date string | Earliest change date (inclusive) |
| `toDate` | ISO date string | Latest change date (inclusive, rounded to end-of-day) |

---

## Testing

```bash
npm test
```

Tests run against a dedicated `inventory_db_test` PostgreSQL database. The global setup script creates the database and applies the schema automatically on first run.

```
Test Suites: 2 passed
Tests:       27 passed
  auth.test.js       — register, login, duplicate email, password validation,
                       protected routes, token refresh (11 tests)
  inventory.test.js  — CRUD, duplicate SKU, negative quantity, audit log creation,
                       pagination, category filter, search, RBAC delete,
                       category delete with linked items, dashboard stats (16 tests)
```

The test script uses `--runInBand` to run suites sequentially and avoid parallel database conflicts.

---

## Deployment

The API is deployed as a **Render Web Service** configured via `render.yaml`.

| Setting | Value |
|---|---|
| Build command | `npm install && npm run build` |
| Start command | `npm start` |
| `npm run build` | `prisma generate && prisma migrate deploy` |

Set the following in the Render dashboard (*Environment* tab — all are marked `sync: false` in `render.yaml` so they are never committed):

`FRONTEND_URL` · `SENDGRID_API_KEY` · `SENDGRID_FROM_EMAIL` · `CLOUDINARY_CLOUD_NAME` · `CLOUDINARY_API_KEY` · `CLOUDINARY_API_SECRET`

`DATABASE_URL`, `JWT_SECRET`, and `JWT_REFRESH_SECRET` are provisioned or auto-generated by Render.

---

## Key Technical Decisions

### JWT with refresh token rotation

A short-lived access token (15 min) limits the exposure window if a token is intercepted. Refresh tokens (7 days) are rotated on every use — each call to `/api/auth/refresh` issues a completely new pair, so a stolen refresh token becomes invalid after a single redemption. The API stays stateless with no server-side session store, making horizontal scaling straightforward.

### Prisma as the ORM

Prisma's schema-first workflow defines the entire data model in one `.prisma` file and auto-generates a type-safe query client. The migration system produces versioned SQL files that are reviewed by the developer and applied automatically on deployment via `prisma migrate deploy`. For the single query that requires a column-to-column comparison (items where `quantity <= lowStockThreshold`), raw SQL was used through `prisma.$queryRaw` — Prisma does not yet support this in its fluent API.

### Cloudinary for profile image storage

Images are received via Multer (in-memory buffer, 5 MB limit, MIME type check) and streamed directly to Cloudinary using `upload_stream`. This avoids storing binary data in PostgreSQL, keeps row sizes small, and delegates CDN delivery and format optimisation to Cloudinary's infrastructure. The resulting `secure_url` is stored on the `User` record.

### SendGrid for transactional email

Password reset tokens are generated with `crypto.randomBytes(32)` and stored in a `PasswordResetToken` table with a 1-hour expiry. Any existing unused tokens for the user are invalidated before issuing a new one. The endpoint always returns the same `200` response whether or not the email address is registered, preventing email enumeration. SendGrid provides reliable deliverability and simple API-key authentication.

### Immutable stock audit log

Every quantity change is recorded as an immutable `StockAuditLog` row within the same `prisma.$transaction` as the item update — if either operation fails, both are rolled back. Logs store `previousQuantity`, `newQuantity`, `changeReason`, the acting `userId`, and a timestamp. This gives a full, tamper-evident history of every stock movement and supports traceability requirements in inventory systems.

### Role-based access control (RBAC)

Two roles — `USER` and `ADMIN`. Regular users may only edit or delete resources they created; admins have unrestricted write access and can see all audit log entries. The role is embedded in the JWT payload, so the middleware can enforce permissions at the controller level without an additional database round-trip on every request.

---

## AI Usage

This project was developed with the assistance of **Claude** (Anthropic) as a programming assistant. Claude was used to accelerate development tasks including scaffolding route handlers, debugging test failures, and writing this documentation. All generated code was reviewed, understood, and tested by the developer before being committed. Architectural decisions were made by the developer.
