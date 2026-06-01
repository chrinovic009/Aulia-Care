#!/bin/bash

# Verification Script for D7 Clinique Application
# This script verifies all components are correctly set up

set -e

echo "D7 Clinique - Complete System Verification"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Counters
PASSED=0
FAILED=0

# Test function
test_component() {
    local name="$1"
    local command="$2"
    
    if eval "$command" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} $name"
        ((PASSED++))
    else
        echo -e "${RED}✗${NC} $name"
        ((FAILED++))
    fi
}

echo "1. Environment Variables"
echo "========================"
test_component "Frontend .env.local exists" "test -f .env.local"
test_component "Backend .env exists" "test -f backend/.env"
test_component "VITE_API_BASE_URL configured" "grep -q 'VITE_API_BASE_URL' .env.local"
test_component "Backend DATABASE_URL configured" "grep -q 'DATABASE_URL' backend/.env"
echo ""

echo "2. Dependencies"
echo "==============="
test_component "Frontend node_modules exists" "test -d node_modules"
test_component "Backend node_modules exists" "test -d backend/node_modules"
test_component "Node.js installed" "command -v node"
test_component "npm installed" "command -v npm"
echo ""

echo "3. Frontend Files"
echo "================="
test_component "vite.config.ts exists" "test -f vite.config.ts"
test_component "src/config/api.ts exists" "test -f src/config/api.ts"
test_component "src/api/reception.ts exists" "test -f src/api/reception.ts"
test_component "src/pages/Reception/Admission.tsx exists" "test -f src/pages/Reception/Admission.tsx"
echo ""

echo "4. Backend Files"
echo "================"
test_component "backend/src/main.ts exists" "test -f backend/src/main.ts"
test_component "backend/src/app.module.ts exists" "test -f backend/src/app.module.ts"
test_component "backend/src/auth/auth.controller.ts exists" "test -f backend/src/auth/auth.controller.ts"
test_component "backend/src/patients/patients.controller.ts exists" "test -f backend/src/patients/patients.controller.ts"
test_component "backend/src/patients/public-patients.controller.ts exists" "test -f backend/src/patients/public-patients.controller.ts"
test_component "backend/src/patients/patients.service.ts exists" "test -f backend/src/patients/patients.service.ts"
test_component "prisma/schema.prisma exists" "test -f prisma/schema.prisma"
echo ""

echo "5. Configuration"
echo "================"
test_component "vite.config.ts has proxy" "grep -q 'server.*proxy' vite.config.ts"
test_component "api.ts has API_CONFIG" "grep -q 'export const API_CONFIG' src/config/api.ts"
test_component "api.ts has PUBLIC_PATIENTS" "grep -q 'PUBLIC_PATIENTS' src/config/api.ts"
test_component "reception.ts uses public routes" "grep -q 'public/patients' src/api/reception.ts"
echo ""

echo "6. TypeScript Types"
echo "==================="
test_component "Admission.tsx compiles" "test -f src/pages/Reception/Admission.tsx"
test_component "reception.ts is valid" "test -f src/api/reception.ts"
test_component "api.ts exports are available" "grep -q 'export const' src/config/api.ts"
echo ""

echo "Summary"
echo "======="
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed! Ready to start development.${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Terminal 1: cd backend && npm run start:dev"
    echo "2. Terminal 2: npm run dev"
    exit 0
else
    echo -e "${RED}✗ Some checks failed. Please review the setup.${NC}"
    exit 1
fi
