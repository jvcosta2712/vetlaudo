import { jsonrepair } from "jsonrepair";

// Limites biológicos absolutos — valor acima disso é leitura errada da IA
const ABSOLUTE_MAX: Record<string, number> = {
  WBC:  120,
  RBC:   15,
  HGB:   25,
  HCT:   75,
  MCV:  150,
  MCHC:  45,
  PLT: 1500,
  LY:    50,
  MO:    10,
  EO:    15,
  GR:    80,
};

function sanitizeValue(name: unknown, raw: unknown): string {
  if (typeof raw !== "string" || typeof name !== "string") return String(raw ?? "");

  const num = parseFloat(raw);
  if (isNaN(num)) return raw;

  const max = ABSOLUTE_MAX[name.toUpperCase()];
  if (max === undefined) return raw;

  if (num > max) {
    const corrected = num / 1000;
    if (corrected <= max) return String(corrected);
  }

  return raw;
}

export function parseAIResponse(raw: string): unknown {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("Nenhum JSON encontrado na resposta da IA");
  }
  const extracted = raw.slice(start, end + 1);
  const parsed = JSON.parse(jsonrepair(extracted)) as Record<string, unknown>;

  if (!Array.isArray(parsed.parameters) || parsed.parameters.length === 0) {
    throw new Error("A IA não retornou parâmetros hematológicos. Tente com uma imagem mais nítida.");
  }

  parsed.parameters = (parsed.parameters as Array<Record<string, unknown>>).map((p) => ({
    ...p,
    value: sanitizeValue(p.name, p.value),
  }));

  return parsed;
}
