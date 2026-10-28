# Deployment Fix Summary

## Problem
Your deployed frontend at `nexcore-frontend.onrender.com` shows this error when trying to sign in:
```
Unexpected token '<', "<!DOCTYPE"... is not valid JSON
```

## Root Cause
The frontend cannot communicate with the backend API because:
1. Environment variables weren't using the `NEXT_PUBLIC_` prefix (required for runtime access in Next.js)
2. CORS settings on the backend don't include the frontend URL

## What I Fixed

### 1. Updated `frontend/next.config.ts`
Changed the rewrites configuration to use `NEXT_PUBLIC_BACKEND_URL` which is available at runtime:

```typescript
async rewrites() {
  const backendUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";
  
  return [
    {
      source: "/api/:path*",
      destination: `${backendUrl}/api/:path*`,
    },
  ];
}
```

### 2. Updated `render.yaml`
Changed the frontend environment variable from `NEXT_PUBLIC_API_URL` to `NEXT_PUBLIC_BACKEND_URL`:

```yaml
envVars:
  - key: BACKEND_URL
    value: "https://nexcore-backend-z808.onrender.com"
  - key: NEXT_PUBLIC_BACKEND_URL
    value: "https://nexcore-backend-z808.onrender.com"
```

### 3. Updated Backend CORS Settings
Added the frontend URL to allowed origins:

```yaml
- key: CORS_ALLOWED_ORIGINS
  value: "https://nexcore-frontend.onrender.com,https://nexcore-backend-z808.onrender.com,http://localhost:3000,http://localhost:5000"
```

**⚠️ IMPORTANT:** Replace `nexcore-frontend.onrender.com` with your actual frontend URL!

### 4. Updated `.env.production.example`
Changed to use the correct environment variable name:
```
NEXT_PUBLIC_BACKEND_URL=https://nexcore-backend-z808.onrender.com
```

### 5. Created Documentation
- `TROUBLESHOOTING.md` - Comprehensive guide for fixing deployment issues
- `DEPLOYMENT_FIX_SUMMARY.md` - This file

## What You Need to Do Now

### Step 1: Update Frontend URL in Backend CORS
1. Look at your browser address bar - what's the actual frontend URL?
2. Go to Render Dashboard → nexcore-backend → Environment
3. Find `CORS_ALLOWED_ORIGINS` and update it to include your frontend URL
4. Backend will automatically redeploy

### Step 2: Update Frontend Environment Variables
1. Go to Render Dashboard → nexcore-frontend → Environment
2. Make sure you have:
   - `BACKEND_URL` = `https://nexcore-backend-z808.onrender.com`
   - `NEXT_PUBLIC_BACKEND_URL` = `https://nexcore-backend-z808.onrender.com`
3. If you added/changed them, click "Save Changes"

### Step 3: Redeploy Frontend
1. Commit and push these code changes to GitHub:
   ```bash
   git add .
   git commit -m "Fix: Add NEXT_PUBLIC_BACKEND_URL for production API access"
   git push
   ```
2. Render will automatically deploy the changes

### Step 4: Verify the Fix
After both services redeploy:
1. Visit your frontend URL
2. Try to sign in
3. The error should be gone

## How to Verify Backend is Accessible

Before testing sign-in, check:
```
https://nexcore-backend-z808.onrender.com/api/health
```

You should see something like:
```json
{
  "status": "ok",
  "timestamp": "2024-...",
  "uptime": 123.45
}
```

If this doesn't work, your backend has issues.

## Understanding Next.js Environment Variables

In Next.js:
- `BACKEND_URL` - Available only during **build time** and on the **server**
- `NEXT_PUBLIC_BACKEND_URL` - Available at **runtime** in the **browser**

Your Next.js rewrites run on the server, but they need runtime access to environment variables. Using `NEXT_PUBLIC_` prefix makes them available both at build and runtime.

## Still Having Issues?

Check `TROUBLESHOOTING.md` for detailed debugging steps, or:

1. **Check Render Logs:**
   - Backend logs: Look for CORS errors or API errors
   - Frontend logs: Look for build errors

2. **Check Browser Console (F12):**
   - Console tab: JavaScript errors
   - Network tab: Failed API requests

3. **Test Locally:**
   ```bash
   # Make sure it works locally first
   cd backend && npm run dev
   cd frontend && npm run dev
   ```

## Files Changed
- ✅ `frontend/next.config.ts` - Fixed runtime env var access
- ✅ `render.yaml` - Added NEXT_PUBLIC_BACKEND_URL, updated CORS
- ✅ `frontend/.env.production.example` - Updated env var names
- ✅ `TROUBLESHOOTING.md` - Created comprehensive troubleshooting guide
- ✅ `DEPLOYMENT_FIX_SUMMARY.md` - This summary document
