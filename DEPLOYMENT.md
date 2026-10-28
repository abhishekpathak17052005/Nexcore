# NEXOR — Production Deployment & Operational Runbook

**Version:** 1.0.0 (Authentication, Public Landing Page & RBAC Hardening)  
**System:** NEXOR — Consultant Capacity, Time Tracking & Billing Analytics Platform

---

## 1. System Architecture Overview

NEXOR is an enterprise-grade capacity planning, time tracking, and estimated billing platform designed for high-performance consulting organizations:

1. **Frontend Service (`/frontend`)**:
   - Next.js 16 App Router with Turbopack, React 19, TypeScript, and Tailwind CSS.
   - Public Landing Page with enterprise deep-navy aesthetic, capability showcases, and interactive Sign In / Bootstrap Admin modal.
   - Client-side routing powered by Wouter with tRPC React Query client.
   - Role-aware navigation gating and protected route barriers preventing unauthorized access or data exposure.

2. **Backend API Service (`/backend`)**:
   - Node.js & Express.js HTTP API server with `@trpc/server/adapters/express`.
   - Standalone email/password authentication using NIST-grade `node:crypto` scrypt password hashing with random 16-byte salt and constant-time verification.
   - Session management powered by `jose` HS256 JWT in HttpOnly cookies with configurable `SameSite` and `Secure` attributes.
   - In-memory login rate limiter (max 5 failed attempts per IP/email within 5 minutes) with generic failure messages to prevent enumeration.
   - Server-enforced role-based access control (RBAC) across five roles: **Admin**, **Manager**, **Finance**, **Consultant**, and **Unassigned**.
   - Direct persistence using official MongoDB Node.js Driver v7 with replica set multi-document ACID transactions and standalone compensating rollback fallback.
   - Comprehensive `/api/health` readiness probe reporting DB latency, topology, uptime, and memory usage.

---

## 2. Role-Based Access Control (RBAC) Matrix

| Permission Key | Admin | Manager | Finance | Consultant | Unassigned (`user`) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `consultants.read` | ✅ Full | ✅ Full | ✅ Full | 🔒 Self Only | ❌ |
| `consultants.manage` | ✅ Full | ✅ Full | ❌ | ❌ | ❌ |
| `clients.read` | ✅ Full | ✅ Full | ✅ Full | ❌ | ❌ |
| `clients.manage` | ✅ Full | ✅ Full | ✅ Full | ❌ | ❌ |
| `projects.read` | ✅ Full | ✅ Full | ✅ Full | ❌ | ❌ |
| `projects.manage` | ✅ Full | ✅ Full | ✅ Full | ❌ | ❌ |
| `time.read` | ✅ Full | ✅ Full | ✅ Full | 🔒 Self Only | ❌ |
| `time.write` (Draft/Edit) | ✅ Full | ✅ Full | ❌ | 🔒 Self Only | ❌ |
| `time.submit` | ✅ Full | ✅ Full | ❌ | 🔒 Self Only | ❌ |
| `time.approve` / `reject` | ✅ Full | 🔒 Non-Self Only | ❌ | ❌ | ❌ |
| `metrics.utilization` | ✅ Full | ✅ Full | ✅ Full | 🔒 Self Only | ❌ |
| `metrics.financial` (Revenue) | ✅ Full | ❌ | ✅ Full | ❌ | ❌ |
| `users.manage` | ✅ Full | ❌ | ❌ | ❌ | ❌ |

### Key Authorization Rules Enforced on Server:
1. **Self-Approval Block**: Reviewers cannot approve or reject time entries they personally created.
2. **Consultant Scope Binding**: Consultants can only create, view, or modify entries mapped to their authenticated `consultantId`. URL/parameter tampering cannot access other practitioners' records.
3. **Revenue Privacy**: Revenue analytics and historical billing rates are restricted strictly to **Admin** and **Finance** roles.
4. **Anti-Lockout Protection**: Administrators cannot change their own role or disable their own account.
5. **Disabled Account Invalidation**: Accounts marked with `status: "disabled"` are immediately rejected on login and have existing sessions invalidated.

---

## 3. Account Provisioning & First-Admin Bootstrap

