const SYSTEM_PROMPT = `Você é um extrator de dados de exames hematológicos veterinários. Sua única tarefa é ler os valores da imagem e retornar um JSON válido.

TABELA DE REFERÊNCIA — copie estes valores EXATOS para refMin, refMax e unit:

        refMin  refMax  unit
CÃO:
WBC      6.0    17.0   10^3/µL
RBC      5.5     8.5   10^6/µL
HGB     12.0    18.0   g/dL
HCT     37      55     %
MCV     60      77     fL
MCHC    32      36     g/dL
PLT    200     500     10^3/µL
LY       1.0     4.8   10^3/µL
MO       0.15    1.35  10^3/µL
EO       0.1     1.25  10^3/µL
GR       3.0    11.5   10^3/µL

GATO:
WBC      5.5    19.5   10^3/µL
RBC      5.0    10.0   10^6/µL
HGB      8.0    15.0   g/dL
HCT     24      45     %
MCV     39      55     fL
MCHC    30      36     g/dL
PLT    150     600     10^3/µL
LY       1.5     7.0   10^3/µL
MO       0.00    0.85  10^3/µL
EO       0.00    0.75  10^3/µL
GR       2.5    12.5   10^3/µL

REGRAS OBRIGATÓRIAS:
1. Retorne SOMENTE o JSON, sem texto antes ou depois, sem markdown, sem blocos de código.
2. Inclua APENAS estes parâmetros SE estiverem presentes na imagem: WBC, RBC, HGB, HCT, MCV, MCHC, PLT, LY, MO, EO, GR. NÃO inclua MCH. Pare no GR.
3. Para "value": copie o número exatamente como aparece na imagem.
4. Para "unit": use SEMPRE a unidade da coluna "unit" da tabela acima — NUNCA copie da imagem.
5. Para "refMin" e "refMax": use os valores da coluna correspondente da tabela acima.
6. Para "status": "high" se value > refMax, "low" se value < refMin, "normal" caso contrário.
7. Para "examDate": se houver uma data de coleta/exame visível na imagem, retorne-a como string "DD/MM/AAAA". Se não houver nenhuma data visível, retorne null. NUNCA invente uma data.
8. "interpretation" e "recommendations" em português do Brasil, com base nos valores encontrados.

Formato JSON:
{"examDate":"DD/MM/AAAA ou null","parameters":[{"name":"SIGLA","value":"valor lido","unit":"unidade da tabela","refMin":"min da tabela","refMax":"max da tabela","status":"normal|high|low"}],"interpretation":"texto em português","recommendations":"texto em português"}`

const INVOKE_URL = 'https://integrate.api.nvidia.com/v1/chat/completions'
const NVIDIA_API_KEY = import.meta.env.VITE_NVIDIA_API_KEY as string

type AnalysisPhase =
  | 'Lendo o exame...'
  | 'Extraindo parâmetros...'
  | 'Gerando interpretação clínica...'
  | 'Finalizando recomendações...'

type AnalysisState =
  | { status: 'idle' }
  | { status: 'loading'; phase: AnalysisPhase }
  | { status: 'done'; result: unknown; species: string }
  | { status: 'error'; message: string }

function saveState(state: AnalysisState): void {
  chrome.storage.session.set({ analysisState: state })
}

function detectPhase(text: string): AnalysisPhase {
  if (text.includes('"recommendations"')) return 'Finalizando recomendações...'
  if (text.includes('"interpretation"')) return 'Gerando interpretação clínica...'
  if (text.includes('"parameters"')) return 'Extraindo parâmetros...'
  return 'Lendo o exame...'
}

async function analyzeWithNvidia(
  imageBase64: string,
  mimeType: string,
  species: string,
  apiKey: string,
): Promise<string> {
  const speciesLabel = species === 'dog' ? 'cão' : 'gato'

  const response = await fetch(INVOKE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      model: 'meta/llama-3.2-11b-vision-instruct',
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Espécie: ${speciesLabel}. Leia os valores desta imagem e retorne o JSON.`,
            },
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${imageBase64}` },
            },
          ],
        },
      ],
      max_tokens: 1200,
      temperature: 0,
      top_p: 1,
      stream: true,
    }),
  })

  if (!response.ok) {
    const err = await response.text().catch(() => response.statusText)
    throw new Error(`NVIDIA API ${response.status}: ${err}`)
  }

  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let fullText = ''
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') continue
      try {
        const parsed = JSON.parse(data)
        const delta: string = parsed.choices?.[0]?.delta?.content ?? ''
        if (delta) {
          fullText += delta
          const phase = detectPhase(fullText)
          saveState({ status: 'loading', phase })
        }
      } catch { /* ignora chunks inválidos */ }
    }
  }

  if (!fullText) throw new Error('NVIDIA API retornou resposta vazia')

  const start = fullText.indexOf('{')
  const end = fullText.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('Nenhum JSON encontrado na resposta da IA')

  return fullText.slice(start, end + 1)
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'ANALYZE') return false
  handleAnalyze(message as { imageBase64: string; mimeType: string; species: string })
  sendResponse({})
  return false
})

async function handleAnalyze(message: {
  imageBase64: string
  mimeType: string
  species: string
}): Promise<void> {
  if (!NVIDIA_API_KEY) {
    saveState({ status: 'error', message: 'VITE_NVIDIA_API_KEY não definida no ambiente de build.' })
    return
  }

  saveState({ status: 'loading', phase: 'Lendo o exame...' })

  try {
    const text = await analyzeWithNvidia(
      message.imageBase64,
      message.mimeType,
      message.species,
      NVIDIA_API_KEY,
    )
    const result = JSON.parse(text)
    saveState({ status: 'done', result, species: message.species })
  } catch (err) {
    saveState({ status: 'error', message: err instanceof Error ? err.message : 'Erro desconhecido' })
  }
}
