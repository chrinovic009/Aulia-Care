# Testing & Troubleshooting Guide

## Quick Start

1. **Run setup script** (Windows: `setup-dev.bat`, macOS/Linux: `bash setup-dev.sh`)
2. **Run verification script** (Windows: `verify-setup.bat`, macOS/Linux: `bash verify-setup.sh`)
3. **Start backend**: `cd backend && npm run start:dev`
4. **Start frontend**: `npm run dev` (in another terminal)
5. **Visit**: http://localhost:5173

## Testing the Application

### Step 1: Verify Backend is Running

```bash
# In Terminal 1
cd backend
npm run start:dev
```

Expected output:
```
[Nest] 1234  - 01/01/2024, 10:00:00 AM     LOG [NestFactory] Starting Nest application...
[Nest] 1234  - 01/01/2024, 10:00:00 AM     LOG [InstanceLoader] PrismaModule dependencies initialized...
[Nest] 1234  - 01/01/2024, 10:00:00 AM     LOG [InstanceLoader] ConfigModule dependencies initialized...
...
[Nest] 1234  - 01/01/2024, 10:00:01 AM     LOG [NestApplication] Nest application successfully started
[Nest] 1234  - 01/01/2024, 10:00:01 AM     LOG Application running on http://0.0.0.0:3000
```

### Step 2: Start Frontend Development Server

```bash
# In Terminal 2
npm run dev
```

Expected output:
```
VITE v5.0.0 ready in X ms

➜  Local:   http://localhost:5173/
➜  press h to show help
```

### Step 3: Test Reception/Admission Flow

1. Open http://localhost:5173 in browser
2. Navigate to Reception → Admission (or similar route)
3. Try to search for a patient:
   - Enter a name in search field
   - Should see Network request to http://localhost:3000/public/patients/search
   - Should return empty array or matching patients
   - Should NOT show "Failed to fetch" error

4. Fill admission form:
   - Enter patient details
   - Click Submit
   - Should see Network request to http://localhost:3000/public/patients/admissions
   - Should show success message with dossier number

## Troubleshooting

### Issue 1: Backend Won't Start

**Error**: `Error: Cannot find module 'bcrypt'`

**Solution**:
```bash
cd backend
npm install
npm run start:dev
```

---

**Error**: `Port 3000 is already in use`

**Solution**:
```bash
# Find process using port 3000
# Windows:
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# macOS/Linux:
lsof -i :3000
kill -9 <PID>
```

---

**Error**: `DATABASE_URL is not defined`

**Solution**:
1. Check backend/.env exists
2. Verify DATABASE_URL is set
3. Test connection: `psql "postgresql://..."`
4. If using Neon: https://console.neon.tech

---

**Error**: `TypeScript compilation error`

**Solution**:
```bash
# Clear and reinstall
cd backend
rm -rf dist node_modules
npm install
npm run build
npm run start:dev
```

---

### Issue 2: Frontend Shows "Failed to fetch"

**Cause 1**: Backend not running

**Solution**:
```bash
# Terminal 1
cd backend
npm run start:dev
```

---

**Cause 2**: Wrong API URL in vite.config.ts

**Solution**:
1. Check vite.config.ts has `server.proxy` configuration
2. Each route (auth, patients, etc.) should proxy to `http://localhost:3000`
3. Restart frontend dev server

---

**Cause 3**: CORS error (in console)

**Solution**:
1. Check backend CORS config in main.ts
2. Should have `app.enableCors({ origin: true, credentials: true })`
3. Check backend/.env has CORS_ORIGIN variable

---

### Issue 3: Can't Find Patient

**Error**: Search returns empty but patient should exist

**Cause**: Patient not in database

**Solution**:
```bash
# Seed database with test data
cd backend
npm run db:seed

# Or check Prisma Studio
npm run prisma:studio
# Opens http://localhost:5555 (GUI database browser)
```

---

### Issue 4: Admission Submission Fails

**Network shows 400 Bad Request**

**Cause**: Invalid admission data

**Solution**:
1. Check CreateAdmissionDto in backend/src/patients/dto/create-admission.dto.ts
2. Ensure all @IsNotEmpty() fields are provided
3. Check date format (should be ISO string: YYYY-MM-DD)
4. Look at error message in response

---

**Network shows 500 Internal Server Error**

**Cause**: Backend error

**Solution**:
1. Check backend terminal for error logs
2. Look for validation or database errors
3. Check Prisma schema matches what service expects
4. Verify DATABASE_URL works

---

### Issue 5: JWT Token Issues

**Error**: `Unauthorized` on protected routes

**Cause 1**: No token in localStorage

**Solution**:
1. Verify login page works: POST to /auth/login
2. Check response contains `access_token`
3. Should see token in browser DevTools → Application → localStorage
4. Key should be `d7-clinic-auth-token` or `d7-clinic-api-token`

