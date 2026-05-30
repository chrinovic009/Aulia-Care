# D7 Clinique Backend

## Architecture

- NestJS application
- Prisma ORM connecting to PostgreSQL
- JWT authentication with access and refresh tokens
- RBAC via RoleSlug and permissions
- Modular design for clinical workflow modules

## Modules

- AuthModule
- UsersModule
- RolesModule
- PatientsModule
- AppointmentsModule
- ConsultationsModule
- HospitalizationsModule
- LaboratoryModule
- ImagingModule
- PharmacyModule
- SurgeryModule
- BillingModule
- NotificationsModule
- AuditModule

## Startup

1. Copier `.env.example` en `.env`
2. Installer les dépendances :
   ```bash
   cd backend
   npm install
   ```
3. Générer le client Prisma :
   ```bash
   npm run prisma:generate
   ```
4. Appliquer le schéma à la base :
   ```bash
   npm run prisma:db:push
   ```
5. Lancer le seed :
   ```bash
   npm run db:seed
   ```
6. Démarrer en développement :
   ```bash
   npm run start:dev
   ```

## Notes de migration

- Les endpoints frontend doivent maintenant consommer l'API NestJS.
- Le stockage local n'est plus utilisé pour les entités métier.
- Les données persistantes sont stockées dans PostgreSQL.
