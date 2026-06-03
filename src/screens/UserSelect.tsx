interface Props {
  onSelect: (name: string) => void
}

export default function UserSelect({ onSelect }: Props) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="mb-14 text-center">
        <div className="text-6xl mb-5">🎤</div>
        <h1 className="font-bebas text-5xl text-app-text tracking-wider leading-none">
          Battle Rap<br />Scorer
        </h1>
        <p className="text-app-muted mt-3 font-inter uppercase tracking-[0.15em] text-[10px]">
          Wer bist du?
        </p>
      </div>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          onClick={() => onSelect('Ben')}
          className="card bg-primary/20 border-primary/40 font-bebas text-2xl text-app-text py-6 rounded-lg tracking-[2px] active:scale-95 transition-transform shadow-lg shadow-primary/20"
        >
          Ben
        </button>
        <button
          onClick={() => onSelect('Löwe')}
          className="card font-bebas text-2xl text-app-text py-6 rounded-lg tracking-[2px] active:scale-95 transition-transform"
        >
          Löwe 🦁
        </button>
      </div>
    </div>
  )
}
