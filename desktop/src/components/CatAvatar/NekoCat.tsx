import type { CatState } from '../../store/app'

interface Props {
  state: CatState
  size?: number
}

const CSS = `
@keyframes nk-float {
  0%, 100% { transform: translateY(0); }
  50%       { transform: translateY(-6px); }
}
@keyframes nk-bob {
  0%, 100% { transform: translateY(0); }
  50%       { transform: translateY(4px); }
}
@keyframes nk-jump {
  0%, 100% { transform: translateY(0) scale(1); }
  40%       { transform: translateY(-18px) scale(1.05); }
  70%       { transform: translateY(-8px) scale(1.02); }
}
@keyframes nk-shake {
  0%, 100% { transform: translateX(0); }
  25%       { transform: translateX(-5px); }
  75%       { transform: translateX(5px); }
}
@keyframes nk-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50%       { transform: scale(1.04); opacity: 0.85; }
}
.nk-idle     { animation: nk-float 4s ease-in-out infinite; }
.nk-thinking { animation: nk-pulse 1.5s ease-in-out infinite; }
.nk-working  { animation: nk-bob   1.2s ease-in-out infinite; }
.nk-success  { animation: nk-jump  0.8s cubic-bezier(0.34,1.56,0.64,1) 1; }
.nk-error    { animation: nk-shake 0.4s ease-in-out 3; }
`

export function NekoCat({ state, size = 180 }: Props) {
  return (
    <div style={{ width: size, height: size, display: 'inline-block' }}>
      <style>{CSS}</style>
      <img
        src="./avatar.png"
        alt="NekoClaw"
        className={`nk-${state}`}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          display: 'block',
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}
