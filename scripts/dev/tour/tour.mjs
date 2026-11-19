// Aulia Care — guided tour of the real interfaces on the local demo
// (http://localhost:5190, fictitious data). Drives Microsoft Edge through the
// Chrome DevTools Protocol (no extra package), signs in with each demo role,
// visits every page and tab, and writes JPEG screenshots plus manifest.json to
// .validation/tour/. The video is assembled from these files.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const out = path.join(root, '.validation', 'tour');
const shotsDir = path.join(out, 'shots');
const BASE = process.env.AULIA_TOUR_BASE || 'http://localhost:5190';
const W = 1600, H = 900;
fs.rmSync(shotsDir, { recursive: true, force: true });
fs.mkdirSync(shotsDir, { recursive: true });
const logFile = path.join(out, 'tour.log');
fs.writeFileSync(logFile, '');
const log = (...args) => { const line = `${new Date().toISOString()} ${args.join(' ')}`; console.log(line); fs.appendFileSync(logFile, line + '\n'); };

const credentials = fs.readFileSync(path.join(root, '.validation', 'demo', 'credentials.txt'), 'utf8');
const PASSWORD = (credentials.match(/Mot de passe\s*:\s*(\S+)/) || [])[1];
if (!PASSWORD) throw new Error('Mot de passe de démo introuvable : lancez d’abord la démo.');

const U = {
  emergency: '9c111111-1111-4111-8111-111111111111', ambulance: '9c111111-1111-4111-8111-111111111112',
  maternity: '9c111111-1111-4111-8111-111111111113', surgery: '9c111111-1111-4111-8111-111111111114',
  dialysis: '9c111111-1111-4111-8111-111111111115', laboratory: '9c111111-1111-4111-8111-111111111116',
  imaging: '9c111111-1111-4111-8111-111111111117', pharmacy: '9c111111-1111-4111-8111-111111111118',
};
const P = { bravo: '51111111-1111-4111-8111-111111111112', charlie: '51111111-1111-4111-8111-111111111113', delta: '51111111-1111-4111-8111-111111111114' };
const EP = { bravo: '9e111111-1111-4111-8111-111111111111', charlie: '9e111111-1111-4111-8111-111111111112', delta: '9e111111-1111-4111-8111-111111111113' };

// ------------------------------------------------------------------ browser
const edgeCandidates = [
  process.env.AULIA_TOUR_BROWSER,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);
