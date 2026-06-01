interface Props {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
}

export default function Stepper({ value, onChange, min = 1, max = 10 }: Props) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="w-9 h-9 rounded-lg bg-zinc-800 text-white text-lg font-bold disabled:opacity-30 active:scale-90 transition-transform flex items-center justify-center select-none"
      >
        −
      </button>
      <span className="w-7 text-center text-white font-semibold tabular-nums text-base">{value}</span>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="w-9 h-9 rounded-lg bg-zinc-800 text-white text-lg font-bold disabled:opacity-30 active:scale-90 transition-transform flex items-center justify-center select-none"
      >
        +
      </button>
    </div>
  )
}
