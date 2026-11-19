/**
 * Medical specialties offered when an administrator registers a doctor,
 * grouped as the establishment defined them. A specialty listed in several
 * groups keeps one primary group, which chooses the consultation form.
 * `template` names the consultation section set used by that group.
 */
export interface SpecialtyGroup { code: string; label: string; template: string; specialties: Array<{ label: string; domain: string }> }

export const MEDICAL_SPECIALTY_GROUPS: SpecialtyGroup[] = [
  { code: 'MEDICAL', label: "Spécialités médicales", template: 'GENERAL', specialties: [
    { label: "Médecine générale", domain: "Diagnostic, prévention et traitement des maladies courantes (généraliste)" },
    { label: "Médecine de famille", domain: "Prise en charge globale des patients et des familles" },
    { label: "Médecine interne", domain: "Maladies complexes touchant plusieurs organes" },
    { label: "Cardiologie", domain: "Cœur et système cardiovasculaire" },
    { label: "Pneumologie", domain: "Poumons et voies respiratoires" },
    { label: "Gastro-entérologie", domain: "Estomac, intestins et système digestif" },
    { label: "Hépatologie", domain: "Foie et voies biliaires" },
    { label: "Néphrologie", domain: "Reins et maladies rénales" },
    { label: "Endocrinologie", domain: "Glandes et hormones" },
    { label: "Diabétologie", domain: "Diabète et troubles métaboliques associés" },
    { label: "Rhumatologie", domain: "Articulations, os, muscles et maladies inflammatoires" },
    { label: "Hématologie", domain: "Sang et maladies du sang" },
    { label: "Oncologie médicale", domain: "Cancers et traitements médicamenteux" },
    { label: "Infectiologie", domain: "Maladies infectieuses" },
    { label: "Immunologie clinique", domain: "Système immunitaire et déficiences immunitaires" },
    { label: "Allergologie", domain: "Allergies et réactions allergiques" },
    { label: "Dermatologie", domain: "Peau, cheveux, ongles et muqueuses" },
    { label: "Neurologie", domain: "Cerveau, moelle épinière et nerfs" },
    { label: "Psychiatrie", domain: "Troubles mentaux et comportementaux" },
    { label: "Gériatrie", domain: "Santé des personnes âgées" },
    { label: "Médecine physique et de réadaptation", domain: "Récupération des fonctions après une maladie ou un traumatisme" },
    { label: "Médecine du sommeil", domain: "Troubles du sommeil" },
    { label: "Médecine palliative", domain: "Soulagement de la souffrance et accompagnement des maladies graves" },
    { label: "Médecine de la douleur", domain: "Douleurs aiguës et chroniques" },
    { label: "Médecine du sport", domain: "Santé et pathologies liées à l'activité physique" },
    { label: "Médecine tropicale", domain: "Maladies propres aux régions tropicales" },
    { label: "Médecine des addictions", domain: "Dépendances à l'alcool, aux drogues et autres substances" },
    { label: "Médecine de l'adolescent", domain: "Santé physique et psychologique des adolescents" },
    { label: "Médecine génétique", domain: "Maladies héréditaires et anomalies génétiques" },
    { label: "Médecine métabolique", domain: "Troubles du métabolisme" },
    { label: "Andrologie", domain: "Appareil reproducteur masculin et santé sexuelle masculine" },
    { label: "Médecine sexuelle", domain: "Troubles de la fonction sexuelle" },
    { label: "Médecine vasculaire", domain: "Artères, veines et circulation sanguine" },
    { label: "Toxicologie médicale", domain: "Effets des substances toxiques sur l'organisme" },
    { label: "Médecine environnementale", domain: "Effets de l'environnement sur la santé" },
  ] },
  { code: 'SURGICAL', label: "Spécialités chirurgicales", template: 'SURGICAL', specialties: [
    { label: "Chirurgie générale", domain: "Organes abdominaux et diverses pathologies chirurgicales" },
    { label: "Neurochirurgie", domain: "Cerveau, moelle épinière et nerfs" },
    { label: "Chirurgie cardiovasculaire", domain: "Cœur et gros vaisseaux" },
    { label: "Chirurgie thoracique", domain: "Poumons, thorax et médiastin" },
    { label: "Chirurgie vasculaire", domain: "Artères et veines" },
    { label: "Chirurgie orthopédique", domain: "Os, articulations et appareil locomoteur" },
    { label: "Traumatologie chirurgicale", domain: "Blessures et lésions traumatiques" },
    { label: "Chirurgie plastique", domain: "Reconstruction et modification des tissus" },
    { label: "Chirurgie esthétique", domain: "Amélioration de l'apparence physique" },
    { label: "Chirurgie maxillo-faciale", domain: "Mâchoire, visage et structures faciales" },
    { label: "Chirurgie pédiatrique", domain: "Opérations chez les enfants" },
    { label: "Chirurgie digestive", domain: "Estomac, intestins et appareil digestif" },
    { label: "Chirurgie hépatobiliaire", domain: "Foie, vésicule et voies biliaires" },
    { label: "Chirurgie pancréatique", domain: "Pancréas" },
    { label: "Chirurgie colorectale", domain: "Côlon, rectum et anus" },
    { label: "Urologie", domain: "Appareil urinaire et appareil reproducteur masculin" },
    { label: "Chirurgie gynécologique", domain: "Appareil reproducteur féminin" },
    { label: "Chirurgie oncologique", domain: "Ablation et traitement chirurgical des cancers" },
    { label: "Chirurgie endocrinienne", domain: "Thyroïde, parathyroïdes et glandes endocrines" },
    { label: "Chirurgie bariatrique", domain: "Traitement chirurgical de l'obésité" },
    { label: "Chirurgie de la main", domain: "Main, poignet et structures associées" },
    { label: "Chirurgie du rachis", domain: "Colonne vertébrale" },
    { label: "Chirurgie de transplantation", domain: "Greffe d'organes et de tissus" },
    { label: "Chirurgie colorectale et proctologie", domain: "Pathologies de la région anale et rectale" },
    { label: "Chirurgie mammaire", domain: "Sein et pathologies mammaires" },
    { label: "Chirurgie de la brûlure", domain: "Traitement chirurgical des brûlures" },
    { label: "Chirurgie de la base du crâne", domain: "Structures complexes à la base du cerveau" },
    { label: "Chirurgie pédiatrique cardiaque", domain: "Malformations et maladies cardiaques chez l'enfant" },
  ] },
  { code: 'WOMEN', label: "Femme, grossesse et reproduction", template: 'WOMEN', specialties: [
    { label: "Gynécologie", domain: "Santé de l'appareil reproducteur féminin" },
    { label: "Obstétrique", domain: "Grossesse et accouchement" },
    { label: "Gynécologie-obstétrique", domain: "Santé reproductive et maternité" },
    { label: "Médecine materno-fœtale", domain: "Grossesses à haut risque et santé du fœtus" },
    { label: "Médecine de la reproduction", domain: "Fertilité et reproduction humaine" },
    { label: "Endocrinologie de la reproduction", domain: "Hormones liées à la fertilité" },
    { label: "Médecine de l'infertilité", domain: "Difficultés de conception" },
    { label: "Néonatologie", domain: "Nouveau-nés, notamment prématurés ou malades" },
    { label: "Périnatalogie", domain: "Santé de la mère et de l'enfant autour de la naissance" },
    { label: "Gynécologie oncologique", domain: "Cancers de l'appareil reproducteur féminin" },
    { label: "Urogynécologie", domain: "Troubles urinaires et pelviens chez la femme" },
  ] },
  { code: 'PEDIATRIC', label: "Spécialités pédiatriques", template: 'PEDIATRIC', specialties: [
    { label: "Pédiatrie générale", domain: "Santé globale de l'enfant" },
    { label: "Néonatologie", domain: "Nouveau-nés" },
    { label: "Cardiologie pédiatrique", domain: "Cœur des enfants" },
    { label: "Neurologie pédiatrique", domain: "Système nerveux des enfants" },
    { label: "Endocrinologie pédiatrique", domain: "Hormones et croissance" },
    { label: "Gastro-entérologie pédiatrique", domain: "Système digestif des enfants" },
    { label: "Pneumologie pédiatrique", domain: "Maladies respiratoires infantiles" },
    { label: "Néphrologie pédiatrique", domain: "Reins des enfants" },
    { label: "Hématologie pédiatrique", domain: "Maladies du sang chez l'enfant" },
    { label: "Oncologie pédiatrique", domain: "Cancers infantiles" },
    { label: "Rhumatologie pédiatrique", domain: "Maladies articulaires et inflammatoires" },
    { label: "Infectiologie pédiatrique", domain: "Infections chez les enfants" },
    { label: "Immunologie pédiatrique", domain: "Défenses immunitaires de l'enfant" },
    { label: "Dermatologie pédiatrique", domain: "Maladies de la peau chez l'enfant" },
    { label: "Psychiatrie infanto-juvénile", domain: "Troubles psychiques de l'enfant et de l'adolescent" },
    { label: "Pédopsychiatrie du développement", domain: "Troubles du développement et du comportement" },
    { label: "Médecine de l'adolescence", domain: "Santé des adolescents" },
    { label: "Génétique pédiatrique", domain: "Maladies génétiques chez l'enfant" },
    { label: "Réanimation pédiatrique", domain: "Soins intensifs chez l'enfant" },
    { label: "Chirurgie pédiatrique", domain: "Interventions chirurgicales infantiles" },
  ] },
  { code: 'NEURO', label: "Cerveau, système nerveux et comportement", template: 'NEURO', specialties: [
    { label: "Neurologie", domain: "Maladies du système nerveux" },
    { label: "Neurochirurgie", domain: "Traitement chirurgical du système nerveux" },
    { label: "Neurosciences cliniques", domain: "Fonctionnement du système nerveux en médecine" },
    { label: "Neurophysiologie clinique", domain: "Activité électrique et fonctionnement nerveux" },
    { label: "Électroencéphalographie (EEG)", domain: "Activité électrique cérébrale" },
    { label: "Électromyographie (EMG)", domain: "Fonctionnement des muscles et des nerfs périphériques" },
    { label: "Épileptologie", domain: "Épilepsie et crises épileptiques" },
    { label: "Neuro-oncologie", domain: "Tumeurs du système nerveux" },
    { label: "Neurologie vasculaire", domain: "AVC et maladies vasculaires cérébrales" },
    { label: "Neuro-immunologie", domain: "Maladies immunitaires du système nerveux" },
    { label: "Neurogénétique", domain: "Maladies génétiques neurologiques" },
    { label: "Neuropsychologie", domain: "Relations entre cerveau et fonctions cognitives" },
    { label: "Psychiatrie", domain: "Troubles psychiques" },
    { label: "Psychiatrie biologique", domain: "Bases biologiques des troubles psychiatriques" },
    { label: "Psychiatrie légale", domain: "Troubles psychiatriques et questions judiciaires" },
    { label: "Psychiatrie de l'enfant", domain: "Santé mentale infantile" },
    { label: "Médecine du sommeil", domain: "Mécanismes et troubles du sommeil" },
    { label: "Médecine de la douleur", domain: "Mécanismes et traitements de la douleur" },
    { label: "Médecine de réadaptation neurologique", domain: "Récupération après des lésions neurologiques" },
    { label: "Neuro-réhabilitation", domain: "Récupération des fonctions motrices et cognitives" },
  ] },
  { code: 'SENSORY', label: "Organes sensoriels et communication", template: 'SENSORY', specialties: [
    { label: "Ophtalmologie", domain: "Yeux et vision" },
    { label: "Neuro-ophtalmologie", domain: "Relations entre système nerveux et vision" },
    { label: "Chirurgie ophtalmologique", domain: "Opérations des yeux" },
    { label: "Otologie", domain: "Oreille" },
    { label: "Oto-rhino-laryngologie (ORL)", domain: "Oreilles, nez et gorge" },
    { label: "Otoneurologie", domain: "Troubles de l'équilibre et de l'oreille interne" },
    { label: "Audiologie médicale", domain: "Audition" },
    { label: "Rhinologie", domain: "Nez et sinus" },
    { label: "Laryngologie", domain: "Larynx et voix" },
    { label: "Phoniatrie", domain: "Troubles de la voix, de la parole et de la déglutition" },
  ] },
  { code: 'DENTAL', label: "Bouche, dents et visage", template: 'DENTAL', specialties: [
    { label: "Odontologie", domain: "Dents et santé bucco-dentaire" },
    { label: "Chirurgie dentaire", domain: "Interventions sur les dents" },
    { label: "Orthodontie", domain: "Alignement des dents et mâchoires" },
    { label: "Endodontie", domain: "Pulpe dentaire et traitements des canaux" },
    { label: "Parodontologie", domain: "Gencives et tissus de soutien des dents" },
    { label: "Implantologie", domain: "Implants dentaires" },
    { label: "Prothèse dentaire", domain: "Remplacement des dents manquantes" },
    { label: "Odontologie pédiatrique", domain: "Santé dentaire des enfants" },
    { label: "Médecine buccale", domain: "Maladies de la bouche" },
    { label: "Chirurgie orale", domain: "Interventions chirurgicales dans la cavité buccale" },
    { label: "Chirurgie maxillo-faciale", domain: "Chirurgie du visage et des mâchoires" },
  ] },
  { code: 'PREVENTION', label: "Prévention, environnement et santé publique", template: 'PREVENTION', specialties: [
    { label: "Santé publique", domain: "Santé des populations" },
    { label: "Épidémiologie", domain: "Distribution et causes des maladies" },
    { label: "Médecine préventive", domain: "Prévention des maladies" },
    { label: "Médecine du travail", domain: "Santé des travailleurs" },
    { label: "Médecine environnementale", domain: "Conséquences sanitaires de l'environnement" },
    { label: "Médecine communautaire", domain: "Santé des communautés" },
    { label: "Médecine scolaire", domain: "Santé des élèves" },
    { label: "Médecine militaire", domain: "Santé des militaires" },
    { label: "Médecine aéronautique", domain: "Santé dans l'aviation" },
    { label: "Médecine spatiale", domain: "Santé dans l'environnement spatial" },
    { label: "Médecine légale", domain: "Application de la médecine aux questions judiciaires" },
    { label: "Médecine pénitentiaire", domain: "Santé des personnes détenues" },
    { label: "Médecine humanitaire", domain: "Prise en charge dans les crises humanitaires" },
    { label: "Médecine des voyages", domain: "Prévention des risques sanitaires liés aux voyages" },
    { label: "Médecine nutritionnelle", domain: "Nutrition et santé" },
    { label: "Médecine tropicale", domain: "Prévention et traitement des maladies tropicales" },
    { label: "Médecine des populations", domain: "Étude de la santé à l'échelle populationnelle" },
    { label: "Économie de la santé", domain: "Analyse économique des systèmes de santé" },
  ] },
  { code: 'CRITICAL', label: "Urgence, anesthésie et soins intensifs", template: 'CRITICAL', specialties: [
    { label: "Médecine d'urgence", domain: "Situations médicales nécessitant une prise en charge rapide" },
    { label: "Anesthésiologie", domain: "Anesthésie et surveillance pendant les interventions" },
    { label: "Réanimation médicale", domain: "Prise en charge des défaillances vitales" },
    { label: "Médecine intensive", domain: "Patients en état critique" },
    { label: "Réanimation chirurgicale", domain: "Soins intensifs après une intervention chirurgicale" },
    { label: "Réanimation pédiatrique", domain: "Enfants en état critique" },
    { label: "Réanimation néonatale", domain: "Nouveau-nés en état critique" },
    { label: "Médecine préhospitalière", domain: "Soins médicaux avant l'arrivée à l'hôpital" },
    { label: "Médecine de catastrophe", domain: "Gestion médicale des catastrophes" },
    { label: "Médecine hyperbare", domain: "Traitements par oxygène sous pression" },
    { label: "Médecine de plongée", domain: "Effets physiologiques et accidents de la plongée" },
    { label: "Médecine toxicologique", domain: "Intoxications aiguës et urgences toxiques" },
  ] },
];