---

**Cause 2**: Expired token

**Solution**:
1. Clear localStorage: `localStorage.clear()`
2. Login again
3. Frontend should auto-refresh when token expires

---

**Cause 3**: Invalid JWT_SECRET

**Solution**:
1. Check JWT_SECRET in backend/.env
2. Must match between backend and frontend
3. Should be same value in both
4. Restart backend after change

---

### Issue 6: TypeScript Errors

**Error**: `Cannot find module 'axios'` or similar

**Solution**:
```bash
# Install missing dependency
npm install <module-name>
```

---

**Error**: `Property 'xyz' does not exist on type`

**Solution**:
1. Check type definitions in DTO files
2. Verify interface matches database schema
3. Check props passed to React components
4. Verify API response shape

---

## Network Debugging

### Using Browser DevTools

1. Press F12 to open DevTools
2. Go to **Network** tab
3. Reload page or trigger API call
4. Click on request to see details:
   - **Request Headers**: Should include `Authorization: Bearer <token>`
   - **Response**: Check status code and body
   - **Timing**: How long request took

### Common HTTP Status Codes

- **200**: Success
- **201**: Created (POST successful)
- **400**: Bad Request (invalid data)
- **401**: Unauthorized (missing/invalid JWT)
- **403**: Forbidden (insufficient permissions)
- **404**: Not Found (route doesn't exist)
- **500**: Server Error (backend crashed or error)

### Checking Proxy in Vite

1. DevTools → Network
2. Request URL should be `http://localhost:5173/api/endpoint`
3. Should be proxied and show as `http://localhost:3000/api/endpoint`
4. Check **Size** column: "from disk cache" means proxy worked

## Database Debugging

### View Database with Prisma Studio

```bash
cd backend
npm run prisma:studio
# Opens http://localhost:5555
```

Can browse and edit database directly:
- See all tables
- View patient records
- Check admission records
- Verify relationships

### Query Database Directly

```bash
# Connect to database
psql "<DATABASE_URL>"

# List tables
\dt

# See patient table
SELECT * FROM "Patient" LIMIT 10;

# See admissions
SELECT * FROM "Hospitalization" LIMIT 10;

# Exit
\q
```

## Performance Testing

### Measure API Response Time

1. DevTools → Network
2. Filter for XHR (XMLHttpRequest)
3. Look at **Time** column
4. Each request should be < 1 second

### Check Database Query Performance

In Prisma Studio:
1. Look at query execution time
2. If > 500ms, consider adding indexes
3. Check for N+1 queries

### Monitor Memory Usage

```bash
# In terminal while running backend
# macOS:
top

# Windows:
tasklist

# Linux:
top
```

## Logs Analysis

### Backend Logs

Everything logged to Terminal 1:
- Application startup messages
- Incoming HTTP requests
- Database queries (if enabled)
- Errors and exceptions
- JWT validation

### Frontend Console Logs

DevTools → Console:
- API errors
- Component warnings
- Redux state changes (if using Redux)
- React DevTools (if installed)

## Email/Notification Testing

Since no email configured:
1. Notifications stored in database
2. Check Prisma Studio: Notification table
3. Frontend should poll or use WebSocket
4. Test: Create admission → Check if notification created

## Load Testing

### Test with Multiple Users

```bash
# Using curl
for i in {1..10}; do
  curl -X GET http://localhost:3000/patients \
    -H "Authorization: Bearer <token>"
done
```

### Using Postman

1. Create requests in Postman
2. Test all endpoints
3. Export as collection
4. Share with team

## Production Deployment Testing

### Build Frontend

```bash
npm run build
npm run preview
```

Should show production build on http://localhost:4173

### Build Backend

```bash
cd backend
npm run build
node dist/main.js
```

Should start on port 3000 from compiled files

## Final Verification Checklist

- [ ] Backend starts without errors
- [ ] Frontend loads without errors
- [ ] Can search for patients (GET /public/patients/search)
- [ ] Can create admission (POST /public/patients/admissions)
- [ ] Can login (POST /auth/login)
- [ ] JWT token stored in localStorage
- [ ] Protected routes work with JWT
- [ ] Responses show in Network tab
- [ ] No CORS errors in console
- [ ] Database contains test data

## Still Having Issues?

1. Check DEVELOPMENT.md for general setup
2. Review INTEGRATION_FIXES.md for what was changed
3. Run verify-setup.bat/sh to check all files
4. Post error message + logs to get help
5. Check GitHub issues (if applicable)

---

**Need Help?**
- Check error message carefully
- Look at terminal/console logs
- Try the solution for your specific error above
- Verify all environment variables are set
- Restart dev servers
- Clear browser cache (DevTools → Network → Disable cache)
