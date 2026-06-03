interface Props {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
}

export default function Stepper({ value, onChange, min = 1, max = 10 }: Props) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="w-8 h-8 rounded bg-white/10 text-app-text font-bold disabled:opacity-25 active:scale-90 transition-transform flex items-center justify-center select-none text-lg"
      >
        −
      </button>
      <span className="w-9 text-center font-bebas text-[36px] leading-none text-app-text tabular-nums">
        {value}
      </span>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="w-8 h-8 rounded bg-white/10 text-app-text font-bold disabled:opacity-25 active:scale-90 transition-transform flex items-center justify-center select-none text-lg"
      >
        +
      </button>
    </div>
  )
}
