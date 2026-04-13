/**
 * CatAvatar — Lottie animation state machine.
 *
 * States: idle | thinking | working | success | error
 *
 * Animation JSON files should be placed in:
 *   public/animations/cat-idle.json
 *   public/animations/cat-thinking.json
 *   public/animations/cat-working.json
 *   public/animations/cat-success.json
 *   public/animations/cat-error.json
 *
 * Fallback placeholder is shown when the JSON isn't loaded yet.
 */
import Lottie from 'lottie-react'
import { useEffect, useState } from 'react'
import { CatState } from '../../store/app'

const ANIM_MAP: Record<CatState, string> = {
  idle:     '/animations/cat-idle.json',
  thinking: '/animations/cat-thinking.json',
  working:  '/animations/cat-working.json',
  success:  '/animations/cat-success.json',
  error:    '/animations/cat-error.json',
}

interface Props {
  state: CatState
  size?: number
}

export function CatAvatar({ state, size = 180 }: Props) {
  const [animData, setAnimData] = useState<object | null>(null)
  const [currentState, setCurrentState] = useState<CatState>(state)

  useEffect(() => {
    let cancelled = false
    setAnimData(null)
    fetch(ANIM_MAP[state])
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) {
          setAnimData(data)
          setCurrentState(state)
        }
      })
      .catch(() => {
        if (!cancelled) setAnimData(null)
      })
    return () => { cancelled = true }
  }, [state])

  if (!animData) {
    // Placeholder while loading or if animations not found
    return (
      <div
        style={{
          width: size,
          height: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: size * 0.5,
          filter: currentState === 'error' ? 'grayscale(1)' : 'none',
          opacity: currentState === 'thinking' ? 0.7 : 1,
          transition: 'all 0.3s ease',
          animation: currentState === 'thinking' || currentState === 'working'
            ? 'catBounce 1.2s ease-in-out infinite'
            : 'none',
        }}
      >
        🐱
        <style>{`
          @keyframes catBounce {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-8px); }
          }
        `}</style>
      </div>
    )
  }

  return (
    <Lottie
      animationData={animData}
      loop={state !== 'success' && state !== 'error'}
      style={{ width: size, height: size }}
    />
  )
}
