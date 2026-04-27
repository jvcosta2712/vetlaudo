import { useEffect, useRef, useState } from 'react'

type Species = 'dog' | 'cat'

interface PatientInfo {
  name: string
  sex: 'M' | 'F' | ''
  owner: string
  vet: string
  clinic: string
  breed: string
  age: string
  entryDate: string
  protocol: string
}

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

function buildReportElement(result: AnalysisResult, species: Species, patient: PatientInfo): HTMLElement {
  const speciesLabel = species === 'dog' ? 'Canina' : 'Felina'
  const date = result.examDate ?? 'Não identificada'
  const generatedAt = new Date().toLocaleString('pt-BR')

  const statusCell = (p: Parameter) => {
    if (p.status === 'high') return `<span style="color:#dc3545;font-weight:bold;">Alto ▲</span>`
    if (p.status === 'low') return `<span style="color:#fd7e14;font-weight:bold;">Baixo ▼</span>`
    return `<span style="color:#198754;">Normal</span>`
  }

  const rows = result.parameters.map(p => `
    <tr style="background:${p.status !== 'normal' ? '#fff8f8' : 'transparent'};">
      <td style="padding:3px 8px;font-weight:600;border-bottom:1px solid #e8f4ff;">${p.name}</td>
      <td style="padding:3px 8px;font-weight:${p.status !== 'normal' ? 'bold' : 'normal'};color:${p.status === 'high' ? '#dc3545' : p.status === 'low' ? '#fd7e14' : 'inherit'};border-bottom:1px solid #e8f4ff;">${p.value}</td>
      <td style="padding:3px 8px;color:#666;border-bottom:1px solid #e8f4ff;">${p.unit}</td>
      <td style="padding:3px 8px;color:#666;border-bottom:1px solid #e8f4ff;">${p.refMin} – ${p.refMax}</td>
      <td style="padding:3px 8px;border-bottom:1px solid #e8f4ff;">${statusCell(p)}</td>
    </tr>`).join('')

  const field = (label: string, value: string) =>
    `<span style="font-size:11px;color:#333;"><strong style="color:#1a1a2e;">${label}</strong> ${value || '—'}</span>`

  const formatDate = (d: string) => {
    if (!d) return ''
    const [y, m, day] = d.split('-')
    return day && m && y ? `${day}/${m}/${y}` : d
  }

  const el = document.createElement('div')
  el.style.cssText = 'font-family:Arial,sans-serif;color:#1a1a2e;background:#fff;padding:16px;width:100%;'
  el.innerHTML = `
    <div style="border-bottom:2px solid #1E90FF;padding-bottom:8px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:flex-end;">
      <div>
        <div style="color:#1E90FF;font-size:18px;font-weight:bold;">VetLaudo</div>
        <div style="color:#888;font-size:10px;margin-top:2px;">Laudo Hematológico Veterinário</div>
      </div>
      <div style="text-align:right;font-size:10px;color:#888;">Gerado em: ${generatedAt}</div>
    </div>

    <div style="background:#F0F8FF;border-radius:6px;padding:8px 12px;margin-bottom:10px;font-size:11px;line-height:1.6;">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:2px 16px;">
        ${field('Paciente:', patient.name)}
        ${field('Espécie:', speciesLabel)}
        ${field('Raça:', patient.breed)}
        ${field('Sexo:', patient.sex)}
        ${field('Idade:', patient.age)}
        ${field('Data de entrada:', formatDate(patient.entryDate) || date)}
        ${field('Proprietário:', patient.owner)}
        ${field('Protocolo:', patient.protocol)}
        ${field('Méd. Veterinário:', patient.vet)}
        ${field('Clínica:', patient.clinic)}
      </div>
    </div>

    <div style="color:#1E90FF;font-size:12px;font-weight:bold;margin:0 0 5px;padding-bottom:4px;border-bottom:1px solid #e8f4ff;">Parâmetros Analisados</div>
    <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:10px;">
      <thead>
        <tr style="background:#1E90FF;color:white;">
          <td style="padding:4px 8px;font-weight:600;">Parâmetro</td>
          <td style="padding:4px 8px;font-weight:600;">Valor</td>
          <td style="padding:4px 8px;font-weight:600;">Unidade</td>
          <td style="padding:4px 8px;font-weight:600;">Referência</td>
          <td style="padding:4px 8px;font-weight:600;">Status</td>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div style="color:#1E90FF;font-size:12px;font-weight:bold;margin:0 0 5px;padding-bottom:4px;border-bottom:1px solid #e8f4ff;">Interpretação Clínica</div>
    <p style="font-size:11px;line-height:1.5;color:#333;white-space:pre-line;margin-bottom:10px;">${result.interpretation}</p>

    <div style="color:#1E90FF;font-size:12px;font-weight:bold;margin:0 0 5px;padding-bottom:4px;border-bottom:1px solid #e8f4ff;">Recomendações</div>
    <p style="font-size:11px;line-height:1.5;color:#333;white-space:pre-line;margin-bottom:10px;">${result.recommendations}</p>

    <div style="text-align:center;font-size:9px;color:#aaa;border-top:1px solid #eee;padding-top:6px;">
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

async function generatePdf(result: AnalysisResult, species: Species, patient: PatientInfo): Promise<void> {
  const el = buildReportElement(result, species, patient)
  document.body.appendChild(el)
  try {
    const html2pdf = (await import('html2pdf.js')).default
    const filename = `VetLaudo_${patient.name}_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.pdf`

    const blob: Blob = await html2pdf().set({
      margin: 8,
      filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    }).from(el).output('blob')

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } finally {
    document.body.removeChild(el)
  }
}

export default function Home() {
  const [species, setSpecies] = useState<Species>('dog')
  const [patient, setPatient] = useState<PatientInfo>({
    name: '', sex: '', owner: '', vet: '', clinic: '', breed: '', age: '', entryDate: '', protocol: '',
  })
  const [imageBase64, setImageBase64] = useState('')
  const [imageMimeType, setImageMimeType] = useState('image/jpeg')
  const [imagePreview, setImagePreview] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingPhase, setLoadingPhase] = useState('Lendo o exame...')
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const patientRef = useRef(patient)
  patientRef.current = patient

  function setField<K extends keyof PatientInfo>(key: K, value: PatientInfo[K]) {
    setPatient(prev => ({ ...prev, [key]: value }))
  }

  // Ao abrir o popup: recupera estado em andamento ou concluído
  useEffect(() => {
    chrome.storage.session.get(['analysisState'], async (stored) => {
      const state = stored.analysisState as AnalysisState | undefined
      if (!state || state.status === 'idle') return

      if (state.status === 'loading') {
        setLoading(true)
        setLoadingPhase(state.phase)
      } else if (state.status === 'done') {
        await generatePdf(state.result, state.species, patientRef.current).catch(() => { })
        chrome.storage.session.remove(['analysisState'])
      } else if (state.status === 'error') {
        setError(state.message)
        chrome.storage.session.remove(['analysisState'])
      }
    })

    // Ouve mudanças de estado vindas do background (mesmo com popup fechado e reaberto)
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
        setLoading(false)
        generatePdf(state.result, state.species, patientRef.current).catch((err) => {
          setError(err instanceof Error ? err.message : 'Erro ao gerar PDF.')
        })
        chrome.storage.session.remove(['analysisState'])
      } else if (state.status === 'error') {
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
    setLoading(true)
    setLoadingPhase('Lendo o exame...')
    chrome.runtime.sendMessage({ type: 'ANALYZE', imageBase64, mimeType: imageMimeType, species })
  }

  return (
    <div className="container py-4" style={{ maxWidth: 560 }}>
      {/* Header */}
      <div className="text-center mb-5 pt-2">
        <div
          className="rounded-3 d-inline-flex align-items-center justify-content-center mb-3"
          style={{ width: 64, height: 64, backgroundColor: '#1E90FF', fontSize: 32 }}
        >
          🩺
        </div>
        <h1 className="h3 fw-bold mb-1" style={{ color: '#1a1a2e' }}>VetLaudo</h1>
        <p className="text-muted small">Análise hematológica veterinária com IA</p>
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

      {/* Patient Info */}
      <div className="card rounded-4 p-4 mb-3">
        <p className="fw-semibold small text-muted mb-3 text-uppercase" style={{ letterSpacing: '0.05em' }}>
          Dados do Paciente
        </p>
        <div className="row g-2">
          <div className="col-8">
            <label className="form-label small fw-semibold mb-1">Paciente</label>
            <input
              type="text"
              className="form-control form-control-sm rounded-3"
              placeholder="Nome do animal"
              value={patient.name}
              onChange={e => setField('name', e.target.value)}
            />
          </div>
          <div className="col-4">
            <label className="form-label small fw-semibold mb-1">Sexo</label>
            <select
              className="form-select form-select-sm rounded-3"
              value={patient.sex}
              onChange={e => setField('sex', e.target.value as 'M' | 'F' | '')}
            >
              <option value="">—</option>
              <option value="M">M</option>
              <option value="F">F</option>
            </select>
          </div>
          <div className="col-6">
            <label className="form-label small fw-semibold mb-1">Raça</label>
            <input
              type="text"
              className="form-control form-control-sm rounded-3"
              placeholder="Ex: SRD"
              value={patient.breed}
              onChange={e => setField('breed', e.target.value)}
            />
          </div>
          <div className="col-6">
            <label className="form-label small fw-semibold mb-1">Idade</label>
            <input
              type="text"
              className="form-control form-control-sm rounded-3"
              placeholder="Ex: 8 anos"
              value={patient.age}
              onChange={e => setField('age', e.target.value)}
            />
          </div>
          <div className="col-12">
            <label className="form-label small fw-semibold mb-1">Proprietário</label>
            <input
              type="text"
              className="form-control form-control-sm rounded-3"
              placeholder="Nome do tutor"
              value={patient.owner}
              onChange={e => setField('owner', e.target.value)}
            />
          </div>
          <div className="col-12">
            <label className="form-label small fw-semibold mb-1">Médico Veterinário</label>
            <input
              type="text"
              className="form-control form-control-sm rounded-3"
              placeholder="Nome do veterinário"
              value={patient.vet}
              onChange={e => setField('vet', e.target.value)}
            />
          </div>
          <div className="col-12">
            <label className="form-label small fw-semibold mb-1">Clínica Veterinária</label>
            <input
              type="text"
              className="form-control form-control-sm rounded-3"
              placeholder="Nome da clínica"
              value={patient.clinic}
              onChange={e => setField('clinic', e.target.value)}
            />
          </div>
          <div className="col-6">
            <label className="form-label small fw-semibold mb-1">Data de Entrada</label>
            <input
              type="date"
              className="form-control form-control-sm rounded-3"
              value={patient.entryDate}
              onChange={e => setField('entryDate', e.target.value)}
            />
          </div>
          <div className="col-6">
            <label className="form-label small fw-semibold mb-1">Protocolo</label>
            <input
              type="text"
              className="form-control form-control-sm rounded-3"
              placeholder="Nº protocolo"
              value={patient.protocol}
              onChange={e => setField('protocol', e.target.value)}
            />
          </div>
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