const browserPath = edgeCandidates.find((candidate) => fs.existsSync(candidate));
if (!browserPath) throw new Error('Ni Edge ni Chrome trouvé.');
const port = 9333;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'aulia-tour-'));
const browser = spawn(browserPath, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${W},${H}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--force-device-scale-factor=1', '--lang=fr-FR',
  '--hide-scrollbars', '--disable-features=Translate', '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let wsUrl;
for (let i = 0; i < 60 && !wsUrl; i++) {
  try {
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    wsUrl = pages.find((page) => page.type === 'page')?.webSocketDebuggerUrl;
  } catch { /* not ready yet */ }
  if (!wsUrl) await sleep(500);
}
if (!wsUrl) throw new Error('Le navigateur ne répond pas.');
const ws = new WebSocket(wsUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let nextId = 1;
const pending = new Map();
ws.onmessage = (message) => {
  const data = JSON.parse(String(message.data));
  if (data.id && pending.has(data.id)) {
    const { resolve, reject } = pending.get(data.id);
    pending.delete(data.id);
    if (data.error) reject(new Error(data.error.message)); else resolve(data.result);
  }
};
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
await cdp('Page.enable');
await cdp('Runtime.enable');
await cdp('Network.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

const js = async (expression) => {
  const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || 'Erreur JavaScript');
  return result.result?.value;
};

/** Waits for the page, the branded route loader and loading indicators; closes success notices. */
async function settle(extra = 700) {
  const deadline = Date.now() + 20000;
  let quiet = 0;
  while (Date.now() < deadline) {
    let busy = true;
    try {
      busy = await js(`(() => {
        if (document.readyState !== 'complete') return true;
        const loader = document.querySelector('.aulia-page-loader');
        if (loader && !loader.classList.contains('aulia-page-loader--hidden')) return true;
        const text = document.body ? document.body.innerText : '';
        const spinner = [...document.querySelectorAll('.animate-spin')].some((el) => el.getBoundingClientRect().width > 0);
        return spinner || /^\\s*$/.test(text);
      })()`);
    } catch { busy = true; }
    quiet = busy ? 0 : quiet + 1;
    if (quiet >= 3) break;
    await sleep(250);
  }
  // If a background timer was throttled, the branded transition overlay is
  // simply dismissed: it never carries data, it only covers the page.
  await js(`(() => { const loader = document.querySelector('.aulia-page-loader'); if (loader) loader.classList.add('aulia-page-loader--hidden'); })()`).catch(() => undefined);
  await sleep(450); // loader fade-out
  // "Action enregistrée" / information notices would hide the page.
  await js(`(() => { for (const b of document.querySelectorAll('button')) { if (/^(Compris|OK|J’ai compris)$/i.test((b.innerText || '').trim()) && b.getBoundingClientRect().width > 0) b.click(); } })()`).catch(() => undefined);
  await sleep(extra);
}

async function go(route) {
  await cdp('Page.navigate', { url: BASE + route });
  await sleep(400);
  await settle();
}

// ------------------------------------------------------------------ capture
const manifest = [];
let shotIndex = 0;
let section = '';
function chapter(title, subtitle) {
  section = title;
  manifest.push({ kind: 'chapter', title, subtitle });
  log('== ' + title);
}
async function shot(title, caption) {
  const { data } = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 92 });
  const file = `${String(++shotIndex).padStart(3, '0')}.jpg`;
  fs.writeFileSync(path.join(shotsDir, file), Buffer.from(data, 'base64'));
  manifest.push({ kind: 'shot', file, section, title, caption });
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
  log(`   ${file} ${title}`);
}
async function page(route, title, caption) {
  try {
    await go(route);
    await shot(title, caption);
  } catch (error) {
    log(`   ECHEC ${route} : ${error.message}`);
  }
}
/** Scrolls the main content to show what lies below the fold. */
async function scrolled(title, caption) {
  const moved = await js(`(() => {
    const candidates = [document.scrollingElement, ...document.querySelectorAll('main, [class*="overflow-y-auto"]')].filter(Boolean);
    const target = candidates.find((el) => el.scrollHeight - el.clientHeight > 200);
    if (!target) return false;
    target.scrollTo({ top: Math.min(target.scrollHeight, target.clientHeight * 0.85), behavior: 'instant' });
    return true;
  })()`).catch(() => false);
  if (!moved) return;
  await sleep(500);
  await shot(title, caption);
  await js(`(() => { document.scrollingElement && document.scrollingElement.scrollTo(0, 0); document.querySelectorAll('main, [class*="overflow-y-auto"]').forEach((el) => el.scrollTo(0, 0)); })()`).catch(() => undefined);
}
/** Clicks the first visible element whose text matches. */
async function clickText(text, selector = 'button, a, [role="tab"], li, td, p, span') {
  const done = await js(`(() => {
    const wanted = ${JSON.stringify(text)}.toLowerCase();
    const items = [...document.querySelectorAll(${JSON.stringify(selector)})].filter((el) => el.getBoundingClientRect().width > 0 && (el.innerText || '').trim().toLowerCase().includes(wanted));
    items.sort((a, b) => (a.innerText || '').length - (b.innerText || '').length);
    const el = items[0];
    if (!el) return false;
    (el.closest('button, a') || el).click();
    return true;
  })()`).catch(() => false);
  if (done) await settle(700);
  return done;
}
async function closeDialog() {
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(300);
  await clickText('Fermer', 'button').catch(() => false);
  await sleep(300);
}

