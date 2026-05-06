import { useEffect, useRef, useState } from 'react'

type Species = 'dog' | 'cat'

interface Parameter {
  name: string
  value: string
  unit: string
  refMin: string
  refMax: string
  status: 'normal' | 'high' | 'low'
}

interface AnalysisResult {
  examDate: string | null
  parameters: Parameter[]
  interpretation: string
  recommendations: string
}

interface PatientInfo {
  paciente: string
  sexo: string
  proprietario: string
  medico: string
  clinica: string
  idade: string
  raca: string
  dataEntrada: string
  protocolo: string
}

const emptyInfo: PatientInfo = {
  paciente: '',
  sexo: '',
  proprietario: '',
  medico: '',
  clinica: '',
  idade: '',
  raca: '',
  dataEntrada: '',
  protocolo: '',
}

function buildReportElement(result: AnalysisResult, species: Species, info: PatientInfo): HTMLElement {
  const speciesLabel = species === 'dog' ? 'Canino' : 'Felino'
  const date = result.examDate ?? 'Não identificada'
  const generatedAt = new Date().toLocaleString('pt-BR')

  const statusCell = (p: Parameter) => {
    if (p.status === 'high') return `<span style="color:#dc3545;font-weight:bold;">Alto ▲</span>`
    if (p.status === 'low') return `<span style="color:#fd7e14;font-weight:bold;">Baixo ▼</span>`
    return `<span style="color:#198754;">Normal</span>`
  }

  const rows = (result.parameters ?? []).map(p => `
    <tr style="background:${p.status !== 'normal' ? '#fff8f8' : 'transparent'};">
      <td style="padding:8px 12px;font-weight:600;border-bottom:1px solid #e8f4ff;">${p.name}</td>
      <td style="padding:8px 12px;font-weight:${p.status !== 'normal' ? 'bold' : 'normal'};color:${p.status === 'high' ? '#dc3545' : p.status === 'low' ? '#fd7e14' : 'inherit'};border-bottom:1px solid #e8f4ff;">${p.value}</td>
      <td style="padding:8px 12px;color:#666;border-bottom:1px solid #e8f4ff;">${p.unit}</td>
      <td style="padding:8px 12px;color:#666;border-bottom:1px solid #e8f4ff;">${p.refMin} – ${p.refMax}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e8f4ff;">${statusCell(p)}</td>
    </tr>`).join('')

  const cell = (label: string, value: string) =>
    `<span style="font-size:13px;color:#555;"><strong style="color:#1a1a2e;">${label}:</strong> ${value || '—'}</span>`

  const el = document.createElement('div')
  el.style.cssText = 'font-family:Arial,sans-serif;color:#1a1a2e;background:#fff;padding:32px;width:100%;'
  el.innerHTML = `
    <div style="border-bottom:3px solid #1E90FF;padding-bottom:16px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-end;">
      <div>
        <div style="color:#1E90FF;font-size:24px;font-weight:bold;">VetLaudo</div>
        <div style="color:#888;font-size:12px;margin-top:4px;">Laudo Hematológico Veterinário</div>
      </div>
      <div style="text-align:right;font-size:12px;color:#888;">Gerado em: ${generatedAt}</div>
    </div>

    <div style="background:#F0F8FF;border-radius:8px;padding:14px 16px;margin-bottom:20px;">
      <div style="display:flex;flex-wrap:wrap;gap:10px 32px;margin-bottom:10px;">
        ${cell('Paciente', info.paciente)}
        ${cell('Espécie', speciesLabel)}
        ${cell('Raça', info.raca)}
        ${cell('Data de entrada', info.dataEntrada || date)}
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:10px 32px;margin-bottom:${info.medico || info.clinica ? '10px' : '0'};">
        ${cell('Sexo(M) (F)', info.sexo)}
        ${cell('Idade', info.idade)}
        ${cell('Proprietário', info.proprietario)}
        ${cell('Protocolo', info.protocolo)}
      </div>
      ${info.medico || info.clinica ? `
      <div style="display:flex;flex-wrap:wrap;gap:10px 32px;">
        ${info.medico ? cell('Médico Veterinário', info.medico) : ''}
        ${info.clinica ? cell('Clínica Veterinária', info.clinica) : ''}
      </div>` : ''}
    </div>

    <div style="color:#1E90FF;font-size:15px;font-weight:bold;margin:0 0 10px;padding-bottom:8px;border-bottom:2px solid #e8f4ff;">Parâmetros Analisados</div>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">
      <thead>
        <tr style="background:#1E90FF;color:white;">
          <td style="padding:10px 12px;font-weight:600;">Parâmetro</td>
          <td style="padding:10px 12px;font-weight:600;">Valor</td>
          <td style="padding:10px 12px;font-weight:600;">Unidade</td>
          <td style="padding:10px 12px;font-weight:600;">Referência</td>
          <td style="padding:10px 12px;font-weight:600;">Status</td>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div style="color:#1E90FF;font-size:15px;font-weight:bold;margin:0 0 10px;padding-bottom:8px;border-bottom:2px solid #e8f4ff;">Interpretação Clínica</div>
    <p style="font-size:14px;line-height:1.8;color:#333;white-space:pre-line;margin-bottom:20px;">${result.interpretation}</p>

    <div style="color:#1E90FF;font-size:15px;font-weight:bold;margin:0 0 10px;padding-bottom:8px;border-bottom:2px solid #e8f4ff;">Recomendações</div>
    <p style="font-size:14px;line-height:1.8;color:#333;white-space:pre-line;margin-bottom:32px;">${result.recommendations}</p>

    <div style="text-align:center;font-size:11px;color:#aaa;border-top:1px solid #eee;padding-top:12px;">
      Este laudo não substitui a avaliação clínica presencial de um médico veterinário.
    </div>
  `
  return el
}

