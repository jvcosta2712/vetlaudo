import { describe, it, expect } from "vitest";
import { parseAIResponse } from "./parseAIResponse";

const BASE = {
  examDate: "01/01/2024",
  parameters: [
    { name: "WBC", value: "8.5", unit: "10^3/µL", refMin: "6.0", refMax: "17.0", status: "normal" },
  ],
  interpretation: "Hemograma dentro dos parâmetros normais.",
  recommendations: "Nenhuma ação necessária.",
};

function makeJSON(overrides?: Partial<typeof BASE>): string {
  return JSON.stringify({ ...BASE, ...overrides });
}

describe("parseAIResponse", () => {
  it("parseia JSON válido normalmente", () => {
    const result = parseAIResponse(makeJSON()) as typeof BASE;
    expect(result.examDate).toBe("01/01/2024");
    expect(result.parameters).toHaveLength(1);
  });

  it("ignora texto antes e depois do JSON", () => {
    const raw = `Aqui está o resultado:\n${makeJSON()}\nEspero que ajude.`;
    const result = parseAIResponse(raw) as typeof BASE;
    expect(result.examDate).toBe("01/01/2024");
  });

  it("remove bloco de código markdown ```json```", () => {
    const raw = "```json\n" + makeJSON() + "\n```";
    const result = parseAIResponse(raw) as typeof BASE;
    expect(result.parameters).toHaveLength(1);
  });

  it("corrige trailing comma no array de parâmetros", () => {
    const raw = `{"examDate":"01/01/2024","parameters":[{"name":"WBC","value":"8.5","unit":"10^3/µL","refMin":"6.0","refMax":"17.0","status":"normal"},],"interpretation":"ok","recommendations":"ok"}`;
    const result = parseAIResponse(raw) as typeof BASE;
    expect(result.parameters).toHaveLength(1);
  });

  it("corrige trailing comma no objeto raiz", () => {
    const raw = `{"examDate":"01/01/2024","parameters":[{"name":"WBC","value":"8.5","unit":"10^3/µL","refMin":"6.0","refMax":"17.0","status":"normal"}],"interpretation":"ok","recommendations":"ok",}`;
    const result = parseAIResponse(raw) as typeof BASE;
    expect(result.examDate).toBe("01/01/2024");
  });

  it("corrige newline literal na interpretation (causa do erro original)", () => {
    // O modelo às vezes gera quebras de linha dentro de strings JSON
    const raw = `{"examDate":"01/01/2024","parameters":[{"name":"WBC","value":"8.5","unit":"10^3/µL","refMin":"6.0","refMax":"17.0","status":"normal"}],"interpretation":"Linha um.\nLinha dois.","recommendations":"ok"}`;
    const result = parseAIResponse(raw) as typeof BASE;
    expect((result as any).interpretation).toContain("Linha um.");
    expect((result as any).interpretation).toContain("Linha dois.");
  });

  it("corrige newline literal nas recommendations", () => {
    const raw = `{"examDate":null,"parameters":[{"name":"WBC","value":"8.5","unit":"10^3/µL","refMin":"6.0","refMax":"17.0","status":"normal"}],"interpretation":"ok","recommendations":"Ponto 1.\nPonto 2.\nPonto 3."}`;
    const result = parseAIResponse(raw) as typeof BASE;
    expect((result as any).recommendations).toContain("Ponto 1.");
  });

  it("lida com examDate null", () => {
    const raw = makeJSON({ examDate: null as any });
    const result = parseAIResponse(raw) as typeof BASE;
    expect(result.examDate).toBeNull();
  });

  it("lida com múltiplos parâmetros (WBC até GR)", () => {
    const parameters = [
      { name: "WBC", value: "8.5",  unit: "10^3/µL",  refMin: "6.0",  refMax: "17.0",  status: "normal" },
      { name: "RBC", value: "6.2",  unit: "10^6/µL",  refMin: "5.5",  refMax: "8.5",   status: "normal" },
      { name: "HGB", value: "15.3", unit: "g/dL",      refMin: "12.1", refMax: "20.3",  status: "normal" },
      { name: "HCT", value: "45",   unit: "%",          refMin: "37",   refMax: "55",    status: "normal" },
      { name: "MCV", value: "68",   unit: "fL",         refMin: "60",   refMax: "77",    status: "normal" },
      { name: "MCHC",value: "34",   unit: "g/dL",      refMin: "32",   refMax: "36",    status: "normal" },
      { name: "PLT", value: "320",  unit: "10^3/µL",  refMin: "170",  refMax: "500",   status: "normal" },
      { name: "LY",  value: "2.5",  unit: "10^3/µL",  refMin: "1.0",  refMax: "4.8",   status: "normal" },
      { name: "MO",  value: "0.8",  unit: "10^3/µL",  refMin: "0.2",  refMax: "1.40",  status: "normal" },
      { name: "EO",  value: "0.3",  unit: "10^3/µL",  refMin: "0.1",  refMax: "1.30",  status: "normal" },
      { name: "GR",  value: "5.7",  unit: "10^3/µL",  refMin: "3.0",  refMax: "11.8",  status: "normal" },
    ];
    const raw = JSON.stringify({ examDate: "01/01/2024", parameters, interpretation: "ok", recommendations: "ok" });
    const result = parseAIResponse(raw) as any;
    expect(result.parameters).toHaveLength(11);
    expect(result.parameters[10].name).toBe("GR");
  });

  it("corrige PLT 4440 → 4.44 (erro de notação brasileira)", () => {
    const raw = JSON.stringify({
      ...BASE,
      parameters: [{ name: "PLT", value: "4440", unit: "10^3/µL", refMin: "170", refMax: "500", status: "high" }],
    });
    const result = parseAIResponse(raw) as any;
    expect(parseFloat(result.parameters[0].value)).toBe(4.44);
  });

  it("não altera PLT 440 (valor alto mas biologicamente possível)", () => {
    const raw = JSON.stringify({
      ...BASE,
      parameters: [{ name: "PLT", value: "440", unit: "10^3/µL", refMin: "170", refMax: "500", status: "normal" }],
    });
    const result = parseAIResponse(raw) as any;
    expect(parseFloat(result.parameters[0].value)).toBe(440);
  });

  it("lança erro quando não há JSON na resposta", () => {
    expect(() => parseAIResponse("Desculpe, não consegui ler a imagem.")).toThrow(
      "Nenhum JSON encontrado na resposta da IA"
    );
  });
});
