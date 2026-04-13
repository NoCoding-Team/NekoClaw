import type { CatState } from '../../store/app'

interface Props {
  state: CatState
  size?: number
}

const CSS = `
.nk-root { animation: nk-float 3.5s ease-in-out infinite; transform-origin: center; display: block; overflow: visible; }
.nk-root.thinking, .nk-root.working { animation: nk-think 1.5s ease-in-out infinite; }
.nk-root.success  { animation: nk-bounce 0.6s cubic-bezier(.36,.07,.19,.97) 2; }
.nk-root.error    { animation: nk-shake 0.5s ease-in-out 3; }

@keyframes nk-float  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
@keyframes nk-think  { 0%,100%{transform:translateY(0) rotate(0)} 35%{transform:translateY(-4px) rotate(-3deg)} 70%{transform:translateY(-4px) rotate(3deg)} }
@keyframes nk-bounce { 0%,100%{transform:scale(1) translateY(0)} 50%{transform:scale(1.05) translateY(-10px)} }
@keyframes nk-shake  { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-6px)} 75%{transform:translateX(6px)} }

.nk-blink { animation: nk-blink 5s infinite; transform-box: fill-box; transform-origin: center; }
.nk-blink2 { animation-delay: 0.15s; }
@keyframes nk-blink { 0%,90%,100%{transform:scaleY(1)} 95%{transform:scaleY(0.05)} }

.nk-paw { animation: nk-wave 2s ease-in-out infinite; transform-origin: top right; }
@keyframes nk-wave { 0%,100%{transform:rotate(0)} 50%{transform:rotate(20deg)} }

.nk-spark { animation: nk-sparkle 0.8s ease-in-out infinite alternate; transform-box:fill-box; transform-origin:center; }
@keyframes nk-sparkle { from{transform:scale(0.5) opacity(0.5)} to{transform:scale(1.2) opacity(1)} }
`

