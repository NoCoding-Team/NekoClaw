import type { CatState } from '../../store/app'

interface Props {
  state: CatState
  size?: number
}

const CSS = `
.nk-root {
  display: block;
  overflow: visible;
  font-family: system-ui, sans-serif;
}

/* Core floating animation */
.nk-body-anim { animation: float-body 4s ease-in-out infinite; transform-origin: center; }
.nk-paw-anim { animation: float-paw 4s ease-in-out infinite; transform-origin: center; }

/* State: Working */
.nk-root.working .nk-paw-anim { animation: tap-paw 0.5s ease-in-out infinite; }
.nk-root.working .nk-body-anim { animation: bob-head 1.5s ease-in-out infinite; }

/* State: Thinking */
.nk-root.thinking .nk-body-anim { transform: translateY(-4px); animation: float-body-slow 6s ease-in-out infinite; }
.nk-root.thinking .nk-paw-anim { transform: translateY(-4px); animation: float-paw-slow 6s ease-in-out infinite; }

/* State: Success */
.nk-root.success .nk-body-anim { animation: jump-head 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 1; }
.nk-root.success .nk-paw-anim { animation: jump-paw 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 1; }

/* State: Error */
.nk-root.error .nk-body-anim { animation: shake-head 0.45s ease-in-out 2; }
.nk-root.error .nk-paw-anim { transform: translateY(8px); animation: none; }

/* Keyframes */
@keyframes float-body { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
@keyframes float-paw { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
@keyframes float-body-slow { 0%, 100% { transform: translateY(-4px); } 50% { transform: translateY(-8px); } }
@keyframes float-paw-slow { 0%, 100% { transform: translateY(-4px); } 50% { transform: translateY(-6px); } }

@keyframes tap-paw { 0%, 100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-6px) rotate(-4deg); } }
@keyframes bob-head { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(4px); } }

@keyframes jump-head { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-16px); } }
@keyframes jump-paw { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-22px); } }

@keyframes shake-head { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }

/* Blinking Eyes */
.nk-blink { animation: blink 5s infinite; transform-origin: center; transform-box: fill-box; }
@keyframes blink { 0%, 90%, 100% { transform: scaleY(1); } 95% { transform: scaleY(0.1); } }

/* Thinking Dots */
.nk-dot-anim circle { animation: dot-fade 1.5s infinite; opacity: 0.3; }
.nk-dot-anim .delay-1 { animation-delay: 0.2s; }
.nk-dot-anim .delay-2 { animation-delay: 0.4s; }
@keyframes dot-fade { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }

/* Working Spinner */
.nk-spin { animation: spin 1.2s linear infinite; transform-origin: 0px 0px; }
@keyframes spin { 100% { transform: rotate(360deg); } }
`

