# D7 Clinique - Development Setup Guide

## Prerequisites

- Node.js 18+ and npm
- PostgreSQL 12+ (or use Neon cloud database)
- Git

## Quick Start

### 1. Install Dependencies

```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd backend
npm install
cd ..
```

### 2. Environment Setup

Both `.env` and `backend/.env` are already configured with:
- Database URL (Neon PostgreSQL)
- JWT secrets
- Port configurations (frontend: 5173, backend: 3000)

### 3. Database Setup (First time only)

```bash
# From project root
cd backend

# Push Prisma schema to database
npm run prisma:db:push

# Seed database with initial data (optional)
npm run db:seed

cd ..
```

### 4. Start Development

**Terminal 1 - Backend:**
```bash
cd backend
npm run start:dev
# Backend runs on http://localhost:3000
```

**Terminal 2 - Frontend:**
```bash
npm run dev
# Frontend runs on http://localhost:5173
```

## Architecture

### Frontend
- **Technology**: React + Vite + TypeScript
- **Port**: 5173
- **Styling**: Tailwind CSS
- **API Configuration**: `src/config/api.ts`
- **Main Pages**: 
  - Authentication (Login)
  - Reception/Admission form
  - Patient management
  - Appointments, Consultations, etc.

### Backend
- **Technology**: NestJS + Prisma + PostgreSQL
- **Port**: 3000
- **Key Modules**:
  - `auth` - JWT authentication
  - `patients` - Patient management (protected + public routes)
  - `appointments` - Appointment scheduling
  - `hospitalizations` - Hospital admission tracking
  - `consultations` - Medical consultations
  - And many more...

## API Endpoints

### Public Routes (No authentication required)
- `POST /auth/login` - User login
- `POST /auth/refresh` - Refresh JWT token
- `GET /public/patients/search` - Search patients by name, email, or phone
- `POST /public/patients/admissions` - Create patient admission

### Protected Routes (JWT required)
- `GET /patients` - Get all patients
- `GET /patients/:id` - Get patient by ID
- `POST /patients` - Create new patient
- `GET /appointments` - Get all appointments
- `POST /appointments` - Create appointment
- `GET /hospitalizations` - Get all hospitalizations
- And more...

## Project Structure

```
D7 Clinnique/
├── frontend (React + Vite)
│   ├── src/
│   │   ├── components/ - React components
│   │   ├── pages/ - Page components (Reception, Admin, etc.)
│   │   ├── api/ - API client functions
│   │   ├── config/ - Configuration (api.ts)
│   │   ├── context/ - React context (Auth, Theme, etc.)
│   │   └── hooks/ - Custom React hooks
│   ├── vite.config.ts - Dev server with API proxy
│   └── .env.local - Frontend environment variables
│
├── backend/ (NestJS)
│   ├── src/
│   │   ├── auth/ - Authentication & JWT
│   │   ├── patients/ - Patient management
│   │   ├── appointments/ - Appointments
│   │   ├── hospitalizations/ - Hospitalizations
│   │   ├── consultations/ - Consultations
│   │   ├── app.module.ts - Main module
│   │   └── main.ts - Bootstrap
│   ├── .env - Backend environment variables
│   └── package.json
│
├── prisma/
│   ├── schema.prisma - Database schema
│   └── seed.ts - Database seed script
│
└── docs/ - Documentation
```

## Testing the Application

### 1. Test Login Flow
1. Navigate to http://localhost:5173
2. Click on login page
3. Use credentials from database seed (if run)
4. Should receive JWT token stored in localStorage

### 2. Test Patient Admission (Reception)
1. Go to Reception/Admission page
2. Search for existing patient or create new admission
3. Submit form - creates admission in database

### 3. Check API Communication
- Open browser DevTools (F12)
- Go to Network tab
- Perform actions and check requests
- Should see requests to http://localhost:3000 via proxy

## Troubleshooting

### Backend won't start
```bash
# Check Node.js version
node --version

# Install dependencies again
cd backend
rm -rf node_modules
npm install
cd ..

# Check if port 3000 is in use
# Windows: netstat -ano | findstr :3000
# Linux/Mac: lsof -i :3000
```

### Database connection error
```bash
# Verify DATABASE_URL in backend/.env
# Test connection
cd backend
npm run prisma:db:push
```

### Frontend showing "Failed to fetch"
1. Check if backend is running on port 3000
2. Check VITE_API_BASE_URL in .env.local (should be http://localhost:3000)
3. Check browser console for CORS errors
4. Verify proxy in vite.config.ts is correctly configured

### JWT token issues
1. Check localStorage has token after login
2. Verify JWT_SECRET in backend/.env matches frontend usage
3. Clear localStorage and try login again

## IDE Setup

### VS Code Recommended Extensions
- ES7+ React/Redux/React-Native snippets
- Prisma
- ESLint
- TypeScript Vue Plugin
- Tailwind CSS IntelliSense

### Configure TypeScript Path Aliases (Optional)
Edit `tsconfig.json` for cleaner imports:
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@components/*": ["src/components/*"],
      "@pages/*": ["src/pages/*"],
      "@api/*": ["src/api/*"]
    }
  }
}
```

## Environment Variables

### Frontend (.env.local)
```
VITE_API_BASE_URL=http://localhost:3000
VITE_ENV=development
```

### Backend (.env)
```
DATABASE_URL=postgresql://...
PORT=3000
NODE_ENV=development
JWT_SECRET=...
JWT_REFRESH_SECRET=...
JWT_ACCESS_EXPIRES_IN=900s
JWT_REFRESH_EXPIRES_IN=7d
CORS_ORIGIN=http://localhost:5173,http://localhost:3000
```

## Common Commands

```bash
# Frontend
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build

# Backend
npm run start:dev    # Start with hot reload
npm run build        # Build TypeScript
npm run prisma:generate  # Generate Prisma client
npm run prisma:studio    # Open Prisma Studio (GUI)

# From backend directory
npm run db:seed      # Seed database
```

## Authentication Flow

1. User submits login form with identifier + password
2. Backend validates credentials against database
3. Backend generates JWT token (900s expiry)
4. Token sent to frontend, stored in localStorage
5. All protected API requests include `Authorization: Bearer <token>`
6. When token expires, frontend can refresh using refresh token (7d expiry)

## Database Schema

Key models:
- **User** - System users (admins, doctors, nurses, etc.)
- **Patient** - Patient information
- **Appointment** - Medical appointments
- **Consultation** - Medical consultations
- **Hospitalization** - Hospital admissions
- **LabRequest** - Laboratory test requests
- **Prescription** - Medicine prescriptions
- **Invoice** - Billing invoices
- **Payment** - Payment records

## Deployment

### Build Production
```bash
# Build frontend
npm run build
# Output in dist/

# Build backend
cd backend
npm run build
# Output in dist/
```

### Deploy to Vercel (Frontend)
Already configured in `vercel.json`
```bash
npx vercel
```

### Deploy Backend
- Docker recommended for containerization
- Connect to Neon PostgreSQL (already configured)
- Set environment variables in production

## Support

For issues or questions:
1. Check troubleshooting section
2. Review error messages in console/logs
3. Verify environment configuration
4. Check API proxy configuration in vite.config.ts
