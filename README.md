# Nexcore

**Consultant operations, utilization, and billing workspace.**

Nexcore helps consulting teams manage consultant capacity, client work, time entry, approvals, retainers, and operational reporting from one organization-scoped application.

> Nexcore is an actively developed product. Deployment configuration is included, but a successful build or local walkthrough does not by itself establish production readiness. Review the current security, database, and runtime limitations before deployment.

## Product

- **Overview and utilization:** Review capacity, billable and non-billable hours, and supported utilization measures.
- **Consultants:** Manage consultant profiles and inspect their own history where role policy allows.
- **Time and approvals:** Capture and submit time entries, review them, and retain approval history.
- **Clients, projects, and retainers:** Maintain client and project records and track retainer usage returned by backend procedures.
- **Reports and alerts:** Download supported CSV reports and review authoritative retainer alerts.

Financial data is permission-gated in backend responses. Admin and Finance roles may access authorized financial metrics; Managers and Consultants do not receive those financial values. Consultants can access only their own time entries. Their time-entry form offers client/project pairs found in their own entry history; organization-wide directory access remains restricted.

## Technology

| Layer | Stack |
| --- | --- |
| Frontend | Next.js 16, React 19, TypeScript, tRPC React Query |
| Backend | Node.js, Express, tRPC, TypeScript |
| Data | MongoDB |
| Hosting configuration | Render Blueprint (`render.yaml`) |

The frontend and backend live in a pnpm workspace. The backend owns authentication, authorization, organization scoping, validation, and business calculations.

## Run locally

### Requirements

- Node.js 20 or later
- Corepack with the repository-pinned pnpm version
- A local MongoDB server or a dedicated non-production MongoDB database

### Install and configure

```bash
corepack enable
pnpm install
```

Copy `backend/.env.example` to `backend/.env`. Set a local database and a private session secret:

```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB_NAME=nexcore_local
SESSION_SECRET=<a private random value of at least 32 characters>
COOKIE_SECURE=false
COOKIE_SAME_SITE=lax
```

Keep `.env` files and real credentials out of Git. Use a database dedicated to local development; never point local seeders or tests at production.

### Start the services

Run each command in its own terminal from the repository root:

```bash
pnpm dev:backend
```

```bash
pnpm dev:frontend
```

The frontend runs at <http://localhost:3000> and proxies `/api/*` to `http://localhost:5000` by default. Set `BACKEND_URL` in the frontend process when the API runs elsewhere. The backend health endpoint is <http://localhost:5000/api/health>.

Create an initial Admin through the application’s setup flow. An Admin can then provision additional organization users and assign roles.

## Seed data

Seeders write to the database selected by the backend environment variables. Use them only with a disposable local database and review their target behavior before running them.

```bash
pnpm --filter nexcore-backend db:indexes
pnpm --filter nexcore-backend db:seed-orgs
```

The organization seeder prints temporary test credentials to its terminal. Keep that output private and remove the seeded accounts after testing. The optional Nexcore demo seeder targets the organization with slug `nexcore`; it requires `NEXCORE_DEMO_PASSWORD` to be set and must not be run against production.

## Quality checks

```bash
pnpm check:frontend
pnpm check:backend
pnpm build:frontend
pnpm build:backend
```

Backend integration tests create and remove records. Run them against a disposable database, never a production database. For example, in PowerShell:

```powershell
$env:MONGODB_URI = "mongodb://127.0.0.1:27017"
$env:MONGODB_DB_NAME = "nexcore_test_$([guid]::NewGuid().ToString('N'))"
pnpm --filter nexcore-backend test
```

Frontend unit tests are not currently exposed as a package script. Run the TypeScript check and production build separately; the Next.js production build is configured to skip its own TypeScript validation.

## Roles and data boundaries

| Role | Typical access |
| --- | --- |
| Admin | Organization operations, user management, approvals, and authorized financial metrics |
| Manager | Consultant and delivery operations, approvals, and non-financial utilization |
| Finance | Authorized financial reporting and client/project reference data |
| Consultant | Own consultant profile, own time entries, submission, and own-history client/project choices |

The backend remains authoritative for every permission check. Cross-organization isolation is applied to organization-owned records. See [backend/README.md](backend/README.md) for backend setup and test-database details.

## Current boundaries

- CSV reports are assembled in the browser from authorized API data; there is no backend CSV export endpoint.
- Alerts are limited to the retainer conditions returned by the existing backend procedures. Unsupported reminders and capacity alerts are not fabricated.
- Nexcore provides estimated billing and retainer usage, not invoice generation or payment processing.
- Multi-document approval-history atomicity depends on MongoDB replica-set transactions. Standalone development MongoDB uses the configured fallback behavior.
- Password-reset email delivery requires a configured email provider and verified sender.

## Deployment

Render service configuration is provided in [`render.yaml`](render.yaml). Set production MongoDB credentials, a strong session secret, secure cookie settings, and the correct frontend/backend URLs in the hosting environment. Do not run seeders against production. Read [DEPLOYMENT.md](DEPLOYMENT.md) and [TROUBLESHOOTING.md](TROUBLESHOOTING.md) before deployment.

## License

MIT. See [LICENSE](LICENSE).
