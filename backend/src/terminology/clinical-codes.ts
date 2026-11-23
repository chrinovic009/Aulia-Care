/** Standard terminologies supported by Aulia Care. */
export const CODE_SYSTEMS = ['ICD10', 'LOINC'] as const;
export type CodeSystem = (typeof CODE_SYSTEMS)[number];

const FORMATS: Record<CodeSystem, RegExp> = {
  // ICD-10 (WHO): letter, two digits, optional dot and one or two characters (A09, B50.9, S82.60).
  ICD10: /^[A-Z][0-9]{2}(\.[0-9A-Z]{1,2})?$/,
  // LOINC: up to seven digits, hyphen, check digit (718-7, 2345-7).
  LOINC: /^[0-9]{1,7}-[0-9]$/,
};

/** ICD-10 chapters (roman numerals) are kept to group statistics; they are not codable diagnoses. */
const ICD10_CHAPTER = /^(X{0,2}(IX|IV|V?I{0,3}))$/;

export function normalizeCode(system: CodeSystem, raw: string) {
  const value = raw.trim().toUpperCase().replace(/\s+/g, '');
  return system === 'ICD10' && /^[A-Z][0-9]{3,4}$/.test(value) ? `${value.slice(0, 3)}.${value.slice(3)}` : value;
}

export function isValidCode(system: CodeSystem, code: string, allowChapter = false) {
  if (allowChapter && system === 'ICD10' && ICD10_CHAPTER.test(code) && code.length > 0) return true;
  return FORMATS[system].test(code);
}

/** LOINC check digit (mod 10, as published by Regenstrief). */
export function loincCheckDigitValid(code: string) {
  const match = /^([0-9]{1,7})-([0-9])$/.exec(code);
  if (!match) return false;
  const digits = match[1].split('').reverse().map(Number);
  let sum = 0;
  digits.forEach((digit, index) => {
    if (index % 2 === 0) {
      const doubled = digit * 2;
      sum += doubled > 9 ? doubled - 9 : doubled;
    } else {
      sum += digit;
    }
  });
  return (10 - (sum % 10)) % 10 === Number(match[2]);
}

/** ICD-10 chapter of a code, from its first letter and number (WHO ranges). */
export function icd10Chapter(code: string): string | null {
  const match = /^([A-Z])([0-9]{2})/.exec(code);
  if (!match) return null;
  const letter = match[1];
  const n = Number(match[2]);
  const ranges: Array<[string, number, string, number, string]> = [
    ['A', 0, 'B', 99, 'I'], ['C', 0, 'D', 48, 'II'], ['D', 50, 'D', 89, 'III'], ['E', 0, 'E', 90, 'IV'], ['F', 0, 'F', 99, 'V'],
    ['G', 0, 'G', 99, 'VI'], ['H', 0, 'H', 59, 'VII'], ['H', 60, 'H', 95, 'VIII'], ['I', 0, 'I', 99, 'IX'], ['J', 0, 'J', 99, 'X'],
    ['K', 0, 'K', 93, 'XI'], ['L', 0, 'L', 99, 'XII'], ['M', 0, 'M', 99, 'XIII'], ['N', 0, 'N', 99, 'XIV'], ['O', 0, 'O', 99, 'XV'],
    ['P', 0, 'P', 96, 'XVI'], ['Q', 0, 'Q', 99, 'XVII'], ['R', 0, 'R', 99, 'XVIII'], ['S', 0, 'T', 98, 'XIX'], ['V', 1, 'Y', 98, 'XX'],
    ['Z', 0, 'Z', 99, 'XXI'], ['U', 0, 'U', 85, 'XXII'],
  ];
  const key = (l: string, num: number) => l.charCodeAt(0) * 100 + num;
  const value = key(letter, n);
  const found = ranges.find(([l1, n1, l2, n2]) => value >= key(l1, n1) && value <= key(l2, n2));
  return found ? found[4] : null;
}

/** Parses an import file: one code per line, "code;libellé[;code parent]" (UTF-8, ; or tab). */
export function parseCodeFile(system: CodeSystem, text: string) {
  const accepted: Array<{ code: string; display: string; parentCode: string | null }> = [];
  const rejected: Array<{ line: number; reason: string }> = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const lineText = raw.replace(/^\uFEFF/, '').trim();
    if (!lineText || lineText.startsWith('#')) return;
    const [rawCode = '', display = '', parent = ''] = lineText.split(/;|\t/).map((part) => part.trim().replace(/^"|"$/g, ''));
    const code = normalizeCode(system, rawCode);
    if (index === 0 && !isValidCode(system, code, true) && /code/i.test(rawCode)) return; // header line
    if (!isValidCode(system, code, system === 'ICD10')) { rejected.push({ line: index + 1, reason: `Code ${system} invalide : « ${rawCode} »` }); return; }
    if (system === 'LOINC' && !loincCheckDigitValid(code)) { rejected.push({ line: index + 1, reason: `Chiffre de contrôle LOINC incorrect : « ${rawCode} »` }); return; }
    if (display.length < 2) { rejected.push({ line: index + 1, reason: 'Libellé manquant' }); return; }
    accepted.push({ code, display: display.slice(0, 500), parentCode: parent ? normalizeCode(system, parent) : null });
  });
  return { accepted, rejected };
}
