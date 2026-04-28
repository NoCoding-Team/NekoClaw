import Lottie from 'lottie-react'
import { useCallback, useEffect, useRef, useState } from 'react'

const CAT_SIZE = 160

export default function DesktopPet() {
  const [animData, setAnimData] = useState<object | null>(null)
  const [flipped, setFlipped] = useState(true)
  const isDragging = useRef(false)

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

  // ── 拖拽逻辑 ──
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    isDragging.current = true
    window.nekoBridge.pet.dragStart()

    const onMouseMove = () => {
      if (isDragging.current) {
        window.nekoBridge.pet.dragMove()
      }
    }

    const onMouseUp = () => {
      isDragging.current = false
      window.nekoBridge.pet.dragEnd()
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [])

  // 鼠标进入/离开通知主进程切换穿透状态
  const handleMouseEnter = useCallback(() => {
    window.nekoBridge.pet.mouseEnter()
  }, [])

  const handleMouseLeave = useCallback(() => {
    if (!isDragging.current) {
      window.nekoBridge.pet.mouseLeave()
    }
  }, [])

  // 双击恢复自动行走
  const handleDoubleClick = useCallback(() => {
    window.nekoBridge.pet.resumeWalk()
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
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onDoubleClick={handleDoubleClick}
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
