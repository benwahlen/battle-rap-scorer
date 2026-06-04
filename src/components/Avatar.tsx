import { useState } from 'react'

export const AVATAR_SEEDS = [
  'mikesh', 'kato', 'niza', 'karma', 'enyo',
  'zeuge', 'riesenlauch', 'synic', 'dltlly', 'battlewrap',
  'headbanger', 'freestyle',
]

export function getAvatarSeed(name: string, avatarIndex?: number | null): string {
  if (avatarIndex != null && AVATAR_SEEDS[avatarIndex]) return AVATAR_SEEDS[avatarIndex]
  return name || 'unknown'
}

const diceBearUrl = (seed: string) =>
  `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(seed)}&backgroundColor=12121a`

interface Props {
  name: string
  avatarIndex?: number | null
  size: number
  className?: string
}

export default function Avatar({ name, avatarIndex, size, className = '' }: Props) {
  const [error, setError] = useState(false)
  const seed = getAvatarSeed(name, avatarIndex)
  const initial = (name || '?').charAt(0).toUpperCase()

  return (
    <div
      className={`rounded-full overflow-hidden flex-shrink-0 bg-primary/20 flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      {!error ? (
        <img
          src={diceBearUrl(seed)}
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
