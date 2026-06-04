import { useState } from 'react'

const diceBearUrl = (name: string) =>
  `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(name || 'unknown')}&backgroundColor=12121a`

interface Props {
  name: string
  size: number
  className?: string
}

export default function Avatar({ name, size, className = '' }: Props) {
  const [error, setError] = useState(false)
  const initial = (name || '?').charAt(0).toUpperCase()

  return (
    <div
      className={`rounded-full overflow-hidden flex-shrink-0 bg-primary/20 flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      {!error ? (
        <img
          src={diceBearUrl(name)}
          alt={name}
          width={size}
          height={size}
          onError={() => setError(true)}
          style={{ display: 'block' }}
        />
      ) : (
        <span className="font-bebas text-primary" style={{ fontSize: Math.round(size * 0.4) }}>
          {initial}
        </span>
      )}
    </div>
  )
}