const PRIMARY_GROUP: Record<string, string> = {"Neurologie": "NEURO", "Psychiatrie": "NEURO", "Médecine du sommeil": "NEURO", "Médecine de la douleur": "NEURO", "Néonatologie": "PEDIATRIC", "Chirurgie pédiatrique": "SURGICAL", "Neurochirurgie": "SURGICAL", "Chirurgie maxillo-faciale": "DENTAL", "Réanimation pédiatrique": "CRITICAL", "Médecine tropicale": "MEDICAL", "Médecine environnementale": "MEDICAL"};

const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, "'").trim();
const index = new Map<string, { label: string; groupCode: string; template: string }>();
for (const group of MEDICAL_SPECIALTY_GROUPS) {
  for (const specialty of group.specialties) {
    const key = normalize(specialty.label);
    if (index.has(key)) continue;
    const groupCode = PRIMARY_GROUP[specialty.label] ?? group.code;
    const owner = MEDICAL_SPECIALTY_GROUPS.find((item) => item.code === groupCode)!;
    index.set(key, { label: specialty.label, groupCode, template: owner.template });
  }
}

/** Roles whose "Spécialité" is a medical specialty chosen from this list. */
export const SPECIALTY_ROLES = new Set(['PHYSICIAN', 'SURGEON', 'ANESTHESIOLOGIST']);

export function findSpecialty(value?: string | null) {
  if (!value) return null;
  return index.get(normalize(value)) ?? null;
}

/** Specialties whose doctors work from the care units (emergency, anaesthesia, intensive care). */
export const isUnitBasedSpecialty = (value?: string | null) => findSpecialty(value)?.groupCode === 'CRITICAL';
