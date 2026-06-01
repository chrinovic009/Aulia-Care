@echo off
REM Verification Script for D7 Clinique Application
REM This script verifies all components are correctly set up

setlocal enabledelayedexpansion

echo D7 Clinique - Complete System Verification
echo ==========================================
echo.

set PASSED=0
set FAILED=0

REM Test function
setlocal enabledelayedexpansion

echo 1. Environment Variables
echo ========================
if exist ".env.local" (
    echo [OK] Frontend .env.local exists
    set /a PASSED+=1
) else (
    echo [FAIL] Frontend .env.local exists
    set /a FAILED+=1
)

if exist "backend\.env" (
    echo [OK] Backend .env exists
    set /a PASSED+=1
) else (
    echo [FAIL] Backend .env exists
    set /a FAILED+=1
)

findstr /M "VITE_API_BASE_URL" .env.local >nul 2>nul
if !errorlevel! equ 0 (
    echo [OK] VITE_API_BASE_URL configured
    set /a PASSED+=1
) else (
    echo [FAIL] VITE_API_BASE_URL configured
    set /a FAILED+=1
)

findstr /M "DATABASE_URL" backend\.env >nul 2>nul
if !errorlevel! equ 0 (
    echo [OK] Backend DATABASE_URL configured
    set /a PASSED+=1
) else (
    echo [FAIL] Backend DATABASE_URL configured
    set /a FAILED+=1
)
echo.

echo 2. Dependencies
echo ===============
if exist "node_modules" (
    echo [OK] Frontend node_modules exists
    set /a PASSED+=1
) else (
    echo [FAIL] Frontend node_modules exists
    set /a FAILED+=1
)

if exist "backend\node_modules" (
    echo [OK] Backend node_modules exists
    set /a PASSED+=1
) else (
    echo [FAIL] Backend node_modules exists
    set /a FAILED+=1
)

where node >nul 2>nul
if !errorlevel! equ 0 (
    echo [OK] Node.js installed
    set /a PASSED+=1
) else (
    echo [FAIL] Node.js installed
    set /a FAILED+=1
)

where npm >nul 2>nul
if !errorlevel! equ 0 (
    echo [OK] npm installed
    set /a PASSED+=1
) else (
    echo [FAIL] npm installed
    set /a FAILED+=1
)
echo.

echo 3. Frontend Files
echo =================
if exist "vite.config.ts" (
    echo [OK] vite.config.ts exists
    set /a PASSED+=1
) else (
    echo [FAIL] vite.config.ts exists
    set /a FAILED+=1
)

if exist "src\config\api.ts" (
    echo [OK] src/config/api.ts exists
    set /a PASSED+=1
) else (
    echo [FAIL] src/config/api.ts exists
    set /a FAILED+=1
)

if exist "src\api\reception.ts" (
    echo [OK] src/api/reception.ts exists
    set /a PASSED+=1
) else (
    echo [FAIL] src/api/reception.ts exists
    set /a FAILED+=1
)

if exist "src\pages\Reception\Admission.tsx" (
    echo [OK] src/pages/Reception/Admission.tsx exists
    set /a PASSED+=1
) else (
    echo [FAIL] src/pages/Reception/Admission.tsx exists
    set /a FAILED+=1
)
echo.

echo 4. Backend Files
echo ================
if exist "backend\src\main.ts" (
    echo [OK] backend/src/main.ts exists
    set /a PASSED+=1
) else (
    echo [FAIL] backend/src/main.ts exists
    set /a FAILED+=1
)

if exist "backend\src\app.module.ts" (
    echo [OK] backend/src/app.module.ts exists
    set /a PASSED+=1
) else (
    echo [FAIL] backend/src/app.module.ts exists
    set /a FAILED+=1
)

if exist "backend\src\auth\auth.controller.ts" (
    echo [OK] backend/src/auth/auth.controller.ts exists
    set /a PASSED+=1
) else (
    echo [FAIL] backend/src/auth/auth.controller.ts exists
    set /a FAILED+=1
)

if exist "backend\src\patients\patients.controller.ts" (
    echo [OK] backend/src/patients/patients.controller.ts exists
    set /a PASSED+=1
) else (
    echo [FAIL] backend/src/patients/patients.controller.ts exists
    set /a FAILED+=1
)

if exist "backend\src\patients\public-patients.controller.ts" (
    echo [OK] backend/src/patients/public-patients.controller.ts exists
    set /a PASSED+=1
) else (
    echo [FAIL] backend/src/patients/public-patients.controller.ts exists
    set /a FAILED+=1
)

if exist "backend\src\patients\patients.service.ts" (
    echo [OK] backend/src/patients/patients.service.ts exists
    set /a PASSED+=1
) else (
    echo [FAIL] backend/src/patients/patients.service.ts exists
    set /a FAILED+=1
)

if exist "prisma\schema.prisma" (
    echo [OK] prisma/schema.prisma exists
    set /a PASSED+=1
) else (
    echo [FAIL] prisma/schema.prisma exists
    set /a FAILED+=1
)
echo.

echo Summary
echo =======
echo Passed: !PASSED!
echo Failed: !FAILED!
echo.

if !FAILED! equ 0 (
    echo [OK] All checks passed. Ready to start development.
    echo.
    echo Next steps:
    echo 1. Terminal 1: cd backend ^&^& npm run start:dev
    echo 2. Terminal 2: npm run dev
) else (
    echo [FAIL] Some checks failed. Please review the setup.
)
echo.
pause
