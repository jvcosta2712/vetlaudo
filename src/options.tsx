import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import 'bootstrap/dist/css/bootstrap.min.css'

function Options() {
  const [apiKey, setApiKey] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    chrome.storage.local.get('geminiApiKey', ({ geminiApiKey }) => {
      if (geminiApiKey) setApiKey(geminiApiKey as string)
    })
  }, [])

  function handleSave() {
    chrome.storage.local.set({ geminiApiKey: apiKey }, () => {
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    })
  }

  return (
    <div className="container py-5" style={{ maxWidth: 520 }}>
      <div className="text-center mb-4">
        <div
          className="rounded-3 d-inline-flex align-items-center justify-content-center mb-3"
          style={{ width: 56, height: 56, backgroundColor: '#1E90FF', fontSize: 28 }}
        >
          🩺
        </div>
        <h1 className="h4 fw-bold mb-1" style={{ color: '#1a1a2e' }}>VetLaudo</h1>
        <p className="text-muted small">Configurações da extensão</p>
      </div>

      <div className="card rounded-4 p-4">
        <label className="fw-semibold small text-muted text-uppercase mb-2" style={{ letterSpacing: '0.05em' }}>
          Chave da API Gemini
        </label>
        <input
          type="password"
          className="form-control rounded-3 mb-3"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          placeholder="Insira sua chave do Google Gemini"
        />
        <button
          className="btn btn-primary w-100 py-2 rounded-3 fw-semibold"
          onClick={handleSave}
          disabled={!apiKey.trim()}
        >
          {saved ? '✓ Salvo com sucesso!' : 'Salvar chave'}
        </button>
        <p className="mt-3 mb-0 text-muted small text-center">
          Obtenha sua chave gratuita em{' '}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
            Google AI Studio
          </a>
        </p>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Options />)
