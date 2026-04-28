import Lottie from 'lottie-react'
import { useCallback, useEffect, useState } from 'react'

const CAT_SIZE = 160

export default function DesktopPet() {
  const [animData, setAnimData] = useState<object | null>(null)
  const [flipped, setFlipped] = useState(true)

  // 加载 Lottie 动画数据
  useEffect(() => {
    fetch('./animations/data-cat-walk_lottie.json')
      .then(r => (r.ok ? r.json() : null))
      .then((data: Record<string, unknown> | null) => {
        if (!data) return
        setAnimData(data)
      })
      .catch(() => {})
  }, [])

  // 监听主进程的翻转指令
  useEffect(() => {
    const unsub = window.nekoBridge.pet.onFlip((f) => setFlipped(f))
    return unsub
  }, [])

  // ── 拖拽：mousedown 通知主进程开始，mouseup 结束 ──
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    window.nekoBridge.pet.dragStart()

    const onMouseUp = () => {
      window.nekoBridge.pet.dragEnd()
      document.removeEventListener('mouseup', onMouseUp)
    }
    document.addEventListener('mouseup', onMouseUp)
  }, [])

  if (!animData) return null

  return (
    <div
      style={{
        width: CAT_SIZE,
        height: CAT_SIZE,
        transform: flipped ? 'scaleX(-1)' : 'none',
        background: 'transparent',
        overflow: 'hidden',
        cursor: 'grab',
      }}
      draggable={false}
      onMouseDown={handleMouseDown}
      onDragStart={(e) => e.preventDefault()}
    >
      <Lottie
        animationData={animData}
        assetsPath="animations/images/"
        loop
        autoplay
        style={{ width: CAT_SIZE, height: CAT_SIZE, pointerEvents: 'none' }}
        rendererSettings={{ preserveAspectRatio: 'xMidYMid meet', clearCanvas: true }}
      />
    </div>
  )
}
