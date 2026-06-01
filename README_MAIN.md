# D7 Clinique - Hospital Management System

A comprehensive full-stack hospital management system built with React, NestJS, Prisma, and PostgreSQL.

## ✨ Features

- **Patient Management** - Create and manage patient records
- **Reception/Admission** - Streamlined patient admission workflow
- **Appointments** - Schedule and track medical appointments
- **Medical Consultations** - Record patient consultations
- **Hospitalizations** - Manage hospital admissions and stays
- **Prescriptions** - Digital prescription management
- **Laboratory** - Lab test requests and results
- **Billing** - Invoice and payment management
- **User Management** - Role-based access control (Admin, Doctor, Nurse, Receptionist, etc.)
- **Audit Trail** - Complete activity logging

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm
- PostgreSQL (or use Neon cloud database - already configured)

### Windows
```bash
# Run setup script
setup-dev.bat

# Terminal 1 - Backend
cd backend
npm run start:dev

# Terminal 2 - Frontend
npm run dev
```

### macOS/Linux
```bash
# Run setup script
bash setup-dev.sh

# Terminal 1 - Backend
cd backend
npm run start:dev

# Terminal 2 - Frontend
npm run dev
```

### Access Application
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3000
- **Prisma Studio**: http://localhost:5555 (run `npm run prisma:studio`)

## 📋 Documentation

New to the project? Start here:

1. **[QUICK_START.md](./QUICK_START.md)** - Executive summary and key endpoints
2. **[DEVELOPMENT.md](./DEVELOPMENT.md)** - Complete development setup guide
3. **[TESTING_GUIDE.md](./TESTING_GUIDE.md)** - Testing and troubleshooting
4. **[INTEGRATION_FIXES.md](./INTEGRATION_FIXES.md)** - What was fixed and how
5. **[CHANGE_MANIFEST.md](./CHANGE_MANIFEST.md)** - Detailed change record

## 📁 Project Structure

```
D7 Clinnique/
├── frontend (React + Vite)
│   ├── src/
│   │   ├── components/     - Reusable React components
│   │   ├── pages/          - Page components
│   │   ├── api/            - API client functions
│   │   ├── config/         - Configuration
│   │   ├── context/        - React context
│   │   └── hooks/          - Custom React hooks
│   └── vite.config.ts      - Vite configuration with API proxy
│
├── backend (NestJS)
│   ├── src/
│   │   ├── auth/           - Authentication & JWT
│   │   ├── patients/       - Patient management
│   │   ├── appointments/   - Appointments
│   │   ├── consultations/  - Medical consultations
│   │   ├── hospitalizations/ - Hospital admissions
│   │   └── ... (many more modules)
│   └── package.json
│
├── prisma/
│   ├── schema.prisma       - Database schema
│   └── seed.ts             - Test data
│
└── docs/
    ├── QUICK_START.md      - Quick reference
    ├── DEVELOPMENT.md      - Setup guide
    ├── TESTING_GUIDE.md    - Troubleshooting
    ├── INTEGRATION_FIXES.md - Technical details
    └── CHANGE_MANIFEST.md  - Change record
```

## 🔑 Key Endpoints

### Public Routes (No Authentication)
- `POST /auth/login` - User login
- `GET /public/patients/search` - Search patients
- `POST /public/patients/admissions` - Create admission

### Protected Routes (JWT Required)
- `GET /patients` - List patients
- `GET /appointments` - List appointments
- `GET /hospitalizations` - List hospitalizations
- ... and 50+ more endpoints

See [QUICK_START.md](./QUICK_START.md) for complete endpoint list.

## 🔧 Technologies

### Frontend
- React 18+
- Vite
- TypeScript
- Tailwind CSS
- React Router
- Fetch API

### Backend
- NestJS 10+
- Prisma ORM
- PostgreSQL
- JWT Authentication
- Class Validator
- bcrypt

### Database
- PostgreSQL 12+
- Neon Cloud (production)
- Prisma Migrations

## 📊 Database Schema

Key tables:
- **User** - System users
- **Patient** - Patient information
- **Appointment** - Appointments
- **Consultation** - Medical consultations
- **Hospitalization** - Hospital admissions
- **Prescription** - Prescriptions
- **LabRequest** - Lab tests
- **Invoice** - Billing
- **Payment** - Payments
- ... and more

## 🔐 Authentication

