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
import { NekoCat } from './NekoCat'

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
    return <NekoCat state={currentState} size={size} />
  }

  return (
    <Lottie
      animationData={animData}
      loop={state !== 'success' && state !== 'error'}
      style={{ width: size, height: size }}
    />
  )
}
