import test from 'node:test';
import assert from 'node:assert/strict';
import { isPatientPortalPath } from './platform-layer-access.guard';

test('portail patient : les écrans du patient sont autorisés', () => {
  for (const [m, p] of [['GET', '/api/patients/me/profile'], ['GET', '/api/administration/clinic-identity'], ['GET', '/api/messages/unread'], ['GET', '/api/messages/with/abc'], ['PATCH', '/api/messages/read'], ['GET', '/api/users/contacts'], ['GET', '/api/appointments/booking-options'], ['POST', '/api/appointments/me'], ['GET', '/api/wearables/patients/p1/dashboard'], ['GET', '/api/wearables/parent-child-links/me']]) {
    assert.equal(isPatientPortalPath(p, m), true, `${m} ${p}`);
  }
});

test('portail patient : le reste de l’établissement reste fermé', () => {
  for (const [m, p] of [['GET', '/api/patients'], ['GET', '/api/appointments'], ['POST', '/api/appointments'], ['GET', '/api/wearables/reception/dashboard'], ['POST', '/api/wearables/patients/p1/location'], ['GET', '/api/billing/invoices'], ['GET', '/api/users'], ['GET', '/api/administration/clinic-branding']]) {
    assert.equal(isPatientPortalPath(p, m), false, `${m} ${p}`);
  }
});