type AnalysisState =
  | { status: 'idle' }
  | { status: 'loading'; phase: string }
  | { status: 'done'; result: AnalysisResult; species: Species }
  | { status: 'error'; message: string }

async function generatePdf(result: AnalysisResult, species: Species, info: PatientInfo): Promise<void> {
  const el = buildReportElement(result, species, info)
  document.body.appendChild(el)
  try {
    const html2pdf = (await import('html2pdf.js')).default
    const filename = `VetLaudo_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.pdf`

    const blob: Blob = await html2pdf().set({
      margin: 12,
      filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    }).from(el).output('blob')

    const url = URL.createObjectURL(blob)

    await new Promise<void>((resolve, reject) => {
      chrome.downloads.download(
        {
          url,
          filename: `LaudoVet/${filename}`,
          saveAs: false,
          conflictAction: 'uniquify',
        },
        (downloadId) => {
          URL.revokeObjectURL(url)
          if (chrome.runtime.lastError || downloadId === undefined) {
            reject(new Error(chrome.runtime.lastError?.message ?? 'Falha ao iniciar download'))
          } else {
            resolve()
          }
        },
      )
    })
  } finally {
    document.body.removeChild(el)
  }
}

function getStoredInfo(): Promise<PatientInfo> {
  return new Promise(resolve =>
    chrome.storage.session.get(['patientInfo'], r =>
      resolve((r.patientInfo as PatientInfo | undefined) ?? emptyInfo)
    )
  )
}

