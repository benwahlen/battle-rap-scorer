import type { UserName } from '../types'

interface Props {
  onSelect: (name: UserName) => void
}

export default function UserSelect({ onSelect }: Props) {
  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6">
      <div className="mb-12 text-center">
        <div className="text-6xl mb-5">🎤</div>
        <h1 className="text-4xl font-black text-white uppercase tracking-tight">Battle Rap<br/>Scorer</h1>
        <p className="text-zinc-600 mt-3 uppercase tracking-widest text-xs">Wer bist du?</p>
      </div>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          onClick={() => onSelect('Ben')}
          className="bg-yellow-400 text-black font-black text-xl py-6 rounded-lg uppercase tracking-widest active:scale-95 transition-transform shadow-lg shadow-yellow-400/20"
        >
          Ben
        </button>
        <button
          onClick={() => onSelect('Löwe')}
          className="bg-zinc-900 text-white font-black text-xl py-6 rounded-lg border border-zinc-700 uppercase tracking-widest active:scale-95 transition-transform"
        >
          Löwe 🦁
        </button>
      </div>
    </div>
  )
}