- JWT-based authentication
- Refresh token support (7-day expiry)
- Access token expiry: 900 seconds
- Role-based access control

### Login Flow
```
1. User enters credentials
2. POST /auth/login with email + password
3. Backend validates and returns JWT
4. Frontend stores token in localStorage
5. Subsequent requests include Authorization header
```

## ⚡ Performance

- API proxy eliminates CORS overhead
- 10-second request timeout
- Database query optimization
- JWT token caching
- Cloud-hosted database for low latency

## 🔒 Security

- JWT authentication on protected routes
- Password hashing with bcrypt
- Input validation on all endpoints
- CORS configured
- Rate limiting ready (can be configured)
- Audit logging of all operations

## 🐛 Troubleshooting

### "Failed to fetch" Error
```bash
# Make sure backend is running
cd backend
npm run start:dev
```

### "Cannot find module" Error
```bash
# Install dependencies
npm install
cd backend && npm install
```

### Database Connection Issues
```bash
# Verify backend/.env has correct DATABASE_URL
# Test connection in Prisma Studio
npm run prisma:studio
```

For more help, see [TESTING_GUIDE.md](./TESTING_GUIDE.md).

## 📦 Setup & Deployment

### Development
```bash
# Install dependencies
setup-dev.bat  # Windows
bash setup-dev.sh  # macOS/Linux

# Start development servers
# Terminal 1
cd backend && npm run start:dev

# Terminal 2
npm run dev
```

### Production
```bash
# Build
npm run build
cd backend && npm run build

# Start
npm start
```

See [DEVELOPMENT.md](./DEVELOPMENT.md) for detailed instructions.

## 🧪 Testing

1. Run verification script: `verify-setup.bat` or `bash verify-setup.sh`
2. See [TESTING_GUIDE.md](./TESTING_GUIDE.md) for comprehensive testing

## 📝 Environment Variables

### Frontend (`.env.local`)
```env
VITE_API_BASE_URL=http://localhost:3000
VITE_ENV=development
```

### Backend (`backend/.env`)
```env
DATABASE_URL=postgresql://...
PORT=3000
NODE_ENV=development
JWT_SECRET=...
JWT_REFRESH_SECRET=...
```

## 🚀 Deployment

The application is ready for deployment to:
- Vercel (Frontend) - configured in `vercel.json`
- AWS, Heroku, DigitalOcean (Backend + Database)

See [DEVELOPMENT.md](./DEVELOPMENT.md) for deployment instructions.

## 📚 API Documentation

Full API documentation coming soon. For now, see:
- [QUICK_START.md - Endpoints](./QUICK_START.md#key-endpoints)
- Backend controllers for endpoint details
- NestJS Swagger integration can be added

## 🤝 Contributing

1. Follow the established code structure
2. Use TypeScript for type safety
3. Add tests for new features
4. Follow the naming conventions
5. Keep components small and focused

## 📞 Support

For issues:
1. Check [TESTING_GUIDE.md](./TESTING_GUIDE.md) for troubleshooting
2. Review error messages in console/terminal
3. Check environment variables configuration
4. Refer to [INTEGRATION_FIXES.md](./INTEGRATION_FIXES.md) for technical context

## 📋 Requirements

### System Requirements
- Node.js 18.0.0 or higher
- npm 9.0.0 or higher
- Modern web browser (Chrome, Firefox, Safari, Edge)
- PostgreSQL 12+ (or use Neon cloud)

### Development Tools (Recommended)
- VS Code
- Postman (for API testing)
- Git
- Docker (for production deployment)

## ✅ Status

- ✅ Frontend: Production Ready
- ✅ Backend: Production Ready
- ✅ Database: Configured with Neon PostgreSQL
- ✅ Authentication: JWT implemented
- ✅ API Proxy: Configured for development
- ✅ Documentation: Complete

## 📄 License

See [LICENSE.md](./LICENSE.md)

## 👥 Team

Built with attention to detail for healthcare professionals.

---

## Quick Links

- [Quick Start Guide](./QUICK_START.md)
- [Development Guide](./DEVELOPMENT.md)
- [Testing & Debugging](./TESTING_GUIDE.md)
- [Technical Details](./INTEGRATION_FIXES.md)
- [Change Record](./CHANGE_MANIFEST.md)

---

**Version**: 1.0 Production Ready  
**Last Updated**: When fixes were applied  
**Status**: ✅ Ready for Development & Deployment