export function NekoCat({ state, size = 180 }: Props) {
  const isError    = state === 'error'
  const isSuccess  = state === 'success'
  const isThinking = state === 'thinking'
  const isWorking  = state === 'working'

  return (
    <svg viewBox="0 0 200 200" width={size} height={size} style={{ overflow: 'visible' }}>
      <defs>
        <style>{CSS}</style>
        
        <linearGradient id="eyeGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1E3A8A"/>
          <stop offset="100%" stopColor="#38BDF8"/>
        </linearGradient>

        <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
          <feDropShadow dx="0" dy="10" stdDeviation="12" floodColor="#000000" floodOpacity="0.35"/>
        </filter>

        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
          <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#38BDF8" floodOpacity="0.6"/>
        </filter>
      </defs>

      <g className={`nk-root ${state}`}>
        
        <g className="nk-body-anim" filter="url(#softShadow)">
          {/* Back ears */}
          <path d="M 50 85 L 50 40 L 85 65 Z" fill="#ffffff" stroke="#ffffff" strokeWidth="4" strokeLinejoin="round"/>
          <path d="M 54 78 L 54 48 L 78 64 Z" fill="#FFB6C1"/>

          <path d="M 150 85 L 150 40 L 115 65 Z" fill="#ffffff" stroke="#ffffff" strokeWidth="4" strokeLinejoin="round"/>
          <path d="M 146 78 L 146 48 L 122 64 Z" fill="#FFB6C1"/>

          {/* Head Base ("Squircle") */}
          <rect x="40" y="60" width="120" height="90" rx="45" fill="#ffffff"/>

          {/* Eyes */}
          {!isSuccess && !isError && (
            <g className="nk-blink">
              <ellipse cx="75" cy="100" rx="10" ry="14" fill="url(#eyeGrad)"/>
              <circle cx="71" cy="94" r="4" fill="#ffffff"/>
              <circle cx="78" cy="106" r="2" fill="#ffffff" opacity="0.8"/>

              <ellipse cx="125" cy="100" rx="10" ry="14" fill="url(#eyeGrad)"/>
              <circle cx="121" cy="94" r="4" fill="#ffffff"/>
              <circle cx="128" cy="106" r="2" fill="#ffffff" opacity="0.8"/>
            </g>
          )}

          {/* Success Eyes ^ ^ */}
          {isSuccess && (
            <g stroke="#1E3A8A" strokeWidth="4" strokeLinecap="round" fill="none">
              <path d="M 67 104 Q 75 90 83 104" />
              <path d="M 117 104 Q 125 90 133 104" />
            </g>
          )}

          {/* Error Eyes > < */}
          {isError && (
            <g stroke="#1E3A8A" strokeWidth="4" strokeLinecap="round" fill="none">
              <path d="M 68 95 L 82 108 M 82 95 L 68 108" />
              <path d="M 118 95 L 132 108 M 132 95 L 118 108" />
            </g>
          )}

          {/* Blushes */}
          <ellipse cx="55" cy="112" rx="8" ry="5" fill="#FFB6C1" opacity="0.35"/>
          <ellipse cx="145" cy="112" rx="8" ry="5" fill="#FFB6C1" opacity="0.35"/>

          {/* Nose & Mouth */}
          <path d="M 97 112 L 103 112 L 100 115 Z" fill="#FFB6C1"/>
          {isSuccess ? (
            <path d="M 94 118 Q 100 126 106 118" stroke="#FFB6C1" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
          ) : isError ? (
            <path d="M 94 122 Q 100 116 106 122" stroke="#FFB6C1" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
          ) : (
            <path d="M 93 118 Q 96.5 122 100 118 Q 103.5 122 107 118" stroke="#FFB6C1" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
          )}
        </g>

        {/* The Sleek "DeskClaw/NekoClaw" Sign Board */}
        <g filter="url(#softShadow)">
          <rect x="25" y="145" width="150" height="32" rx="16" fill="#1C2130" stroke="rgba(108, 127, 255, 0.4)" strokeWidth="3"/>
          {/* Inner tech glowing rim */}
          <rect x="29" y="148" width="142" height="6" rx="3" fill="rgba(255, 255, 255, 0.08)"/>
        </g>

        {/* The Signature Cat Paw */}
        <g className="nk-paw-anim" filter="url(#softShadow)">
          <path d="M 75 130 v 20 a 25 25 0 0 0 50 0 v -20 z" fill="#ffffff"/>
          
          {/* Pink Beans */}
          <circle cx="83" cy="146" r="4" fill="#FFB6C1"/>
          <circle cx="94" cy="140" r="4.5" fill="#FFB6C1"/>
          <circle cx="106" cy="140" r="4.5" fill="#FFB6C1"/>
          <circle cx="117" cy="146" r="4" fill="#FFB6C1"/>
          <path d="M 87 156 C 95 166, 105 166, 113 156 A 10 10 0 0 1 87 156 Z" fill="#FFB6C1"/>
        </g>

        {/* Decor: Thinking Bubble */}
        {isThinking && (
          <g className="nk-thought" filter="url(#softShadow)">
            <circle cx="155" cy="74" r="4" fill="#ffffff" />
            <circle cx="168" cy="59" r="6" fill="#ffffff" />
            <rect x="150" y="24" width="38" height="24" rx="12" fill="#ffffff" />
            <g fill="#1E3A8A" className="nk-dot-anim">
              <circle cx="159" cy="36" r="1.5" />
              <circle cx="169" cy="36" r="1.5" className="delay-1" />
              <circle cx="179" cy="36" r="1.5" className="delay-2" />
            </g>
          </g>
        )}

        {/* Decor: Working Spinner */}
        {isWorking && (
          <g transform="translate(170, 36)" filter="url(#glow)">
            <circle cx="0" cy="0" r="10" fill="none" stroke="rgba(56, 189, 248, 0.2)" strokeWidth="3"/>
            <path d="M 0 -10 A 10 10 0 0 1 10 0" fill="none" stroke="#38BDF8" strokeWidth="3" strokeLinecap="round" className="nk-spin"/>
          </g>
        )}

        {/* Decor: Error Sweat Drop */}
        {isError && (
          <g filter="url(#softShadow)">
            <path d="M 140 120 Q 135 130 140 135 Q 145 130 140 120 Z" fill="#38BDF8"/>
          </g>
        )}
        
      </g>
    </svg>
  )
}
