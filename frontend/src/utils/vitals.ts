type VitalReading = { type: string; value: string | number; unit?: string | null };

const numberFrom = (value?: string | number | null) => Number(String(value ?? "").replace(",", ".").match(/\d+(?:\.\d+)?/)?.[0] || 0);

/** Computes BMI from the latest height/weight readings without persisting a derived clinical value. */
export function calculateBmi(vitals?: VitalReading[] | null): string | null {
  const weight = vitals?.find((vital) => vital.type === "WEIGHT" || vital.type === "WEIGHT_KG");
  const height = vitals?.find((vital) => vital.type === "HEIGHT" || vital.type === "HEIGHT_CM");
  const kilograms = numberFrom(weight?.value);
  const rawHeight = numberFrom(height?.value);
  const metres = rawHeight > 3 ? rawHeight / 100 : rawHeight;
  return kilograms > 0 && metres > 0 ? `${(kilograms / (metres ** 2)).toFixed(1)} kg/m²` : null;
}
