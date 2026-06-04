interface Props {
  value: number  // 1-5
  onChange: (v: number) => void
  mc: string
  isLeading?: boolean
}

export default function Slider({ value, onChange, mc, isLeading = false }: Props) {
  const pct = ((value - 1) / 4) * 100
  const trackBg = `linear-gradient(to right, #7C3AED ${pct}%, #1A1A26 ${pct}%)`

  return (
    <div className="flex flex-col items-center gap-0.5 w-full min-w-0">
      <span className="font-inter text-[9px] uppercase tracking-wider text-app-muted truncate w-full text-center px-1">
        {mc}
      </span>
      <span className={`font-bebas text-[32px] leading-none ${
        isLeading
          ? 'text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary'
          : 'text-[#2A2A3A]'
      }`}>
        {value}
      </span>
      <input
        type="range"
        min={1}
        max={5}
        step={1}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="brs-slider w-full"
        style={{ background: trackBg }}
      />
      <div className="flex justify-between w-full px-0.5 mt-0.5">
        {[1, 2, 3, 4, 5].map(n => (
          <span
            key={n}
            className={`font-inter text-[9px] w-4 text-center ${n === value ? 'text-primary font-bold' : 'text-app-muted/40'}`}
          >
            {n}
          </span>
        ))}
      </div>
    </div>
  )
}
