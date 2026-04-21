import express from 'express'

process.loadEnvFile()

const app = express()
app.use(express.json({ limit: '10mb' }))

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
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-001',
]

async function analyzeWithGemini(imageBase64: string, mimeType: string, species: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('Chave Gemini não configurada no .env')

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
      }
    )

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      lastError = (err as { error?: { message?: string } })?.error?.message ?? `Erro HTTP ${response.status}`
      console.warn(`Modelo ${model} falhou: ${lastError}`)
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

app.post('/api/analyze', async (req, res) => {
  const { imageBase64, mimeType, species } = req.body

  try {
    const text = await analyzeWithGemini(imageBase64, mimeType, species)

    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      console.error('Resposta não é JSON válido:\n', text)
      return res.status(500).json({ error: 'A IA retornou um formato inesperado. Tente novamente.' })
    }

    res.json(parsed)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido.'
    console.error('Erro:', message)
    res.status(500).json({ error: message })
  }
})

app.listen(3001, () => console.log('Server running on http://localhost:3001'))
