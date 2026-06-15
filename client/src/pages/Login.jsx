import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../lib/AuthContext'

export default function Login() {
  const { login } = useAuth()
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [step, setStep] = useState('name') // 'name' | 'pin'
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  function handleNameSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return setError('Introduce tu nombre')
    setError(null)
    setStep('pin')
  }

  function pressPin(d) {
    if (pin.length >= 4) return
    setPin(p => p + d)
    setError(null)
  }

  function deletePin() { setPin(p => p.slice(0, -1)); setError(null) }

  async function handleLogin(currentPin) {
    setLoading(true)
    try {
      const user = await api.login(name.trim(), currentPin)
      login(user)
    } catch (err) {
      setError(err.message)
      setPin('')
    } finally {
      setLoading(false)
    }
  }

  // Auto-submit when 4 digits entered
  useEffect(() => {
    if (pin.length === 4 && step === 'pin') handleLogin(pin)
  }, [pin])

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-xs">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">Almacén</h1>
          <p className="text-gray-400 text-sm mt-1">Gestión de Stock</p>
        </div>

        {step === 'name' ? (
          <form onSubmit={handleNameSubmit} className="space-y-4">
            <div>
              <input
                type="text"
                value={name}
                onChange={e => { setName(e.target.value); setError(null) }}
                placeholder="Tu nombre"
                autoFocus
                autoComplete="off"
                className="w-full bg-gray-800 text-white placeholder-gray-500 border border-gray-700 rounded-xl px-4 py-3 text-center text-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <button type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-xl transition-colors">
              Continuar
            </button>
          </form>
        ) : (
          <div>
            <button onClick={() => { setStep('name'); setPin(''); setError(null) }}
              className="flex items-center gap-2 text-gray-400 text-sm mb-6 hover:text-white">
              ← Cambiar
            </button>

            <div className="text-center mb-6">
              <div className="w-14 h-14 rounded-full bg-blue-600 flex items-center justify-center text-xl font-bold text-white mx-auto mb-2">
                {name.charAt(0).toUpperCase()}
              </div>
              <p className="text-white font-medium">{name}</p>
              <p className="text-gray-400 text-sm mt-1">Introduce tu PIN</p>
            </div>

            {/* PIN dots */}
            <div className="flex justify-center gap-4 mb-6">
              {[0,1,2,3].map(i => (
                <div key={i} className={`w-4 h-4 rounded-full border-2 transition-colors ${
                  pin.length > i ? 'bg-blue-500 border-blue-500' : 'border-gray-600'
                }`} />
              ))}
            </div>

            {error && <p className="text-red-400 text-sm text-center mb-4">{error}</p>}

            {/* Numpad */}
            <div className="grid grid-cols-3 gap-3">
              {[1,2,3,4,5,6,7,8,9].map(d => (
                <button key={d} onClick={() => pressPin(String(d))}
                  className="bg-gray-800 hover:bg-gray-700 active:bg-gray-600 text-white text-xl font-medium py-4 rounded-xl transition-colors">
                  {d}
                </button>
              ))}
              <div />
              <button onClick={() => pressPin('0')}
                className="bg-gray-800 hover:bg-gray-700 active:bg-gray-600 text-white text-xl font-medium py-4 rounded-xl transition-colors">
                0
              </button>
              <button onClick={deletePin}
                className="bg-gray-800 hover:bg-gray-700 active:bg-gray-600 text-white text-xl font-medium py-4 rounded-xl transition-colors">
                ⌫
              </button>
            </div>

            {loading && <p className="text-gray-400 text-sm text-center mt-4">Verificando...</p>}
          </div>
        )}
      </div>
    </div>
  )
}
