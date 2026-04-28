import Lottie from 'lottie-react'
import { useEffect, useState } from 'react'

const CAT_SIZE = 160

export default function DesktopPet() {
  const [animData, setAnimData] = useState<object | null>(null)
  const [flipped, setFlipped] = useState(true)

  useEffect(() => {
    fetch('./animations/data-cat-walk_lottie.json')
      .then(r => (r.ok ? r.json() : null))
      .then((data: Record<string, unknown> | null) => {
        if (!data) return
        setAnimData(data)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const unsub = window.nekoBridge.pet.onFlip((f) => setFlipped(f))
    return unsub
  }, [])

  if (!animData) return null

  return (
    <div style={{
      width: CAT_SIZE,
      height: CAT_SIZE,
      transform: flipped ? 'scaleX(-1)' : 'none',
      background: 'transparent',
      overflow: 'hidden',
    }}>
      <Lottie
        animationData={animData}
        assetsPath="animations/images/"
        loop
        autoplay
        style={{ width: CAT_SIZE, height: CAT_SIZE }}
        rendererSettings={{ preserveAspectRatio: 'xMidYMid meet', clearCanvas: true }}
      />
    </div>
  )
}
