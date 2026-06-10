import 'reflect-metadata';
import { AuthService } from './src/auth/auth.service.ts';
console.log(Reflect.getMetadata('design:paramtypes', AuthService));