export function NekoCat({ state, size = 180 }: Props) {
  const isError    = state === 'error'
  const isSuccess  = state === 'success'
  const isThinking = state === 'thinking' || state === 'working'

  return (
    <svg viewBox="0 0 200 200" width={size} height={size} style={{ overflow: 'visible' }}>
      <defs>
        <style>{CSS}</style>
        
        <radialGradient id="nk-fur" cx="40%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#ffffff"/>
          <stop offset="85%" stopColor="#f3f5f9"/>
          <stop offset="100%" stopColor="#e0e5ee"/>
        </radialGradient>
        
        <linearGradient id="nk-eye-grad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#1c2c5b"/>
          <stop offset="40%" stopColor="#4a8ade"/>
          <stop offset="100%" stopColor="#a3d5f5"/>
        </linearGradient>
        
        <filter id="nk-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="8" stdDeviation="12" floodColor="rgba(0,0,0,0.18)"/>
        </filter>
      </defs>

      <g className={`nk-root ${state}`} filter="url(#nk-shadow)">
        {/* Left Ear */}
        <path d="M 45,70 Q 30,15 75,35 Z" fill="url(#nk-fur)"/>
        <path d="M 50,65 Q 40,30 70,42 Z" fill="#ffb6c1"/>
        
        {/* Right Ear */}
        <path d="M 155,70 Q 170,15 125,35 Z" fill="url(#nk-fur)"/>
        <path d="M 150,65 Q 160,30 130,42 Z" fill="#ffb6c1"/>

        {/* Head */}
        <ellipse cx="100" cy="100" rx="80" ry="65" fill="url(#nk-fur)"/>

        {/* Left Eye */}
        <g className="nk-blink">
          <ellipse cx="65" cy="95" rx="15" ry="18" fill="url(#nk-eye-grad)"/>
          <circle cx="60" cy="85" r="5.5" fill="#ffffff"/>
          <circle cx="70" cy="105" r="2.5" fill="#ffffff" opacity="0.8"/>
          {isError && <path d="M 45,70 Q 55,78 65,75" fill="none" stroke="#8898b8" strokeWidth="2.5" strokeLinecap="round"/>}
        </g>

        {/* Right Eye */}
        <g className="nk-blink nk-blink2">
          <ellipse cx="135" cy="95" rx="15" ry="18" fill="url(#nk-eye-grad)"/>
          <circle cx="130" cy="85" r="5.5" fill="#ffffff"/>
          <circle cx="140" cy="105" r="2.5" fill="#ffffff" opacity="0.8"/>
          {isError && <path d="M 135,75 Q 145,78 155,70" fill="none" stroke="#8898b8" strokeWidth="2.5" strokeLinecap="round"/>}
        </g>

        {/* Blush */}
        <ellipse cx="40" cy="110" rx="12" ry="7" fill="#ffb6c1" opacity="0.4"/>
        <ellipse cx="160" cy="110" rx="12" ry="7" fill="#ffb6c1" opacity="0.4"/>

        {/* Nose & Mouth */}
        <path d="M 97,110 L 103,110 L 100,113 Z" fill="#ff9eb5"/>
        {isSuccess ? (
          <path d="M 90,118 Q 100,130 110,118" fill="none" stroke="#ff9eb5" strokeWidth="2.5" strokeLinecap="round"/>
        ) : isError ? (
          <path d="M 90,120 Q 100,115 110,120" fill="none" stroke="#d494a4" strokeWidth="2" strokeLinecap="round"/>
        ) : (
          <path d="M 92,118 Q 96,124 100,119 Q 104,124 108,118" fill="none" stroke="#ff9eb5" strokeWidth="2.5" strokeLinecap="round"/>
        )}

        {/* Left Paw (waving/holding) */}
        <g className="nk-paw" transform="translate(16, 120) rotate(-20)">
          <ellipse cx="25" cy="20" rx="20" ry="15" fill="url(#nk-fur)"/>
          <ellipse cx="27" cy="22" rx="10" ry="8" fill="#ffb6c1"/>
          <circle cx="12" cy="15" r="4" fill="#ffb6c1"/>
          <circle cx="22" cy="8" r="4" fill="#ffb6c1"/>
          <circle cx="34" cy="9" r="4" fill="#ffb6c1"/>
          <circle cx="42" cy="17" r="4" fill="#ffb6c1"/>
        </g>

        {/* Right Paw (resting) */}
        <g transform="translate(130, 125) rotate(15)">
          <ellipse cx="25" cy="20" rx="20" ry="15" fill="url(#nk-fur)"/>
          <ellipse cx="23" cy="22" rx="10" ry="8" fill="#ffb6c1"/>
          <circle cx="8" cy="17" r="4" fill="#ffb6c1"/>
          <circle cx="16" cy="9" r="4" fill="#ffb6c1"/>
          <circle cx="28" cy="8" r="4" fill="#ffb6c1"/>
          <circle cx="38" cy="15" r="4" fill="#ffb6c1"/>
        </g>

        {/* Decor: Thinking Bubbles */}
        {isThinking && (
          <g>
            <circle cx="160" cy="55" r="6" fill="#a4c4f4"/>
            <circle cx="172" cy="40" r="9" fill="#a4c4f4"/>
            <circle cx="185" cy="20" r="12" fill="#a4c4f4"/>
            <text x="185" y="24" fontSize="10" fontWeight="bold" textAnchor="middle" fill="#1c2c5b">?</text>
          </g>
        )}

        {/* Decor: Sparkles */}
        {isSuccess && (
          <g>
            <path className="nk-spark" d="M 30,50 Q 30,40 40,40 Q 30,40 30,30 Q 30,40 20,40 Q 30,40 30,50 Z" fill="#ffda75"/>
            <path className="nk-spark" style={{animationDelay:'0.3s'}} d="M 170,50 Q 170,45 175,45 Q 170,45 170,40 Q 170,45 165,45 Q 170,45 170,50 Z" fill="#ffda75"/>
          </g>
        )}
        
        {/* Decor: Sweat/Tears */}
        {isError && (
          <path d="M 155,100 Q 150,110 155,115 Q 160,110 155,100 Z" fill="#a3d5f5" opacity="0.8"/>
        )}
      </g>
    </svg>
  )
}
