import type { UserName } from '../types'

interface Props {
  onSelect: (name: UserName) => void
}

export default function UserSelect({ onSelect }: Props) {
  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6">
      <div className="mb-12 text-center">
        <div className="text-6xl mb-4">🎤</div>
        <h1 className="text-3xl font-black text-white tracking-tight">Battle Rap Scorer</h1>
        <p className="text-zinc-500 mt-2">Wer bist du?</p>
      </div>
      <div className="flex flex-col gap-4 w-full max-w-xs">
        <button
          onClick={() => onSelect('Ben')}
          className="bg-yellow-400 text-black font-black text-2xl py-7 rounded-2xl active:scale-95 transition-transform shadow-lg shadow-yellow-400/20"
        >
          Ben
        </button>
        <button
          onClick={() => onSelect('Löwe')}
          className="bg-zinc-900 text-white font-black text-2xl py-7 rounded-2xl border border-zinc-700 active:scale-95 transition-transform"
        >
          Löwe 🦁
        </button>
      </div>
    </div>
  )
}
