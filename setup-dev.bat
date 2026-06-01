@echo off
REM D7 Clinique Development Startup Script for Windows

setlocal enabledelayedexpansion

echo ================================
echo D7 Clinique Development Setup
echo ================================
echo.

REM Check if Node.js is installed
echo Checking prerequisites...
where node >nul 2>nul
if errorlevel 1 (
    echo ERROR: Node.js is not installed. Please install Node.js 18+
    exit /b 1
)

for /f "tokens=*" %%A in ('node --version') do set NODE_VERSION=%%A
echo [OK] Node.js %NODE_VERSION%

REM Check if npm is installed
where npm >nul 2>nul
if errorlevel 1 (
    echo ERROR: npm is not installed
    exit /b 1
)

for /f "tokens=*" %%A in ('npm --version') do set NPM_VERSION=%%A
echo [OK] npm %NPM_VERSION%
echo.

REM Install frontend dependencies
echo Installing frontend dependencies...
if not exist "node_modules" (
    call npm install
    echo [OK] Frontend dependencies installed
) else (
    echo [OK] Frontend dependencies already installed
)
echo.

REM Install backend dependencies
echo Installing backend dependencies...
if not exist "backend\node_modules" (
    cd backend
    call npm install
    cd ..
    echo [OK] Backend dependencies installed
) else (
    echo [OK] Backend dependencies already installed
)
echo.

REM Check backend .env file
echo Checking configuration files...
if exist "backend\.env" (
    echo [OK] Backend .env file found
) else (
    echo [!] Creating backend\.env from example
    if exist "backend\.env.example" (
        copy backend\.env.example backend\.env
    )
)

if exist ".env.local" (
    echo [OK] Frontend .env.local file found
) else (
    echo [!] Creating .env.local
    (
        echo VITE_API_BASE_URL=http://localhost:3000
        echo VITE_ENV=development
    ) > .env.local
)
echo.

echo ================================
echo Setup complete!
echo ================================
echo.
echo To start development:
echo.
echo Terminal 1 - Backend:
echo   cd backend
echo   npm run start:dev
echo.
echo Terminal 2 - Frontend:
echo   npm run dev
echo.
echo Frontend: http://localhost:5173
echo Backend:  http://localhost:3000
echo.
echo For more information, see DEVELOPMENT.md
echo.
pause
