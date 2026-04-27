const INVOKE_URL = 'https://integrate.api.nvidia.com/v1/chat/completions'
const NVIDIA_API_KEY = import.meta.env.VITE_NVIDIA_API_KEY as string

import REFERENCE_DATA from './reference.json'

type SpeciesKey = 'dog' | 'cat'
type ParamRef = { refMin: number; refMax: number; unit: string }
type ReferenceTable = Record<SpeciesKey, Record<string, ParamRef>>

const REFERENCE = REFERENCE_DATA as unknown as ReferenceTable

interface Parameter {
  name: string
  value: string
  unit: string
  refMin: string
  refMax: string
  status: 'normal' | 'high' | 'low'
}

/** Aplica a tabela de referência sobre os valores brutos lidos pela IA.
 *  status, unit, refMin e refMax são sempre calculados pelo código — nunca pela IA. */
function applyReference(raw: { name: string; value: string }[], species: string): Parameter[] {
  const refs = REFERENCE[(species as SpeciesKey) in REFERENCE ? (species as SpeciesKey) : 'dog']
  return raw
    .filter(p => p.name in refs)
    .map(p => {
      const ref = refs[p.name]
      const num = parseFloat(p.value.replace(/[^0-9.]/g, ''))
      const status: Parameter['status'] = isNaN(num)
        ? 'normal'
        : num > ref.refMax ? 'high'
        : num < ref.refMin ? 'low'
        : 'normal'
      return {
        name: p.name,
        value: p.value,
        unit: ref.unit,
        refMin: String(ref.refMin),
        refMax: String(ref.refMax),
        status,
      }
    })
}

// Chamada 1: a IA só precisa ler nome e valor numérico de cada parâmetro
const EXTRACTION_SYSTEM_PROMPT = `Você é um extrator de dados de exames hematológicos veterinários. Leia os valores da imagem e retorne SOMENTE o JSON, sem texto adicional, sem markdown.

REGRAS:
1. Inclua APENAS: WBC, RBC, HGB, HCT, MCV, MCHC, PLT, LY, MO, EO, GR (se presentes na imagem). Não inclua MCH.
2. "value": copie apenas o número, sem letras ou sufixos (ex: "19.5" e não "19.5H").
3. "examDate": data de coleta visível como "DD/MM/AAAA", ou null.

Formato: {"examDate":"DD/MM/AAAA ou null","parameters":[{"name":"SIGLA","value":"número"}]}`

// Chamada 2: gera interpretação e recomendações como texto puro (sem JSON)
const INTERPRETATION_SYSTEM_PROMPT = `Você é um médico veterinário especialista em hematologia. Receberá os parâmetros de um hemograma e deverá escrever uma análise clínica em português do Brasil.

Retorne EXATAMENTE neste formato, sem texto adicional:

INTERPRETAÇÃO:
[sua interpretação aqui]

RECOMENDAÇÕES:
[suas recomendações aqui]`

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

async function streamCompletion(
  messages: object[],
  maxTokens: number,
  onDelta: (text: string) => void,
): Promise<string> {
  const response = await fetch(INVOKE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${NVIDIA_API_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      model: 'meta/llama-3.2-11b-vision-instruct',
      messages,
      max_tokens: maxTokens,
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
        if (delta) { fullText += delta; onDelta(fullText) }
      } catch { /* ignora chunks inválidos */ }
    }
  }

  if (!fullText) throw new Error('NVIDIA API retornou resposta vazia')
  return fullText
}

/** Percorre o texto e coleta todos os objetos JSON completos dentro do array "parameters". */
function parseParamObjects(json: string): unknown[] {
  const bracket = json.indexOf('"parameters"')
  if (bracket === -1) return []
  const arrayOpen = json.indexOf('[', bracket)
  if (arrayOpen === -1) return []

  const objects: unknown[] = []
  let i = arrayOpen + 1

  while (i < json.length) {
    while (i < json.length && /[\s,]/.test(json[i])) i++
    if (json[i] !== '{') break

    let depth = 0, inStr = false, esc = false
    const objStart = i
    for (; i < json.length; i++) {
      const ch = json[i]
      if (esc) { esc = false; continue }
      if (ch === '\\') { esc = true; continue }
      if (ch === '"') { inStr = !inStr; continue }
      if (inStr) continue
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) {
          try { objects.push(JSON.parse(json.slice(objStart, i + 1))) } catch { /* skip */ }
          i++; break
        }
      }
    }
  }
  return objects
}

