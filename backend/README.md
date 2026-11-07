# Nexcore — Backend API Service

This is the Node.js, Express, tRPC, and MongoDB backend API service for the Nexcore Consultant Utilization & Billing Dashboard.

## Features
- **tRPC API Router**: Strongly-typed procedures for consultants, clients, projects, time entries, and authentication.
- **MongoDB Database**: Persistent models for users, consultants, clients, projects, time tracking, and audit logs.
- **Role-Based Authorization**: Fine-grained permissions (Admin, Manager, Finance, Consultant).
- **CORS Enabled**: Configured to serve frontend requests on port 3000 or custom origins.

## Getting Started

1. Install dependencies:
   ```bash
   pnpm install # or npm install
   ```

2. Configure environment:
   ```bash
   cp .env.example .env
   ```
   Set your `MONGODB_URI` and optional `PORT` (default is 5000).

3. Create database indexes:
   ```bash
   pnpm db:indexes # or npm run db:indexes
   ```

4. Start development server:
   ```bash
   pnpm dev # or npm run dev
   ```

5. The API server will be available at [http://localhost:5000](http://localhost:5000).

## Scripts
- `npm run dev`: Starts the backend server with live reload via `tsx watch`.
- `npm run build`: Bundles the backend using `esbuild`.
- `npm run start`: Runs the built server from `dist/index.js`.
- `npm run check`: Type-checks the backend using TypeScript.
- `npm run test`: Runs test suite using Vitest.
- `npm run db:indexes`: Creates and verifies MongoDB database indexes.
- `npm run db:seed-nexcore-demo`: Adds idempotent demo data to the existing `nexcore` organization.

### Backend test database

The full Vitest suite includes integration tests that create and delete test records. Some tests also delete records with `ACC-` prefixes. Always point tests at a dedicated, disposable MongoDB database. Never use production credentials or a production database for tests.

With a local MongoDB server running on the default port, run from PowerShell at the repository root:

```powershell
$env:MONGODB_URI = "mongodb://127.0.0.1:27017"
$env:MONGODB_DB_NAME = "nexcore_test_$([guid]::NewGuid().ToString('N'))"
npm --prefix backend test
```

The unique database name prevents integration tests from sharing application data. Keep both variables set in the same shell when running focused suites, for example:

```powershell
npm --prefix backend test -- src/authorization.test.ts src/financialAccess.test.ts src/consultantSerializer.test.ts
```

Unit-only suites that do not access MongoDB can run without a database. Integration suites require a reachable MongoDB server and fail when `MONGODB_URI` is absent or unreachable. Do not treat skipped tests as passing.

### Local demonstration

Configure `backend/.env` from `.env.example` with a local/disposable `MONGODB_URI`, an isolated `MONGODB_DB_NAME`, and `PORT` (default `5000`). For local authentication, set a private `SESSION_SECRET`; production requires a secure session secret. Keep credentials out of source control.

Start the services in separate terminals from the repository root:

```powershell
npm run dev:backend
npm run dev:frontend
```

The frontend defaults its `/api/*` rewrite to `http://localhost:5000`; set `BACKEND_URL` if the backend runs elsewhere. The frontend listens on port `3000`.

Create an Admin through the organization registration flow, then create additional users with Admin role management. For disposable local demonstrations, the `db:seed-orgs` script creates sample organizations with Admin, Manager, Finance, and Consultant roles; it writes to the database named by the environment variables and prints temporary credentials to its terminal. Use it only with an isolated local database, and rotate/remove those users after the demo. The `db:seed` and `db:seed-nexcore-demo` scripts also write records and should only be used with an isolated demo database after reviewing their target organization behavior.

Database-backed workflows remain unverified until the local integration suite completes successfully.

### NEXCORE demo data

Run `npm run db:seed-nexcore-demo` only from a trusted environment with the target
MongoDB environment variables configured and `NEXCORE_DEMO_PASSWORD` set to a
private value of at least 16 characters. The command never deletes records and
skips itself when the `nexcore-demo-v1` marker already exists. It creates demo
users, consultants, clients, projects, time entries, retainers, a pending join
request, and an admin notification. Do not run it against a production database.
