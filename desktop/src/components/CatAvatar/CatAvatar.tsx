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

const WALK_ANIM = '/animations/data-cat-walk_lottie.json'

const ANIM_MAP: Record<CatState, string> = {
  idle:     WALK_ANIM,
  thinking: '/animations/cat-thinking.json',
  working:  WALK_ANIM,
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
          // Fix relative asset paths: lottie-web resolves `u` relative to the
          // page origin when loaded via animationData, not the JSON location.
          if (data?.assets) {
            const base = ANIM_MAP[state].replace(/[^/]+$/, '') // e.g. "/animations/"
            data.assets = (data.assets as Array<Record<string, unknown>>).map((a) => {
              if (typeof a.u === 'string' && a.u && !/^(https?:\/\/|\/)/.test(a.u)) {
                return { ...a, u: base + a.u }
              }
              return a
            })
          }
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
