# Deployment Troubleshooting Guide

## Error: "Unexpected token '<', '<!DOCTYPE'... is not valid JSON"

### Symptom
When trying to sign in on the deployed frontend, you see an error message in the sign-in modal that says:
```
Unexpected token '<', "<!DOCTYPE"... is not valid JSON
```

### Root Cause
This error occurs when:
1. The frontend makes an API request expecting JSON
2. But receives an HTML page instead (usually an error page)
3. The client tries to parse the HTML as JSON and fails

Common reasons:
- Backend is not accessible from the frontend
- CORS (Cross-Origin Resource Sharing) is blocking the request
- Environment variables for API URLs are not set correctly
- Backend service is down or not deployed

### Solution Steps

#### 1. Verify Backend is Running
Check your backend service on Render:
- Go to Render Dashboard → nexcore-backend service
- Check if the service status is "Live" (green)
- Click on the service and check recent logs
- Verify the health endpoint: `https://nexcore-backend-z808.onrender.com/api/health`

#### 2. Check Environment Variables
On Render Dashboard → nexcore-frontend → Environment:
- `BACKEND_URL` = `https://nexcore-backend-z808.onrender.com`
- `NEXT_PUBLIC_BACKEND_URL` = `https://nexcore-backend-z808.onrender.com`

Both must be set correctly. If you changed them, **redeploy** the frontend.

#### 3. Update CORS Settings
On Render Dashboard → nexcore-backend → Environment:

Find `CORS_ALLOWED_ORIGINS` and ensure it includes your frontend URL:
```
https://nexcore-frontend.onrender.com,https://nexcore-backend-z808.onrender.com,http://localhost:3000
```

**Important:** Replace `nexcore-frontend.onrender.com` with your actual frontend URL from the address bar.

After updating, the backend will automatically redeploy.

#### 4. Check Browser Console
Open browser DevTools (F12) → Console tab and look for:
- CORS errors (red text mentioning "CORS" or "Access-Control-Allow-Origin")
- 404 errors (API endpoints not found)
- Network errors (backend unreachable)

#### 5. Check Network Tab
Open browser DevTools (F12) → Network tab:
1. Try to sign in again
2. Look for the failed request (usually `/api/trpc/...`)
3. Click on it and check:
   - **Request URL**: Should show your backend URL
   - **Status Code**: 
     - `200 OK` = Working (shouldn't show error)
     - `404 Not Found` = Wrong API path
     - `500 Server Error` = Backend error
     - `Failed` or no status = CORS or network issue

### Quick Fix Checklist

- [ ] Backend service is deployed and showing "Live" status
- [ ] Backend health check returns 200 OK: `/api/health`
- [ ] Environment variable `BACKEND_URL` is set on frontend
- [ ] Environment variable `NEXT_PUBLIC_BACKEND_URL` is set on frontend
- [ ] CORS_ALLOWED_ORIGINS includes frontend URL on backend
- [ ] Frontend has been redeployed after env var changes
- [ ] Backend has been redeployed after CORS changes
- [ ] Browser cache cleared (Ctrl+Shift+Delete or Cmd+Shift+Delete)

### Testing Locally

To verify the issue is environment-specific:

```bash
# Terminal 1: Start backend
cd backend
npm run dev

# Terminal 2: Start frontend
cd frontend
npm run dev
```

Then visit `http://localhost:3000` and try signing in. If it works locally but not in production, it's an environment configuration issue.

## Other Common Deployment Issues

### Issue: "Cannot connect to MongoDB"
**Check:** 
- `MONGODB_URI` environment variable is set on backend
- MongoDB Atlas allows connections from anywhere (0.0.0.0/0) or Render's IPs
- Database user has correct permissions

### Issue: "Session Secret Not Set"
**Check:**
- `SESSION_SECRET` environment variable is set on backend
- Value is at least 32 characters long (use `openssl rand -hex 32`)

### Issue: Frontend loads but shows blank page
**Check:**
- Browser console for JavaScript errors
- All environment variables are set
- Build completed successfully (check Render logs)

### Issue: Build succeeds but service won't start
**Check:**
- Start command is `npm start` (not `npm run dev`)
- `package.json` has correct start script
- Port is not hardcoded (use `process.env.PORT || 3000`)

## Getting Help

If you're still experiencing issues:

1. **Check Render Logs:**
   - Dashboard → Your Service → Logs tab
   - Look for errors during build or runtime

2. **Check Service Status:**
   - Dashboard → Your Service → Events tab
   - Shows deployment history and failures

3. **Manual Deploy:**
   - Dashboard → Your Service → Manual Deploy
   - Select your branch and click "Deploy"
