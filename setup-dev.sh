#!/bin/bash

# D7 Clinique Development Startup Script
# This script sets up and starts both frontend and backend

set -e

echo "================================"
echo "D7 Clinique Development Setup"
echo "================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Node.js is installed
echo -e "${YELLOW}Checking prerequisites...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}Node.js is not installed. Please install Node.js 18+${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Node.js $(node --version)${NC}"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo -e "${RED}npm is not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ npm $(npm --version)${NC}"
echo ""

# Install frontend dependencies
echo -e "${YELLOW}Installing frontend dependencies...${NC}"
if [ ! -d "node_modules" ]; then
    npm install
    echo -e "${GREEN}✓ Frontend dependencies installed${NC}"
else
    echo -e "${GREEN}✓ Frontend dependencies already installed${NC}"
fi
echo ""

# Install backend dependencies
echo -e "${YELLOW}Installing backend dependencies...${NC}"
if [ ! -d "backend/node_modules" ]; then
    cd backend
    npm install
    cd ..
    echo -e "${GREEN}✓ Backend dependencies installed${NC}"
else
    echo -e "${GREEN}✓ Backend dependencies already installed${NC}"
fi
echo ""

# Check database connection
echo -e "${YELLOW}Checking database connection...${NC}"
if [ -f "backend/.env" ]; then
    echo -e "${GREEN}✓ Backend .env file found${NC}"
else
    echo -e "${YELLOW}! Creating backend/.env from example${NC}"
    cp backend/.env.example backend/.env
fi

if [ -f ".env.local" ]; then
    echo -e "${GREEN}✓ Frontend .env.local file found${NC}"
else
    echo -e "${YELLOW}! Creating .env.local${NC}"
    cat > .env.local << EOF
VITE_API_BASE_URL=http://localhost:3000
VITE_ENV=development
EOF
fi
echo ""

echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}Setup complete!${NC}"
echo -e "${GREEN}================================${NC}"
echo ""
echo "To start development:"
echo ""
echo -e "${YELLOW}Terminal 1 - Backend:${NC}"
echo "  cd backend"
echo "  npm run start:dev"
echo ""
echo -e "${YELLOW}Terminal 2 - Frontend:${NC}"
echo "  npm run dev"
echo ""
echo -e "Frontend will be available at: ${GREEN}http://localhost:5173${NC}"
echo -e "Backend API will be available at: ${GREEN}http://localhost:3000${NC}"
echo ""
echo "For more information, see DEVELOPMENT.md"