export default function Home() {
  const [species, setSpecies] = useState<Species>('dog')
  const [info, setInfo] = useState<PatientInfo>(emptyInfo)
  const [imageBase64, setImageBase64] = useState('')
  const [imageMimeType, setImageMimeType] = useState('image/jpeg')
  const [imagePreview, setImagePreview] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingPhase, setLoadingPhase] = useState('Lendo o exame...')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function setField(field: keyof PatientInfo, value: string) {
    setInfo(prev => ({ ...prev, [field]: value }))
  }

  useEffect(() => {
    chrome.storage.session.get(['analysisState'], async (stored) => {
      const state = stored.analysisState as AnalysisState | undefined
      if (!state || state.status === 'idle') return

      if (state.status === 'loading') {
        setLoading(true)
        setLoadingPhase(state.phase)
      } else if (state.status === 'done') {
        const storedInfo = await getStoredInfo()
        await generatePdf(state.result, state.species, storedInfo).catch(() => {})
        chrome.storage.session.remove(['analysisState'])
      } else if (state.status === 'error') {
        setError(state.message)
        chrome.storage.session.remove(['analysisState'])
      }
    })

    const onStorageChanged = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string,
    ) => {
      if (area !== 'session' || !changes.analysisState) return
      const state = changes.analysisState.newValue as AnalysisState | undefined
      if (!state) return

      if (state.status === 'loading') {
        setLoading(true)
        setLoadingPhase(state.phase)
      } else if (state.status === 'done') {
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        setLoadingPhase('Gerando PDF...')
        getStoredInfo().then(storedInfo =>
          generatePdf(state.result, state.species, storedInfo)
            .then(() => {
              setLoading(false)
              setSuccess('PDF gerado e salvo em Downloads/LaudoVet/ ✓')
            })
            .catch((err) => {
              setLoading(false)
              setError(err instanceof Error ? err.message : 'Erro ao gerar PDF.')
            })
        )
        chrome.storage.session.remove(['analysisState'])
      } else if (state.status === 'error') {
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        setLoading(false)
        setError(state.message)
        chrome.storage.session.remove(['analysisState'])
      }
    }

    chrome.storage.onChanged.addListener(onStorageChanged)
    return () => chrome.storage.onChanged.removeListener(onStorageChanged)
  }, [])

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('O arquivo selecionado não é uma imagem.'); return }
    if (file.size > 5 * 1024 * 1024) { setError('A imagem deve ter menos de 5 MB.'); return }
    setError('')
    const reader = new FileReader()
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string
      const [header, data] = dataUrl.split(',')
      const mime = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg'
      setImageBase64(data)
      setImageMimeType(mime)
      setImagePreview(dataUrl)
    }
    reader.readAsDataURL(file)
  }

  function handleGenerate() {
    if (!imageBase64) { setError('Adicione a foto do exame de sangue.'); return }
    setError('')
    setSuccess('')
    setLoading(true)
    setLoadingPhase('Lendo o exame...')
    chrome.storage.session.set({ patientInfo: info })
    chrome.runtime.sendMessage({ type: 'ANALYZE', imageBase64, mimeType: imageMimeType, species })

    timeoutRef.current = setTimeout(() => {
      setLoading(false)
      setError('A análise demorou demais. Verifique sua conexão e tente novamente.')
      chrome.storage.session.remove(['analysisState'])
    }, 90_000)
  }

  const inputClass = 'form-control form-control-sm rounded-3'

  return (
    <div className="container py-4" style={{ maxWidth: 560 }}>
      {/* Header */}
      <div className="text-center mb-4 pt-2">
        <div
          className="rounded-3 d-inline-flex align-items-center justify-content-center mb-3"
          style={{ width: 64, height: 64, backgroundColor: '#1E90FF', fontSize: 32 }}
        >
          🩺
        </div>
        <h1 className="h3 fw-bold mb-1" style={{ color: '#1a1a2e' }}>VetLaudo</h1>
        <p className="text-muted small">Análise hematológica veterinária com IA</p>
      </div>

      {/* Patient Info */}
      <div className="card rounded-4 p-4 mb-3">
        <p className="fw-semibold small text-muted mb-3 text-uppercase" style={{ letterSpacing: '0.05em' }}>
          Dados do Paciente
        </p>
        <div className="row g-2">
          <div className="col-8">
            <label className="form-label small mb-1">Paciente</label>
            <input className={inputClass} placeholder="Nome do animal" value={info.paciente} onChange={e => setField('paciente', e.target.value)} />
          </div>
          <div className="col-4">
            <label className="form-label small mb-1">Sexo</label>
            <div className="d-flex gap-1">
              {(['M', 'F'] as const).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setField('sexo', info.sexo === s ? '' : s)}
                  className={`btn btn-sm flex-fill fw-semibold rounded-3 ${info.sexo === s ? 'btn-primary' : 'btn-outline-secondary'}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="col-8">
            <label className="form-label small mb-1">Proprietário</label>
            <input className={inputClass} placeholder="Nome do tutor" value={info.proprietario} onChange={e => setField('proprietario', e.target.value)} />
          </div>
          <div className="col-4">
            <label className="form-label small mb-1">Idade</label>
            <input className={inputClass} placeholder="Ex: 5 anos" value={info.idade} onChange={e => setField('idade', e.target.value)} />
          </div>
          <div className="col-6">
            <label className="form-label small mb-1">Raça</label>
            <input className={inputClass} placeholder="Ex: SRD" value={info.raca} onChange={e => setField('raca', e.target.value)} />
          </div>
          <div className="col-6">
            <label className="form-label small mb-1">Data de Entrada</label>
            <input className={inputClass} type="date" value={info.dataEntrada} onChange={e => setField('dataEntrada', e.target.value)} />
          </div>
          <div className="col-8">
            <label className="form-label small mb-1">Médico Veterinário</label>
            <input className={inputClass} placeholder="Nome do veterinário" value={info.medico} onChange={e => setField('medico', e.target.value)} />
          </div>
          <div className="col-4">
            <label className="form-label small mb-1">Protocolo</label>
            <input className={inputClass} placeholder="Nº" value={info.protocolo} onChange={e => setField('protocolo', e.target.value)} />
          </div>
          <div className="col-12">
            <label className="form-label small mb-1">Clínica Veterinária</label>
            <input className={inputClass} placeholder="Nome da clínica" value={info.clinica} onChange={e => setField('clinica', e.target.value)} />
          </div>
        </div>
      </div>

      {/* Species */}
      <div className="card rounded-4 p-4 mb-3">
        <p className="fw-semibold small text-muted mb-3 text-uppercase" style={{ letterSpacing: '0.05em' }}>
          Espécie do Animal
        </p>
        <div className="d-flex gap-3">
          {(['dog', 'cat'] as Species[]).map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setSpecies(s)}
              className={`btn flex-fill py-3 rounded-3 fw-semibold d-flex align-items-center justify-content-center gap-2 ${species === s ? 'btn-primary' : 'btn-outline-primary'}`}
            >
              <span style={{ fontSize: 22 }}>{s === 'dog' ? '🐶' : '🐱'}</span>
              {s === 'dog' ? 'Cachorro' : 'Gato'}
            </button>
          ))}
        </div>
      </div>

      {/* Image Upload */}
      <div className="card rounded-4 p-4 mb-3">
        <p className="fw-semibold small text-muted mb-3 text-uppercase" style={{ letterSpacing: '0.05em' }}>
          Foto do Exame
        </p>
        <input ref={fileRef} type="file" accept="image/*" className="d-none" onChange={handleFile} />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="btn w-100 border-2 rounded-3 d-flex flex-column align-items-center justify-content-center gap-2 p-0 overflow-hidden"
          style={{ borderStyle: 'dashed', borderColor: '#1E90FF', backgroundColor: '#F0F8FF', minHeight: 180 }}
        >
          {imagePreview ? (
            <img src={imagePreview} alt="Exame" style={{ width: '100%', maxHeight: 260, objectFit: 'contain' }} />
          ) : (
            <div className="py-4 d-flex flex-column align-items-center gap-2">
              <span style={{ fontSize: 36 }}>📎</span>
              <span className="fw-semibold" style={{ color: '#1E90FF' }}>Clique para anexar o laudo</span>
              <span className="text-muted small">JPG, PNG ou qualquer imagem</span>
            </div>
          )}
        </button>
        {imagePreview && (
          <button type="button" onClick={() => fileRef.current?.click()} className="btn btn-link btn-sm text-primary mt-2 p-0">
            Trocar imagem
          </button>
        )}
      </div>

      {error && <div className="alert alert-danger rounded-3 small py-2 mb-3">{error}</div>}
      {success && <div className="alert alert-success rounded-3 small py-2 mb-3">{success}</div>}

      <button
        onClick={handleGenerate}
        disabled={loading || !imageBase64}
        className="btn btn-primary w-100 py-3 rounded-4 fw-bold fs-6"
        style={{ boxShadow: '0 4px 16px rgba(30,144,255,0.35)' }}
      >
        {loading ? (
          <span className="d-flex align-items-center justify-content-center gap-2">
            <span className="spinner-border spinner-border-sm" />
            Analisando exame...
          </span>
        ) : '📄 Gerar Laudo PDF'}
      </button>

      {loading && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999 }}
        >
          <div className="card rounded-4 p-5 text-center shadow-lg" style={{ maxWidth: 320 }}>
            <div className="spinner-border text-primary mx-auto mb-3" style={{ width: 44, height: 44 }} />
            <p className="fw-bold mb-1" style={{ color: '#1a1a2e' }}>Analisando o exame...</p>
            <p className="text-muted small mb-0">{loadingPhase}</p>
          </div>
        </div>
      )}
    </div>
  )
}
