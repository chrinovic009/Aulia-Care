// Pages checked by ui-smoke.mjs, per demo account, and the rule applied to each.
// `expect`: text that must appear (the page's own title), when it is stable. It is matched against
// innerText, which applies CSS text-transform: avoid labels displayed in capitals.
export const ROLE_PAGES = [
  { username: 'demo.reception', role: 'réception', pages: ['/reception', '/reception/admission', '/reception/patients', '/reception/rendez-vous', '/reception/hospitalisations', '/reception/abonnements', '/reception/historique'] },
  { username: 'demo.caisse', role: 'caisse', pages: ['/caissier', '/caissier/facturation', '/caissier/historique'] },
  { username: 'demo.infirmier', role: 'infirmier', pages: ['/nurse', '/nurse/patients', { route: '/nurse/rounds', shot: true }, '/nurse/hospitalized', { route: '/mon-espace-rh', expect: 'Mon espace RH' }] },
  { username: 'demo.medecin', role: 'médecin', pages: ['/doctor/', '/doctor/patients', '/doctor/consultations', '/doctor/drafts', '/doctor/exams', '/doctor/prescriptions', '/doctor/hospitalizations'] },
  { username: 'demo.labo', role: 'laboratoire', pages: ['/laboratoire', '/laboratoire/activite', '/laboratoire/validations', '/laboratoire/catalogue'] },
  { username: 'demo.radio', role: 'imagerie', pages: ['/radiologie', '/radiologie/file-attente', '/radiologie/rapports', '/radiologie/catalogue'] },
  { username: 'demo.pharmacie', role: 'pharmacie', pages: ['/pharmacie', '/pharmacie/delivrance', { route: '/pharmacie/stock', shot: true }, '/pharmacie/securite'] },
  { username: 'demo.patient', role: 'patient', pages: ['/patient', '/dossier-medical', '/examens-resultats', '/traitements', '/rendez-vous', '/paiements'] },
  { username: 'demo.urgences', role: 'urgences', pages: ['/unites'] },
  { username: 'demo.finance', role: 'finance', pages: ['/finance', '/finance/tresorerie', { route: '/finance/rapprochement-unites', expect: 'Rapprochement des examens' }, { route: '/finance/rh', expect: 'Paie —' }] },
  { username: 'demo.admin', role: 'administration', pages: ['/administration', '/administration/personnel', '/administration/unites-soins', '/administration/services', { route: '/administration/rapprochement-unites', expect: 'Rapprochement des examens' }, { route: '/administration/rh', expect: 'Congés et événements signalés', shot: true }, { route: '/administration/rapports', expect: 'Rapports quotidiens des services', shot: true }, { route: '/administration/stock', shot: true }] },
  { username: 'demo.superadmin', role: 'super admin', pages: ['/admin', { route: '/admin/rh', expect: 'Ressources humaines' }] },
].map((entry) => ({ ...entry, pages: entry.pages.map((page) => (typeof page === 'string' ? { route: page } : page)) }));

const normalize = (route) => (route.length > 1 ? route.replace(/\/+$/, '') : route);

/** A page passes when it stays on its route, shows a title and raised no error. */
export function evaluatePage(item, snapshot, events) {
  const problems = [];
  if (normalize(snapshot.path) !== normalize(item.route)) problems.push(`redirigé vers ${snapshot.path}`);
  if (/page introuvable|404/i.test(snapshot.heading)) problems.push('page introuvable');
  if (!snapshot.heading) problems.push('aucun titre affiché');
  if (/Une erreur (inattendue )?est survenue|Something went wrong/i.test(snapshot.text)) problems.push('écran d’erreur');
  if (item.expect && !snapshot.text.includes(item.expect)) problems.push(`texte attendu absent : « ${item.expect} »`);
  for (const error of events.exceptions) problems.push(`erreur JavaScript : ${error}`);
  for (const error of events.serverErrors) problems.push(`erreur serveur : ${error}`);
  return { ok: problems.length === 0, problems };
}