1. **First-Administrator Setup**:
   - When deploying to a clean database with zero administrative users, visiting `/` or `/landing` enables the **"Bootstrap Admin"** action.
   - Invoking `auth.setupAdmin` creates the initial administrator account and issues an authenticated session.
   - Once an administrator exists, `auth.canSetupAdmin` permanently returns `false` and subsequent calls to `setupAdmin` are rejected with `403 Forbidden`.
2. **Standard Account Creation**:
   - Public user self-registration as privileged roles (Admin, Manager, Finance) is strictly blocked.
   - Authenticated Administrators provision accounts via the **Workspace Settings** (`/settings`) panel or the `users.create` procedure with initial name, email, password, role, and consultant record assignment.

---

## 4. Infrastructure & Environment Configuration

### Backend Environment Variables (`backend/.env`)

| Variable | Required in Prod | Description | Default / Example |
| :--- | :---: | :--- | :--- |
| `NODE_ENV` | **Yes** | Operating environment | `production` |
| `PORT` | No | HTTP listening port | `5000` |
| `MONGODB_URI` | **Yes** | MongoDB connection string (Atlas replica set) | `mongodb+srv://user:pass@cluster.mongodb.net/?retryWrites=true&w=majority` |
| `MONGODB_DB_NAME` | No | Database name | `consultant_utilization_dashboard` |
| `SESSION_SECRET` | **Yes** | Cryptographic session signing secret (min 32 chars) | `openssl rand -hex 32` |
| `APP_ID` | No | Application identifier token claim | `nexor-app` |
| `COOKIE_SAME_SITE` | No | CSRF cookie policy (`lax`, `strict`, `none`) | `lax` |
| `COOKIE_SECURE` | No | Transmit cookies over HTTPS only | `true` |
| `REQUIRE_REPLICA_SET_TRANSACTIONS` | **Yes** | Enforce native transactions for approvals | `true` |
| `ALLOW_STANDALONE_IN_PROD` | No | Unsafe bypass for single-node prod | `false` |

### Frontend Environment Variables (`frontend/.env`)

| Variable | Required in Prod | Description | Example |
| :--- | :---: | :--- | :--- |
| `NODE_ENV` | **Yes** | Environment mode | `production` |
| `PORT` | No | Next.js server port | `3000` |

---

## 5. Deployment & Execution Commands

### Local Development:
```bash
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Frontend
cd frontend
npm run dev
```

### Production Build & Run:
```bash
# 1. Run automated test suites (78 tests)
npm test

# 2. Typecheck frontend & backend
npm run check:backend
npm run check:frontend

# 3. Compile production bundles
npm run build:backend
npm run build:frontend

# 4. Launch services
cd backend && npm start
cd frontend && npm start
```

---

## 6. Known Limitations & Architectural Disclosures

Before deploying, ensure stakeholders are aligned on current capabilities and documented roadmap items:

| Capability | Current Status | Description |
| :--- | :---: | :--- |
| **Authentication & RBAC** | **Fully Operational** | Scrypt password hashing, session cookies, rate limiting, and server-enforced role permissions. |
| **Capacity & Utilization** | **Fully Operational** | Period-aware business-day capacity calculations, zero-capacity guardrails, utilization tiers. |
| **Time Tracking & Approval** | **Fully Operational** | Full draft, submitted, approved, and rejected workflow with optimistic locking and durable audit history. |
| **Estimated Billing Analytics** | **Fully Operational** | Historical rate snapshots, currency-segregated revenue (`USD`, `EUR`, `GBP`), role financial scrubbing. |
| **Alert Dismissal** | **Known Limitation** | Alert dismissal is client-side state and resets on full browser refresh. |
| **Retainer Contracts** | **Known Limitation** | Contractual retainer hour drawdown and prepaid fee reconciliation are not modeled as a complete contract ledger. |
| **Invoicing & Payments** | **Known Limitation** | Platform calculates estimated billing revenue; formal invoice generation and payment processing require external accounting ERP integration. |
| **Password Recovery** | **Prerequisite** | Self-service email password recovery requires an integrated SMTP/SES service provider and is documented as a deployment prerequisite. |
