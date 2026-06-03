import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

type Tab = 'login' | 'register'

export default function AuthScreen() {
  const { signIn, signUp } = useAuth()
  const [tab, setTab] = useState<Tab>('login')

  // Login state
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loginLoading, setLoginLoading] = useState(false)

  // Register state
  const [regName, setRegName] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regError, setRegError] = useState<string | null>(null)
  const [regLoading, setRegLoading] = useState(false)
  const [regEmailSent, setRegEmailSent] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!loginEmail.trim() || !loginPassword) return
    setLoginLoading(true)
    setLoginError(null)
    const { error } = await signIn(loginEmail.trim(), loginPassword)
    if (error) setLoginError(error)
    setLoginLoading(false)
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!regName.trim() || !regEmail.trim() || !regPassword) return
    if (regPassword.length < 6) { setRegError('Passwort muss mindestens 6 Zeichen haben.'); return }
    setRegLoading(true)
    setRegError(null)
    const { error, emailSent } = await signUp(regEmail.trim(), regPassword, regName.trim())
    if (error) {
      setRegError(error)
    } else if (emailSent) {
      setRegEmailSent(true)
    }
    // If !emailSent, auth state change triggers → App re-renders automatically
    setRegLoading(false)
  }

  const inputCls = "w-full bg-white/5 border border-white/10 rounded px-4 py-3.5 text-app-text placeholder-app-muted/50 focus:outline-none focus:border-primary/50 font-inter text-sm"

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      {/* Header */}
      <div className="mb-10 text-center">
        <div className="text-5xl mb-4">🎤</div>
        <h1 className="font-bebas text-4xl text-app-text tracking-wider leading-none">
          Battle Rap<br />Scorer
        </h1>
      </div>

      {/* Tab switcher */}
      <div className="flex w-full max-w-xs mb-6 bg-white/5 rounded-lg p-1">
        {(['login', 'register'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded font-bebas tracking-[2px] text-sm transition-colors ${
              tab === t ? 'bg-primary text-white' : 'text-app-muted'
            }`}
          >
            {t === 'login' ? 'Einloggen' : 'Registrieren'}
          </button>
        ))}
      </div>

      <div className="w-full max-w-xs">
        {/* ── Login ─────────────────────────────────────────────── */}
        {tab === 'login' && (
          <form onSubmit={handleLogin} className="flex flex-col gap-3">
            <input
              type="email"
              placeholder="Email"
              value={loginEmail}
              onChange={e => setLoginEmail(e.target.value)}
              autoComplete="email"
              className={inputCls}
            />
            <input
              type="password"
              placeholder="Passwort"
              value={loginPassword}
              onChange={e => setLoginPassword(e.target.value)}
              autoComplete="current-password"
              className={inputCls}
            />
            {loginError && (
              <p className="font-inter text-red-400 text-sm">{loginError}</p>
            )}
            <button
              type="submit"
              disabled={loginLoading || !loginEmail || !loginPassword}
              className="w-full bg-primary font-bebas text-white py-4 rounded-lg tracking-[2px] text-base disabled:opacity-50 active:scale-95 transition-transform shadow-lg shadow-primary/30 mt-2"
            >
              {loginLoading ? 'Einloggen…' : 'Einloggen'}
            </button>
            <button
              type="button"
              onClick={() => setTab('register')}
              className="font-inter text-app-muted text-xs text-center mt-1"
            >
              Noch kein Account? Registrieren →
            </button>
          </form>
        )}

        {/* ── Register ──────────────────────────────────────────── */}
        {tab === 'register' && (
          <>
            {regEmailSent ? (
              <div className="card rounded-lg p-6 text-center flex flex-col gap-3">
                <div className="text-4xl">📬</div>
                <h2 className="font-bebas text-xl text-app-text tracking-wider">Fast geschafft!</h2>
                <p className="font-inter text-app-muted text-sm">
                  Wir haben dir eine Bestätigungsmail an <span className="text-app-text">{regEmail}</span> geschickt.
                  Bitte bestätige deine Email und logge dich dann ein.
                </p>
                <button
                  onClick={() => { setTab('login'); setLoginEmail(regEmail) }}
                  className="w-full bg-primary font-bebas text-white py-3.5 rounded-lg tracking-[2px] text-sm active:scale-95 transition-transform mt-2"
                >
                  Zum Login
                </button>
              </div>
            ) : (
              <form onSubmit={handleRegister} className="flex flex-col gap-3">
                <input
                  type="text"
                  placeholder="Anzeigename (z.B. Ben oder Löwe)"
                  value={regName}
                  onChange={e => setRegName(e.target.value)}
                  autoComplete="nickname"
                  className={inputCls}
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={regEmail}
                  onChange={e => setRegEmail(e.target.value)}
                  autoComplete="email"
                  className={inputCls}
                />
                <input
                  type="password"
                  placeholder="Passwort (min. 6 Zeichen)"
                  value={regPassword}
                  onChange={e => setRegPassword(e.target.value)}
                  autoComplete="new-password"
                  className={inputCls}
                />
                {regError && (
                  <p className="font-inter text-red-400 text-sm">{regError}</p>
                )}
                <button
                  type="submit"
                  disabled={regLoading || !regName || !regEmail || !regPassword}
                  className="w-full bg-primary font-bebas text-white py-4 rounded-lg tracking-[2px] text-base disabled:opacity-50 active:scale-95 transition-transform shadow-lg shadow-primary/30 mt-2"
                >
                  {regLoading ? 'Registrieren…' : 'Registrieren'}
                </button>
                <button
                  type="button"
                  onClick={() => setTab('login')}
                  className="font-inter text-app-muted text-xs text-center mt-1"
                >
                  ← Zum Login
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  )
}
