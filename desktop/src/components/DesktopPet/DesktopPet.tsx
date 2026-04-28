import Lottie from 'lottie-react'
import { useCallback, useEffect, useRef, useState } from 'react'

const CAT_SIZE = 160

export default function DesktopPet() {
  const [animData, setAnimData] = useState<object | null>(null)
  const [flipped, setFlipped] = useState(true)
  const dragging = useRef(false)

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

  // 拖拽：mousedown → IPC → 主进程轮询光标移动窗口
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    dragging.current = true
    window.nekoBridge.pet.dragStart(e.screenX, e.screenY)

    const onMouseUp = () => {
      dragging.current = false
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
