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

  // 通过转发的 mousemove 检测鼠标左键状态，实现拖拽
  // 窗口始终 setIgnoreMouseEvents(true, { forward: true })
  // 转发事件包含 buttons 属性，可以判断是否按住左键
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const leftPressed = (e.buttons & 1) !== 0
    if (leftPressed && !dragging.current) {
      dragging.current = true
      window.nekoBridge.pet.dragStart(e.screenX, e.screenY)
    } else if (!leftPressed && dragging.current) {
      dragging.current = false
      window.nekoBridge.pet.dragEnd()
    }
  }, [])

  const handleMouseLeave = useCallback(() => {
    if (dragging.current) {
      dragging.current = false
      window.nekoBridge.pet.dragEnd()
    }
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
      }}
      draggable={false}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
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
