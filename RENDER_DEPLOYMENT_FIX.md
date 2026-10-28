# Render Deployment Fix: "Publish directory out does not exist"

## Problem
Your frontend deployment on Render is failing with:
```
==> Publish directory out does not exist!
==> Build failed 😞
```

## Root Cause
The error indicates Render is treating your Next.js application as a **Static Site** instead of a **Web Service**. Static sites look for an `out` directory (from `next export`), but you're building a standard Next.js server application which uses the `.next` directory.

## Solution

### Option 1: Delete and Recreate (Recommended)
1. Go to your Render dashboard
2. Find the `nexcore-frontend` service
3. **Delete it completely**
4. Go to your repository settings on Render
5. Click "New +" → "Web Service" (NOT Static Site)
6. Connect your GitHub repository
7. Render should auto-detect `render.yaml` and use these settings:
   - **Service Type:** Web Service
   - **Root Directory:** `frontend`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Environment Variables:** Set from render.yaml

### Option 2: Check Existing Service Type
If you want to keep the existing service:

1. Go to your `nexcore-frontend` service in Render
2. Check the service type at the top of the page
3. If it says "Static Site", you MUST delete and recreate as a Web Service (Option 1)
4. If it says "Web Service", check the settings:
   - Remove any "Publish Directory" setting (this field shouldn't exist for Web Services)
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`
   - Root Directory: `frontend`

### Option 3: Deploy via render.yaml (Blueprint)
1. Ensure your code is pushed to GitHub with the updated `render.yaml`
2. In Render dashboard, go to "Blueprints"
3. Click "New Blueprint Instance"
4. Connect your repository
5. Render will read `render.yaml` and create both services correctly

## Verification
After redeployment, you should see:
- ✅ Build completes successfully
- ✅ Service starts with `npm start`
- ✅ Health check at `/` returns 200 OK
- ✅ Frontend accessible at your Render URL

## Updated Files
- ✅ `render.yaml` - Added health check, simplified build command
- ✅ `frontend/.npmrc` - Added to prevent npm engine conflicts
- ✅ `DEPLOYMENT.md` - Added Render deployment section

## Important Notes
- **Do NOT use Static Site** for Next.js unless you're using `output: 'export'`
- Next.js server apps need `npm start` to run the Node.js server
- Static Sites don't support API routes, rewrites, or server-side rendering
- Your app uses Next.js rewrites for `/api/*` proxy, which requires a server

## Security Notes (Separate Issue)
The build also shows:
```
6 low severity vulnerabilities
```

To check these:
```bash
cd frontend
npm audit
```

To fix (only if safe):
```bash
npm audit fix
```

**Do NOT run** `npm audit fix --force` without reviewing changes, as it can introduce breaking changes.