async function api(method, route, body) {
  return js(`(async () => {
    const response = await fetch('/api${route}', { method: ${JSON.stringify(method)}, credentials: 'include', headers: { 'Content-Type': 'application/json' }, ${body ? `body: ${JSON.stringify(JSON.stringify(body))},` : ''} });
    const text = await response.text();
    let data = null; try { data = JSON.parse(text); } catch { data = text; }
    return { status: response.status, data };
  })()`);
}

async function login(username, label) {
  await cdp('Network.clearBrowserCookies');
  await go('/signin');
  await js(`(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} })()`).catch(() => undefined);
  await go('/signin');
  const focus = async (selector) => js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.focus(); el.select && el.select(); return true; })()`);
  await focus('input:not([type="password"]):not([type="checkbox"])');
  await cdp('Input.insertText', { text: username });
  await focus('input[type="password"]');
  await cdp('Input.insertText', { text: PASSWORD });
  await sleep(300);
  await shot(`Connexion — ${label}`, `${label} se connecte avec son identifiant (${username}).`);
  await js(`document.querySelector('button[type="submit"]').click()`);
  for (let i = 0; i < 60; i++) {
    await sleep(250);
    const where = await js('location.pathname').catch(() => '/signin');
    if (where !== '/signin') break;
  }
  await settle(1200);
}

const unitTabs = async (unitId, tabs, intro) => {
  for (const [id, title, caption] of tabs) {
    await page(`/unites/${unitId}?onglet=${id}`, `${intro} · ${title}`, caption);
  }
};

// ================================================================== tour
manifest.push({ kind: 'title', title: 'Aulia Care', subtitle: 'Démonstration des parcours patient et clinique sur les vraies interfaces — données fictives' });

// ------------------------------------------------------------ patient journey
chapter('Parcours patient · 1. Accueil', 'Réception : arrivée, enregistrement, admission et orientation');
await login('demo.reception', 'la réceptionniste');
await page('/reception', 'Tableau de bord de la réception', 'Vue du jour : arrivées, patients en attente, rendez-vous et orientations vers les services.');
await scrolled('Tableau de bord de la réception (suite)', 'Les files d’attente et les dernières admissions de la journée.');
await page('/reception/admission', 'Admission d’un patient', 'Enregistrement du patient : identité, contacts, type d’admission (particulier, abonné, assuré) et service demandé.');
await scrolled('Admission (suite)', 'Contacts familiaux, assurance ou abonnement d’entreprise, puis orientation.');
await page('/reception/patients', 'Registre des patients', 'Recherche d’un dossier unique : un patient n’a jamais deux dossiers.');
await page('/reception/rendez-vous', 'Rendez-vous', 'Planification des consultations et des examens.');
await page('/reception/services', 'Services', 'Choix du service qui accueillera le patient.');
await page('/reception/hospitalisations', 'Hospitalisations', 'Admissions en hospitalisation et attribution des lits.');
await page('/reception/abonnements', 'Abonnements d’entreprise', 'Employés couverts par l’abonnement de leur entreprise : leurs soins sont imputés au relevé mensuel.');
await page('/reception/historique', 'Historique de la réception', 'Trace de toutes les arrivées et orientations.');

chapter('Parcours patient · 2. Caisse', 'Facturation et paiement avant les soins et les examens');
await login('demo.caisse', 'le caissier');
await page('/caissier', 'Tableau de bord de la caisse', 'Factures en attente : consultation, laboratoire, imagerie, pharmacie.');
await page('/caissier/facturation', 'Facturation', 'Encaissement d’une facture ; le paiement libère l’examen ou la délivrance des médicaments.');
await page('/caissier/historique', 'Historique des paiements', 'Journal des encaissements de la journée.');

chapter('Parcours patient · 3. Soins infirmiers', 'Prise des constantes et suivi des patients');
await login('demo.infirmier', 'l’infirmier');
await page('/nurse', 'Tableau de bord infirmier', 'Patients à prendre en charge et constantes à relever avant la consultation.');
await page('/nurse/patients', 'Patients du service', 'Constantes, soins et transmissions par patient.');
await page('/nurse/rounds', 'Tournées de soins', 'Planification des soins et des administrations de traitement.');
await page('/nurse/hospitalized', 'Patients hospitalisés', 'Suivi des patients hospitalisés et administration des traitements.');

chapter('Parcours patient · 4. Consultation médicale', 'Le médecin examine, demande des examens et prescrit');
await login('demo.medecin', 'la médecin');
await page('/doctor/', 'Tableau de bord du médecin', 'Patients en attente de consultation, résultats reçus, alertes.');
await page('/doctor/patients', 'Mes patients', 'Accès au dossier unique de chaque patient.');
await page('/doctor/consultations', 'Consultations', 'Consultation structurée : motif, antécédents, examen clinique, diagnostic, plan de traitement.');
if (await clickText('Continuer', 'button') || await clickText('Ouvrir', 'button') || await clickText('Consulter', 'button')) {
  await shot('Espace de consultation', 'L’examen se déroule page par page ; la spécialité du médecin ajoute son examen spécifique.');
  await closeDialog();
}
await page('/doctor/drafts', 'Brouillons', 'Consultations commencées et non encore validées.');
await page('/doctor/exams', 'Examens demandés', 'Examens de laboratoire et d’imagerie demandés et leurs résultats.');
await page('/doctor/prescriptions', 'Prescriptions', 'Ordonnances contrôlées : allergies et interactions sont vérifiées avant validation.');
await page('/doctor/hospitalizations', 'Hospitalisations', 'Patients hospitalisés suivis par le médecin.');
await page('/doctor/surgery', 'Chirurgie', 'Demandes et suivis d’interventions.');

chapter('Parcours patient · 5. Laboratoire', 'Prélèvement, analyse, validation et rendu des résultats');
await login('demo.labo', 'le responsable du laboratoire');
await page('/laboratoire', 'Tableau de bord du laboratoire', 'Demandes reçues, prélèvements, analyses en cours et résultats à valider.');
await page('/laboratoire/activite', 'Activité du laboratoire', 'Suivi de chaque demande, du prélèvement au compte rendu.');
await page('/laboratoire/validations', 'Validations', 'Validation technique puis biologique avant la diffusion des résultats.');
await page('/laboratoire/catalogue', 'Catalogue des examens', 'Examens, paramètres et tarifs de l’établissement.');
await page('/laboratoire/techniciens', 'Techniciens', 'Répartition du travail entre les techniciens.');

chapter('Parcours patient · 6. Imagerie', 'Programmation, réalisation et compte rendu des examens d’imagerie');
await login('demo.radio', 'la radiologue');
await page('/radiologie', 'Tableau de bord de l’imagerie', 'Examens demandés, en attente de paiement, programmés ou réalisés.');
await page('/radiologie/file-attente', 'File d’attente', 'Patients prêts pour leur examen.');
await page('/radiologie/workflow', 'Déroulé des examens', 'Réalisation de l’examen et suivi de chaque étape.');
await page('/radiologie/planning', 'Planning', 'Programmation des salles et des appareils.');
await page('/radiologie/rapports', 'Comptes rendus', 'Rédaction, vérification et amendements des comptes rendus.');
await page('/radiologie/historique', 'Historique', 'Examens réalisés.');
await page('/radiologie/catalogue', 'Catalogue d’imagerie', 'Examens proposés et leurs tarifs.');
await page('/radiologie/equipements', 'Équipements', 'Appareils et salles d’imagerie.');

chapter('Parcours patient · 7. Pharmacie', 'Délivrance des médicaments prescrits et gestion du stock');
await login('demo.pharmacie', 'le pharmacien');
await page('/pharmacie', 'Tableau de bord de la pharmacie', 'Ordonnances à délivrer, alertes de stock et de péremption.');
await page('/pharmacie/delivrance', 'Délivrance', 'Délivrance de l’ordonnance payée, lot par lot.');
await page('/pharmacie/stock', 'Stock', 'Lots, dates de péremption, réapprovisionnement.');
await page('/pharmacie/securite', 'Sécurité des prescriptions', 'Règles d’interaction médicamenteuse, validées à quatre yeux.');
await page('/pharmacie/historique', 'Historique', 'Délivrances effectuées.');

chapter('Parcours patient · 8. Portail du patient', 'Le patient retrouve son dossier, ses résultats et ses traitements');
await login('demo.patient', 'le patient');
await page('/patient', 'Accueil du portail patient', 'Le patient voit ses prochains rendez-vous, ses résultats et ses traitements.');
await page('/dossier-medical', 'Dossier médical', 'Synthèse de son dossier médical.');
await page('/examens-resultats', 'Examens et résultats', 'Résultats de laboratoire et comptes rendus d’imagerie validés.');
await page('/traitements', 'Traitements', 'Ordonnances en cours.');
await page('/rendez-vous', 'Rendez-vous', 'Prise et suivi des rendez-vous.');
await page('/paiements', 'Paiements', 'Factures et paiements.');
await page('/historique-medical', 'Historique médical', 'Consultations et hospitalisations passées.');
await page('/suivi-quotidien', 'Suivi quotidien', 'Déclaration quotidienne de l’état de santé.');
await page('/hospitalisation', 'Hospitalisation', 'Suivi d’une hospitalisation en cours.');
await page('/montre-connectee', 'Montre connectée', 'Mesures transmises par la montre (couche Connected Care).');
await page('/enfants', 'Enfants', 'Dossiers des enfants rattachés au parent.');
await page('/profil-securite', 'Profil et sécurité', 'Changement de mot de passe et sécurité du compte.');

// ------------------------------------------------------------ clinical journey
chapter('Parcours clinique · Ambulance', 'De l’appel à la remise du patient aux urgences');
await login('demo.ambulancier', 'l’ambulancier');
await page('/unites', 'Mes unités de soins', 'Chaque soignant travaille dans les unités auxquelles il est affecté.');
await unitTabs(U.ambulance, [
  ['overview', 'Vue d’ensemble', 'Missions en cours, équipes et véhicules disponibles.'],
  ['calls', 'Appels & demandes', 'Réception et qualification de l’appel.'],
  ['dispatch', 'Dispatch', 'Engagement d’une équipe et d’un véhicule.'],
  ['missions', 'Interventions', 'Chaque étape horodatée, même hors connexion : appel, départ, arrivée sur place, transport, remise.'],
  ['patients', 'Patients transportés', 'Bilan prénospitalier du patient.'],
  ['teams', 'Équipes', 'Équipes de garde.'],
  ['vehicles', 'Véhicules', 'Disponibilité et maintenance des véhicules.'],
  ['equipment', 'Équipements', 'Matériel embarqué.'],
  ['transfers', 'Transmissions', 'Transmission structurée aux urgences : le patient garde un seul dossier.'],
  ['history', 'Historique', 'Missions terminées.'],
], 'Ambulance');

chapter('Parcours clinique · Urgences', 'Accueil, triage, soins, examens et orientation');
await login('demo.urgences', 'le médecin urgentiste');
// Live actions: exams asked of the laboratory and imaging, transfer to the operating theatre.
const lab = await api('POST', '/care-workflow/requests', { patientId: P.bravo, episodeId: EP.bravo, requesterUnitId: U.emergency, performerUnitId: U.laboratory, category: 'EXAMEN', code: 'DEMO-NFS', label: 'Numération formule sanguine', priority: 'URGENT', reason: 'Bilan de douleur thoracique' });
const rx = await api('POST', '/care-workflow/requests', { patientId: P.charlie, episodeId: EP.charlie, requesterUnitId: U.emergency, performerUnitId: U.imaging, category: 'EXAMEN', code: 'DEMO-RX-THORAX', label: 'Radiographie thoracique', priority: 'URGENT', reason: 'Dyspnée' });
const transfer = await api('POST', '/care-workflow/transfers', { patientId: P.delta, fromUnitId: U.emergency, fromEpisodeId: EP.delta, toUnitId: U.surgery, reason: 'Avis chirurgical pour traumatisme de la cheville', summary: { motif: 'Traumatisme de la cheville', constantes: 'Stables', traitements: 'Antalgique palier 1' } });
log(`   demandes : labo ${lab.status}, imagerie ${rx.status}, transfert ${transfer.status}`);
await unitTabs(U.emergency, [
  ['overview', 'Vue d’ensemble', 'Patients présents, délais d’attente selon le niveau de tri, box occupés.'],
  ['reception', 'Accueil', 'Arrivée du patient, même non identifié (identité provisoire fusionnée ensuite).'],
  ['triage', 'Triage', 'Niveau de tri choisi par le soignant selon l’échelle de l’établissement.'],
  ['waiting', 'Salle d’attente', 'Délais cibles par niveau de tri : les dépassements sont signalés.'],
  ['active', 'Patients en cours', 'Patients en soins, avec leur responsable et leur box.'],
], 'Urgences');
if (await clickText('Fictif Bravo')) {
  await shot('Urgences · Dossier du patient', 'Dossier de prise en charge : événements horodatés, demandes, résultats et transmissions.');
  await closeDialog();
}
await unitTabs(U.emergency, [
  ['boxes', 'Box & lits', 'Occupation des box et du déchocage.'],
  ['requests', 'Examens & demandes', 'Demandes envoyées au laboratoire et à l’imagerie, avec leur état et leurs résultats.'],
  ['care', 'Soins & traitements', 'Soins réalisés et traitements administrés.'],
  ['observations', 'Observations', 'Observations médicales et paramédicales.'],
  ['orientation', 'Orientation', 'Décision d’orientation obligatoire avant la clôture : sortie, hospitalisation, bloc, transfert.'],
  ['history', 'Historique', 'Passages terminés.'],
], 'Urgences');

chapter('Parcours clinique · Laboratoire (unité)', 'L’examen demandé par les urgences arrive comme une tâche');
await login('demo.labo', 'le responsable du laboratoire');
const labWork = await api('GET', `/care-workflow/units/${U.laboratory}/worklist`);
const labTask = labWork.data?.tasks?.find?.((task) => task.status === 'REQUESTED' || task.status === 'RECEIVED');
await unitTabs(U.laboratory, [['overview', 'Vue d’ensemble', 'Demande reçue des urgences, facturée au tarif du catalogue.'], ['tasks', 'Tâches', 'Le laboratoire accepte la demande puis saisit le résultat.']], 'Laboratoire');
if (labTask) {
  const accepted = await api('POST', `/care-workflow/tasks/${labTask.id}/status`, { version: labTask.version, status: 'ACCEPTED' });
  const result = await api('POST', `/care-workflow/tasks/${labTask.id}/result`, { version: accepted.data?.version, summary: 'Hyperleucocytose modérée', observations: [{ name: 'Leucocytes', value: '13,8', unit: 'G/L', referenceRange: '4-10', flag: 'HIGH' }, { name: 'Hémoglobine', value: '13,9', unit: 'g/dL', referenceRange: '13-17', flag: 'NORMAL' }], conclusion: 'Syndrome inflammatoire' });
  log(`   résultat labo : ${accepted.status} / ${result.status}`);
}
await page(`/unites/${U.laboratory}?onglet=history`, 'Laboratoire · Historique', 'Résultat transmis : il est aussi enregistré dans le module Laboratoire pour la validation biologique.');

chapter('Parcours clinique · Imagerie (unité)', 'La radiographie demandée par les urgences');
await login('demo.radio', 'la radiologue');
const imgWork = await api('GET', `/care-workflow/units/${U.imaging}/worklist`);
const imgTask = imgWork.data?.tasks?.find?.((task) => task.status === 'REQUESTED' || task.status === 'RECEIVED');
if (imgTask) await api('POST', `/care-workflow/tasks/${imgTask.id}/status`, { version: imgTask.version, status: 'ACCEPTED' });
await unitTabs(U.imaging, [['overview', 'Vue d’ensemble', 'Examen accepté : il apparaît aussi dans la file du module Imagerie.'], ['tasks', 'Tâches', 'Saisie du compte rendu, vérifié ensuite par le radiologue.']], 'Imagerie');

chapter('Parcours clinique · Retour aux urgences', 'Le résultat arrive dans le dossier du patient');
await login('demo.urgences', 'le médecin urgentiste');
await page(`/unites/${U.emergency}?onglet=requests`, 'Urgences · Résultat reçu', 'Le résultat du laboratoire est affiché dans la demande, valeurs anormales en évidence.');
if (await clickText('Fictif Bravo')) {
  await shot('Urgences · Dossier avec résultat', 'Résultat consulté, puis orientation du patient.');
  await closeDialog();
}

chapter('Parcours clinique · Bloc opératoire', 'De la demande opératoire aux suites postopératoires');
await login('demo.chirurgien', 'la chirurgienne');
await unitTabs(U.surgery, [
  ['overview', 'Vue d’ensemble', 'Interventions du jour, salles, transmissions reçues des urgences.'],
  ['requests', 'Demandes opératoires', 'Demandes et transferts reçus des autres unités.'],
  ['schedule', 'Programmation', 'Programmation des salles avec détection des conflits.'],
  ['preop', 'Préopératoire', 'Consultation préopératoire et préparation.'],
  ['record', 'Dossier opératoire', 'Dossier complet de l’intervention.'],
  ['theatre', 'Bloc opératoire', 'Étapes horodatées : entrée en salle, anesthésie, incision, fermeture, sortie.'],
  ['anesthesia', 'Anesthésie', 'Fiche d’anesthésie (ASA, Mallampati, surveillance).'],
  ['procedure', 'Intervention', 'Compte rendu opératoire.'],
  ['checklists', 'Checklists de sécurité', 'Check-list en 3 phases : chaque point est signé.'],
  ['recovery', 'Réveil & surveillance', 'Surveillance en salle de réveil.'],
  ['postop', 'Suites postopératoires', 'Suivi après l’intervention.'],
  ['implants', 'Matériel & implants', 'Traçabilité des implants.'],
  ['sterilization', 'Stérilisation & instruments', 'Boîtes d’instruments et stérilisation.'],
  ['reports', 'Rapports', 'Activité du bloc.'],
], 'Bloc');

chapter('Parcours clinique · Maternité', 'Grossesse, travail, accouchement et nouveau-né');
await login('demo.sagefemme', 'la sage-femme');
await unitTabs(U.maternity, [
  ['overview', 'Vue d’ensemble', 'Parturientes en travail, salles d’accouchement, nouveau-nés.'],
  ['prenatal', 'Consultations prénatales', 'Suivi de grossesse.'],
  ['pregnancies', 'Grossesses', 'Grossesses suivies : terme prévu, risques, groupe sanguin.'],
  ['admissions', 'Admissions', 'Admission en maternité.'],
  ['labour', 'Travail & accouchement', 'Suivi du travail et partogramme.'],
], 'Maternité');
if (await clickText('Voir la courbe', 'button') || await clickText('Partogramme', 'button')) {
  await shot('Maternité · Partogramme', 'Dilatation et rythme cardiaque fœtal, avec lignes d’alerte et d’action.');
  await closeDialog();
}
await unitTabs(U.maternity, [
  ['rooms', 'Salle d’accouchement', 'Occupation des salles.'],
  ['newborns', 'Nouveau-nés', 'Chaque nouveau-né reçoit son propre dossier, relié à celui de la mère.'],
  ['postpartum', 'Suites de couches', 'Surveillance après l’accouchement.'],
  ['neonatal', 'Soins néonatals', 'Soins du nouveau-né.'],
  ['discharge', 'Sorties & orientations', 'Sortie de la mère et de l’enfant.'],
  ['registers', 'Registres & statistiques', 'Registres légaux et statistiques, exportables.'],
], 'Maternité');

chapter('Parcours clinique · Dialyse', 'Prescription, planning et séance en 12 étapes');
await login('demo.nephro', 'le néphrologue');
await unitTabs(U.dialysis, [
  ['overview', 'Vue d’ensemble', 'Séances du jour, générateurs disponibles.'],
  ['patients', 'Patients', 'Patients suivis en dialyse.'],
  ['records', 'Dossiers', 'Historique de dialyse de chaque patient.'],
  ['planning', 'Planning', 'Planning hebdomadaire selon les jours et créneaux prescrits.'],
  ['sessions', 'Séances', 'Séance en 12 étapes ; la clôture exige les évaluations avant et après séance.'],
  ['monitoring', 'Surveillance', 'Relevés per-dialytiques.'],
], 'Dialyse');
if (await clickText('Courbes', 'button')) {
  await shot('Dialyse · Courbes de séance', 'Tension, débit sang et pression veineuse ; Aulia Care ne pilote jamais le générateur.');
  await closeDialog();
}
await unitTabs(U.dialysis, [
  ['prescriptions', 'Prescriptions', 'Prescription de dialyse ; la plus récente fait foi.'],
  ['machines', 'Machines', 'Générateurs et leur état.'],
  ['consumables', 'Consommables', 'Consommables par séance et réapprovisionnement auprès de la pharmacie.'],
  ['incidents', 'Incidents', 'Déclaration des incidents.'],
  ['maintenance', 'Maintenance', 'Journal de maintenance des générateurs.'],
  ['reports', 'Rapports', 'Activité et taux d’incidents.'],
], 'Dialyse');

// ------------------------------------------------------------ management
chapter('Pilotage · Finance', 'Trésorerie et budgets de l’établissement');
await login('demo.finance', 'la responsable financière');
await page('/finance', 'Tableau de bord financier', 'Recettes par pôle : consultations, laboratoire, imagerie, pharmacie, abonnements.');
await page('/finance/tresorerie', 'Trésorerie', 'Encaissements et décaissements.');
await page('/finance/budgets', 'Budgets', 'Suivi des budgets.');

chapter('Pilotage · Administration', 'Personnel, unités de soins et organisation');
await login('demo.admin', 'l’administrateur');
await page('/administration', 'Tableau de bord de l’administration', 'Vue d’ensemble de l’établissement.');
await page('/administration/personnel', 'Personnel', 'Création des comptes : code d’accès à 6 chiffres, spécialité médicale, demandes de mot de passe oublié.');
await page('/administration/unites-soins', 'Unités de soins', 'Création des unités, affectation des équipes et protocoles (validés par les cliniciens).');
await page('/administration/services', 'Services', 'Services et catégories.');
await page('/administration/departements', 'Départements', 'Départements et responsables.');
await page('/administration/salles', 'Salles et lits', 'Chambres et lits.');
await page('/administration/stock', 'Stock', 'Stock général.');
await page('/administration/rapports', 'Rapports', 'Rapports d’activité.');
await page('/administration/identite', 'Identité de l’établissement', 'Nom, logo et coordonnées.');

chapter('Pilotage · Super administration', 'Gouvernance de l’établissement');
await login('demo.superadmin', 'la super administratrice');
await page('/admin', 'Super administration', 'Administrateurs de l’établissement et leurs codes d’accès.');
await page('/admin/identite', 'Identité', 'Identité institutionnelle.');

manifest.push({ kind: 'title', title: 'Aulia Care', subtitle: 'Un seul dossier patient, des unités reliées, chaque acte tracé' });
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
log(`TERMINE : ${shotIndex} captures`);
ws.close();
browser.kill();
process.exit(0);
