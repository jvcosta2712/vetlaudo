const SYSTEM_PROMPT = `Você é um patologista clínico veterinário. Analise a imagem do exame de sangue e retorne SOMENTE um JSON válido, sem nenhum texto adicional, sem markdown, sem blocos de código.

Formato exato do JSON:
{
  "examDate": "data do exame visível na imagem, ou null",
  "parameters": [
    {
      "name": "nome do parâmetro",
      "value": "valor encontrado na imagem",
      "unit": "unidade",
      "refMin": "mínimo de referência para a espécie",
      "refMax": "máximo de referência para a espécie",
      "status": "normal | high | low"
    }
  ],
  "interpretation": "interpretação clínica detalhada em português",
  "recommendations": "recomendações em português"
}

REGRAS OBRIGATÓRIAS:
- Inclua APENAS estes parâmetros (se presentes na imagem): WBC, RBC, HGB, HCT, MCV, MCHC, PLT, LY, MO, EO, GR
- NÃO inclua MCH em nenhuma hipótese
- Pare em GR — ignore qualquer parâmetro listado após GR na imagem
- Use os valores de referência corretos para a espécie informada (cão ou gato)
- Todo texto em português do Brasil`

const GEMINI_MODELS = [
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-2.5-flash',
]

async function analyzeWithGemini(
  imageBase64: string,
  mimeType: string,
  species: string,
  apiKey: string,
): Promise<string> {
  const speciesLabel = species === 'dog' ? 'cão' : 'gato'
  const prompt = `Espécie: ${speciesLabel}. Analise este exame e retorne o JSON conforme as instruções.`

  let lastError = ''

  for (const model of GEMINI_MODELS) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: mimeType, data: imageBase64 } },
              { text: `${SYSTEM_PROMPT}\n\n${prompt}` },
            ],
          }],
          generationConfig: { temperature: 0.1 },
        }),
      },
    )

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      lastError = (err as { error?: { message?: string } })?.error?.message ?? `Erro HTTP ${response.status}`
      continue
    }

    const data = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    if (!text) { lastError = `${model} retornou resposta vazia`; continue }

    return text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim()
  }

  throw new Error(`Gemini: ${lastError}`)
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'ANALYZE') return false

  handleAnalyze(message as { imageBase64: string; mimeType: string; species: string }, sendResponse)
  return true
})

async function handleAnalyze(
  message: { imageBase64: string; mimeType: string; species: string },
  sendResponse: (response: { data?: unknown; error?: string }) => void,
) {
  const { geminiApiKey } = await chrome.storage.local.get('geminiApiKey')

  if (!geminiApiKey) {
    sendResponse({ error: 'Chave de API não configurada. Clique com o botão direito na extensão → Opções.' })
    return
  }

  try {
    const text = await analyzeWithGemini(
      message.imageBase64,
      message.mimeType,
      message.species,
      geminiApiKey as string,
    )
    const parsed = JSON.parse(text)
    sendResponse({ data: parsed })
  } catch (err) {
    sendResponse({ error: err instanceof Error ? err.message : 'Erro desconhecido' })
  }
}
