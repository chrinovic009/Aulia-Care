import assert from 'node:assert/strict';
import test from 'node:test';
import type { ExecutionContext } from '@nestjs/common';
import { RolesGuard } from './roles.guard';

const contextFor = (path: string, role: string): ExecutionContext => ({
  getHandler: () => ({}),
  getClass: () => ({}),
  switchToHttp: () => ({ getRequest: () => ({ path, user: { role } }) }),
} as unknown as ExecutionContext);

test('SUPER_ADMIN cannot obtain direct clinical access merely because a controller lists the role', () => {
  const reflector = { getAllAndOverride: () => ['SUPER_ADMIN', 'PHYSICIAN'] };
  const guard = new RolesGuard(reflector as never);
  assert.throws(() => guard.canActivate(contextFor('/api/patients/patient-a', 'SUPER_ADMIN')));
  assert.equal(guard.canActivate(contextFor('/api/billing/invoices', 'SUPER_ADMIN')), true);
});

test('director grant adds only director access while physician role is retained',()=>{
 const guard=new RolesGuard({getAllAndOverride:()=>['MEDICAL_DIRECTOR']} as never);
 const ctx=(roles:string[])=>({getHandler:()=>({}),getClass:()=>({}),switchToHttp:()=>({getRequest:()=>({path:'/api/medical-governance/policies',user:{role:'PHYSICIAN',roles}})})}) as unknown as ExecutionContext;
 assert.equal(guard.canActivate(ctx(['MEDICAL_DIRECTOR'])),true);
 assert.equal(guard.canActivate(ctx([])),false);
 const adminGuard=new RolesGuard({getAllAndOverride:()=>['ADMIN']} as never);
 assert.equal(adminGuard.canActivate(ctx(['MEDICAL_DIRECTOR'])),false);
});
