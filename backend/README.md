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
