import type { CatState } from '../../store/app'

interface Props {
  state: CatState
  size?: number
}

const CSS = `
.nk-root {
  display: block;
  overflow: visible;
}

.nk-float {
  animation: float 4s ease-in-out infinite;
  transform-origin: center;
}

.nk-wave {
  animation: wave 3s ease-in-out infinite;
  transform-origin: 35px 125px;
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
}

@keyframes wave {
  0%, 100% { transform: rotate(0deg); }
  50% { transform: rotate(12deg); }
}

.nk-blink {
  animation: blink 4.5s infinite;
  transform-origin: center;
  transform-box: fill-box;
}

@keyframes blink {
  0%, 94%, 100% { transform: scaleY(1); }
  97% { transform: scaleY(0.05); }
}

/* State: Working (Typing) */
.working .nk-tap { animation: tap 0.35s ease-in-out infinite alternate; }
.working .nk-float { animation: bob 1.5s ease-in-out infinite; }
@keyframes tap { 0% { transform: translateY(0); } 100% { transform: translateY(4px); } }
@keyframes bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(3px); } }

/* State: Success (Happy jump) */
.success .nk-float { animation: jump 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 1; }
.success .nk-wave { animation: fast-wave 0.5s ease-in-out 3; }
@keyframes jump { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-16px); } }
@keyframes fast-wave { 0%, 100% { transform: rotate(0deg); } 50% { transform: rotate(20deg); } }

/* State: Error (Sad shake) */
.error .nk-float { animation: shake 0.5s ease-in-out 2; }
@keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }

/* Effects */
.nk-fade { animation: fade 1.5s infinite alternate; }
.nk-fade.delay1 { animation-delay: 0.3s; }
.nk-fade.delay2 { animation-delay: 0.6s; }
@keyframes fade { 0% { opacity: 0.2; transform: scale(0.9); } 100% { opacity: 1; transform: scale(1.1); } }
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
        
        {/* Exact logo eye gradient */}
        <linearGradient id="eyeGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4a6cb3"/>     {/* Deep Blue */}
          <stop offset="50%" stopColor="#7aa4e8"/>    {/* Mid Blue */}
          <stop offset="100%" stopColor="#b4e4ff"/>   {/* Light Cyan */}
        </linearGradient>

        <linearGradient id="boardGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#cce8fa"/>
          <stop offset="100%" stopColor="#b0dafa"/>
        </linearGradient>
      </defs>

      <g className={`nk-root ${state}`}>
        
        <g className="nk-float">
          
          {/* === EARS === */}
          {/* Left Ear */}
          <path d="M 40 85 L 50 35 Q 55 20 65 30 L 85 50" fill="#ffffff" stroke="#d6cde5" strokeWidth="4.5" strokeLinejoin="round"/>
          {/* Left Inner Ear */}
          <path d="M 49 76 L 55 42 Q 58 32 64 40 L 77 53" fill="#ffcce0"/>
          
          {/* Right Ear */}
          <path d="M 160 85 L 150 35 Q 145 20 135 30 L 115 50" fill="#ffffff" stroke="#d6cde5" strokeWidth="4.5" strokeLinejoin="round"/>
          {/* Right Inner Ear */}
          <path d="M 151 76 L 145 42 Q 142 32 136 40 L 123 53" fill="#ffcce0"/>

          {/* === HEAD === */}
          <path d="M 30 100 C 30 50, 60 40, 100 40 C 140 40, 170 50, 170 100 C 170 155, 145 165, 100 165 C 55 165, 30 155, 30 100 Z" 
                fill="#ffffff" stroke="#d6cde5" strokeWidth="4.5" />

          {/* Blush */}
          <ellipse cx="48" cy="120" rx="12" ry="6" fill="#ffb6c1" opacity="0.45"/>
          <ellipse cx="152" cy="120" rx="12" ry="6" fill="#ffb6c1" opacity="0.45"/>

          {/* === EYES === */}
          {!isSuccess && !isError && (
            <g className="nk-blink">
              {/* Left Eye */}
              <ellipse cx="70" cy="105" rx="15" ry="19" fill="url(#eyeGrad)" />
              <circle cx="64" cy="95" r="5.5" fill="#ffffff"/>
              <circle cx="76" cy="115" r="2.5" fill="#ffffff" opacity="0.9"/>
              
              {/* Right Eye */}
              <ellipse cx="130" cy="105" rx="15" ry="19" fill="url(#eyeGrad)" />
              <circle cx="124" cy="95" r="5.5" fill="#ffffff"/>
              <circle cx="136" cy="115" r="2.5" fill="#ffffff" opacity="0.9"/>
            </g>
          )}

          {/* Success Eyes ^ ^ */}
          {isSuccess && (
            <g stroke="#4a6cb3" strokeWidth="4.5" strokeLinecap="round" fill="none">
              <path d="M 58 108 Q 70 92 82 108" />
              <path d="M 118 108 Q 130 92 142 108" />
            </g>
          )}

          {/* Error Eyes > < */}
          {isError && (
            <g>
              <g stroke="#4a6cb3" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
                <path d="M 62 100 L 74 108 L 62 116" />
                <path d="M 138 100 L 126 108 L 138 116" />
              </g>
              {/* Blue Tears */}
              <ellipse cx="70" cy="125" rx="4" ry="6" fill="#7aa4e8"/>
              <ellipse cx="130" cy="125" rx="4" ry="6" fill="#7aa4e8"/>
            </g>
          )}

          {/* Nose */}
          <path d="M 98 118 Q 100 120 102 118" fill="none" stroke="#FFA8B6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          
          {/* Mouth */}
          {isSuccess ? (
            <path d="M 92 125 Q 100 135 108 125" fill="none" stroke="#FFA8B6" strokeWidth="2.5" strokeLinecap="round"/>
          ) : isError ? (
            <path d="M 94 128 Q 100 122 106 128" fill="none" stroke="#FFA8B6" strokeWidth="2.5" strokeLinecap="round"/>
          ) : (
            <path d="M 93 125 Q 96.5 130 100 125 Q 103.5 130 107 125" fill="none" stroke="#FFA8B6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          )}

          {/* === THE FLUFFY WAVING PAW (Left) === */}
          <g className="nk-wave">
            {/* Outline & fill of paw */}
            <path d="M 15 130 Q 10 95 35 95 Q 60 95 55 130 Q 50 152 35 155 Q 20 152 15 130 Z" fill="#ffffff" stroke="#d6cde5" strokeWidth="4.5"/>
            {/* Pink Beans */}
            <path d="M 28 130 C 32 125, 38 125, 42 130 A 6 6 0 0 1 28 130 Z" fill="#FFA8B6"/>
            <circle cx="22" cy="120" r="4.5" fill="#FFA8B6"/>
            <circle cx="30" cy="110" r="5" fill="#FFA8B6"/>
            <circle cx="40" cy="110" r="5" fill="#FFA8B6"/>
            <circle cx="48" cy="120" r="4.5" fill="#FFA8B6"/>
          </g>

        </g>

        {/* === THE BOTTOM SIGN BOARD === */}
        {/* Exact same shape and pastel blue as the logo's NekoClaw sign */}
        <g transform="translate(0, 10)">
          <rect x="18" y="150" width="164" height="32" rx="16" fill="url(#boardGrad)" stroke="#d6cde5" strokeWidth="4"/>
          {/* Inner white rim */}
          <rect x="24" y="154" width="152" height="24" rx="12" fill="none" stroke="#ffffff" strokeWidth="3" opacity="0.6"/>
        </g>

        {/* === RESTING PAW (Right) === */}
        {/* Taps on the board while working */}
        <g className="nk-tap">
          <path d="M 115 155 C 110 135, 155 135, 150 155 C 148 175, 118 175, 115 155 Z" fill="#ffffff" stroke="#d6cde5" strokeWidth="4.5"/>
          {/* Tiny toe lines */}
          <path d="M 125 160 L 125 168 M 133 162 L 133 170 M 141 160 L 141 168" stroke="#d6cde5" strokeWidth="2.5" strokeLinecap="round" opacity="0.7"/>
        </g>

        {/* === DECORATIONS / EFFECTS === */}
        {/* Thinking Bubbles */}
        {isThinking && (
          <g fill="#ffffff" stroke="#d6cde5" strokeWidth="2">
            <circle cx="150" cy="65" r="5" className="nk-fade"/>
            <circle cx="165" cy="50" r="8" className="nk-fade delay1"/>
            <g className="nk-fade delay2">
              <rect x="155" y="10" width="36" height="24" rx="12" />
              <text x="173" y="27" fontSize="16" fill="#8898b8" stroke="none" fontWeight="bold" textAnchor="middle">?</text>
            </g>
          </g>
        )}

        {/* Success Sparkles */}
        {isSuccess && (
          <g fill="#ffe57f">
            <circle cx="40" cy="55" r="4" className="nk-fade"/>
            <circle cx="165" cy="60" r="5" className="nk-fade delay1"/>
            <circle cx="145" cy="30" r="3" className="nk-fade delay2"/>
          </g>
        )}

      </g>
    </svg>
  )
}