/** Faz o parse da resposta da extração, tolerando o fechamento incorreto do array pelo modelo. */
function parseExtractionResponse(raw: string): { examDate: string | null; parameters: unknown[] } {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('Nenhum JSON encontrado na extração de parâmetros')

  const json = raw.slice(start, end + 1)

  try {
    return JSON.parse(json) as { examDate: string | null; parameters: unknown[] }
  } catch { /* o modelo fechou o array com } em vez de ] — extrai as partes individualmente */ }

  const examDateMatch = json.match(/"examDate"\s*:\s*(null|"[^"]*")/)
  const examDate = examDateMatch
    ? (examDateMatch[1] === 'null' ? null : JSON.parse(examDateMatch[1]) as string)
    : null

  return { examDate, parameters: parseParamObjects(json) }
}

// Chamada 1: visão — extrai examDate + values brutos da imagem, aplica referência em código
async function extractParameters(
  imageBase64: string,
  mimeType: string,
  species: string,
): Promise<{ examDate: string | null; parameters: Parameter[] }> {
  saveState({ status: 'loading', phase: 'Lendo o exame...' })

  const speciesLabel = species === 'dog' ? 'cão' : 'gato'

  const text = await streamCompletion(
    [
      { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: `Espécie: ${speciesLabel}. Extraia os parâmetros desta imagem.` },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
        ],
      },
    ],
    600,
    () => saveState({ status: 'loading', phase: 'Extraindo parâmetros...' }),
  )

  const { examDate, parameters: raw } = parseExtractionResponse(text)
  // status, unit, refMin, refMax são sempre calculados pelo código — nunca pela IA
  return { examDate, parameters: applyReference(raw as { name: string; value: string }[], species) }
}

// Chamada 2: texto — gera interpretação e recomendações
async function generateInterpretation(
  parameters: Parameter[],
  species: string,
): Promise<{ interpretation: string; recommendations: string }> {
  saveState({ status: 'loading', phase: 'Gerando interpretação clínica...' })

  const speciesLabel = species === 'dog' ? 'Cão' : 'Gato'
  const table = (parameters as Parameter[])
    .map(p => `${p.name}: ${p.value} ${p.unit} (ref: ${p.refMin}–${p.refMax}) → ${p.status}`)
    .join('\n')

  const text = await streamCompletion(
    [
      { role: 'system', content: INTERPRETATION_SYSTEM_PROMPT },
      { role: 'user', content: `Espécie: ${speciesLabel}\n\nParâmetros:\n${table}` },
    ],
    1000,
    (accumulated) => {
      const phase: AnalysisPhase = accumulated.includes('RECOMENDAÇÕES')
        ? 'Finalizando recomendações...'
        : 'Gerando interpretação clínica...'
      saveState({ status: 'loading', phase })
    },
  )

  const interpMatch = text.match(/INTERPRETAÇÃO:\s*([\s\S]*?)(?=RECOMENDAÇÕES:|$)/)
  const recsMatch = text.match(/RECOMENDAÇÕES:\s*([\s\S]*)/)

  return {
    interpretation: interpMatch?.[1]?.trim() ?? text.trim(),
    recommendations: recsMatch?.[1]?.trim() ?? '',
  }
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

  try {
    const { examDate, parameters } = await extractParameters(
      message.imageBase64,
      message.mimeType,
      message.species,
    )

    const { interpretation, recommendations } = await generateInterpretation(
      parameters,
      message.species,
    )

    saveState({
      status: 'done',
      result: { examDate, parameters, interpretation, recommendations },
      species: message.species,
    })
  } catch (err) {
    saveState({ status: 'error', message: err instanceof Error ? err.message : 'Erro desconhecido' })
  }
}
