import { parseAIResponse } from "./parseAIResponse";

const SYSTEM_PROMPT = `Você é um extrator de dados de exames hematológicos veterinários. Sua única tarefa é ler os valores da imagem e retornar um JSON válido.

━━━ NOTAÇÃO NUMÉRICA BRASILEIRA ━━━
Laudos brasileiros usam ponto como separador de milhar e vírgula como decimal.
Exemplos de conversão obrigatória antes de registrar o valor:
  "4.440"  → 4.44     (ponto = milhar, portanto é 4 inteiros + 440 milésimos → 4.440 = 4,44)
  "444,0"  → 444.0
  "1.234,5" → 1234.5
  "0,85"   → 0.85
Sempre converta para notação com ponto decimal antes de escrever o "value" no JSON.

━━━ TABELA DE REFERÊNCIA ━━━
Use estes valores EXATOS para refMin, refMax e unit:

        refMin  refMax  unit
CÃO:
WBC      6.0    17.0   10^3/µL
RBC      5.5     8.5   10^6/µL
HGB     12.1    20.3   g/dL
HCT     37      55     %
MCV     60      77     fL
MCHC    32      36     g/dL
PLT    170     500     10^3/µL
LY       1.0     4.8   10^3/µL
MO       0.2    1.40   10^3/µL
EO       0.1     1.30  10^3/µL
GR       3.0    11.8   10^3/µL

GATO:
WBC      5.5    19.5   10^3/µL
RBC      5.0    10.0   10^6/µL
HGB      8.0    15.0   g/dL
HCT     24      45     %
MCV     39      55     fL
MCHC    30      36     g/dL
PLT    300     800     10^3/µL
LY       1.5     7.0   10^3/µL
MO       0.00    0.90  10^3/µL
EO       0.00    1.50  10^3/µL
GR       2.5    12.8   10^3/µL

━━━ LIMITES BIOLÓGICOS ABSOLUTOS ━━━
Se o valor lido ultrapassar estes limites, você cometeu erro de leitura — releia o número na imagem.

Parâmetro  Máximo absoluto
WBC        120    (10^3/µL)
RBC         15    (10^6/µL)
HGB         25    (g/dL)
HCT         75    (%)
MCV        150    (fL)
MCHC        45    (g/dL)
PLT       1500    (10^3/µL)  ← 4440, 2000, 1800 são leituras erradas
LY         50     (10^3/µL)
MO         10     (10^3/µL)
EO         15     (10^3/µL)
GR         80     (10^3/µL)

━━━ REGRAS OBRIGATÓRIAS ━━━
1. Retorne SOMENTE o JSON, sem texto antes ou depois, sem markdown, sem blocos de código.
2. Inclua APENAS estes parâmetros SE estiverem presentes na imagem: WBC, RBC, HGB, HCT, MCV, MCHC, PLT, LY, MO, EO, GR. NÃO inclua MCH. Pare no GR.
3. Para "value": aplique a conversão de notação brasileira e valide contra os limites biológicos acima.
4. Para "unit": use SEMPRE a unidade da tabela de referência — NUNCA copie da imagem.
5. Para "refMin" e "refMax": use os valores da tabela de referência.
6. Para "status": "high" se value > refMax, "low" se value < refMin, "normal" caso contrário.
7. Para "examDate": retorne a data de coleta/exame como "DD/MM/AAAA" se visível, caso contrário null. NUNCA invente uma data.
8. "interpretation" e "recommendations" em português do Brasil, com base nos valores encontrados.

Formato JSON:
{"examDate":"DD/MM/AAAA ou null","parameters":[{"name":"SIGLA","value":"valor convertido","unit":"unidade da tabela","refMin":"min da tabela","refMax":"max da tabela","status":"normal|high|low"}],"interpretation":"texto em português","recommendations":"texto em português"}`;

const INVOKE_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const NVIDIA_API_KEY = import.meta.env.VITE_NVIDIA_API_KEY as string | undefined;

type AnalysisPhase =
  | "Lendo o exame..."
  | "Extraindo parâmetros..."
  | "Gerando interpretação clínica..."
  | "Finalizando recomendações...";

type AnalysisState =
  | { status: "idle" }
  | { status: "loading"; phase: AnalysisPhase }
  | { status: "done"; result: unknown; species: string }
  | { status: "error"; message: string };

function saveState(state: AnalysisState): void {
  chrome.storage.session.set({ analysisState: state });
}

function detectPhase(text: string): AnalysisPhase {
  if (text.includes('"recommendations"')) return "Finalizando recomendações...";
  if (text.includes('"interpretation"')) return "Gerando interpretação clínica...";
  if (text.includes('"parameters"')) return "Extraindo parâmetros...";
  return "Lendo o exame...";
}

async function analyzeWithNvidia(
  imageBase64: string,
  mimeType: string,
  species: string,
  apiKey: string,
): Promise<string> {
  const speciesLabel = species === "dog" ? "cão" : "gato";

  const response = await fetch(INVOKE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      model: "meta/llama-3.2-11b-vision-instruct",
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Espécie: ${speciesLabel}. Leia os valores desta imagem e retorne o JSON.`,
            },
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${imageBase64}` },
            },
          ],
        },
      ],
      max_tokens: 2048,
      temperature: 0,
      stream: true,
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => response.statusText);
    throw new Error(`NVIDIA API ${response.status}: ${err}`);
  }

  if (!response.body) throw new Error("NVIDIA API não retornou stream");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";
  let currentPhase: AnalysisPhase = "Lendo o exame...";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      buffer += decoder.decode();
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data);
        const delta: string = parsed.choices?.[0]?.delta?.content ?? "";
        if (delta) {
          fullText += delta;
          const phase = detectPhase(fullText);
          if (phase !== currentPhase) {
            currentPhase = phase;
            saveState({ status: "loading", phase });
          }
        }
      } catch {
        /* ignora chunks inválidos */
      }
    }
  }

  if (!fullText) throw new Error("NVIDIA API retornou resposta vazia");

  return fullText;
}


chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "ANALYZE") return false;
  handleAnalyze(message as { imageBase64: string; mimeType: string; species: string });
  sendResponse({});
  return false;
});

async function handleAnalyze(message: {
  imageBase64: string;
  mimeType: string;
  species: string;
}): Promise<void> {
  if (!NVIDIA_API_KEY) {
    saveState({
      status: "error",
      message: "VITE_NVIDIA_API_KEY não definida no ambiente de build.",
    });
    return;
  }

  saveState({ status: "loading", phase: "Lendo o exame..." });

  try {
    const text = await analyzeWithNvidia(
      message.imageBase64,
      message.mimeType,
      message.species,
      NVIDIA_API_KEY,
    );
    const result = parseAIResponse(text);
    saveState({ status: "done", result, species: message.species });
  } catch (err) {
    saveState({
      status: "error",
      message: err instanceof Error ? err.message : "Erro desconhecido",
    });
  }
}
