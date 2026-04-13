import type { CatState } from '../../store/app'

interface Props {
  state: CatState
  size?: number
}

const CSS = `
.nk-root { animation: nk-float 3.2s ease-in-out infinite; }
.nk-root.thinking, .nk-root.working { animation: nk-think 1.5s ease-in-out infinite; }
.nk-root.success  { animation: nk-bounce 0.5s cubic-bezier(.36,.07,.19,.97) 3; }
.nk-root.error    { animation: nk-shake 0.45s ease-in-out 3; }

@keyframes nk-float  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
@keyframes nk-think  { 0%,100%{transform:translateY(0) rotate(0)} 35%{transform:translateY(-6px) rotate(-5deg)} 70%{transform:translateY(-6px) rotate(5deg)} }
@keyframes nk-bounce { 0%,100%{transform:scale(1) translateY(0)} 50%{transform:scale(1.06) translateY(-12px)} }
@keyframes nk-shake  { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-7px)} 75%{transform:translateX(7px)} }

.nk-blink {
  animation: nk-blink 5s ease-in-out infinite;
  transform-box: fill-box; transform-origin: center;
}
.nk-blink2 { animation-delay: 0.15s; }
@keyframes nk-blink { 0%,85%,100%{transform:scaleY(1)} 91%{transform:scaleY(0.06)} }

.nk-paw  { animation: nk-wave 2.4s ease-in-out infinite; transform-box:fill-box; transform-origin:50% 90%; }
.nk-root.success .nk-paw { animation: nk-wave-fast 0.4s ease-in-out infinite; }
@keyframes nk-wave      { 0%,100%{transform:rotate(0)}   30%{transform:rotate(-22deg)} 70%{transform:rotate(16deg)} }
@keyframes nk-wave-fast { 0%,100%{transform:rotate(-30deg)} 50%{transform:rotate(30deg)} }

.nk-bubble { animation: nk-pop 1.8s ease-in-out infinite; transform-box:fill-box; transform-origin:center; }
.nk-bubble2 { animation-delay: 0.35s; }
.nk-bubble3 { animation-delay: 0.7s; }
@keyframes nk-pop { 0%,100%{opacity:0;transform:scale(0.5)} 50%{opacity:0.85;transform:scale(1)} }

.nk-spark { animation: nk-sparkle 0.7s ease-in-out infinite alternate; transform-box:fill-box; transform-origin:center; }
@keyframes nk-sparkle { from{transform:scale(0.7) rotate(0)} to{transform:scale(1.2) rotate(30deg)} }
`

export function NekoCat({ state, size = 180 }: Props) {
  const isError    = state === 'error'
  const isSuccess  = state === 'success'
  const isThinking = state === 'thinking' || state === 'working'
  const sad        = isError

  return (
    <svg viewBox="0 0 200 230" width={size} height={size} style={{ overflow: 'visible' }}>
      <defs>
        <style>{CSS}</style>

        {/* Head fur – specular top-left */}
        <radialGradient id="nk-fur" cx="38%" cy="28%" r="68%">
          <stop offset="0%"   stopColor="#ffffff"/>
          <stop offset="55%"  stopColor="#f8f4fb"/>
          <stop offset="100%" stopColor="#e4dced"/>
        </radialGradient>

        {/* Ambient occlusion ring at head edge */}
        <radialGradient id="nk-ao" cx="50%" cy="50%" r="50%">
          <stop offset="60%"  stopColor="transparent"/>
          <stop offset="100%" stopColor="rgba(160,140,180,0.28)"/>
        </radialGradient>

        {/* Iris blue gradient */}
        <radialGradient id="nk-iris" cx="36%" cy="30%" r="72%">
          <stop offset="0%"   stopColor="#e0f0ff"/>
          <stop offset="35%"  stopColor="#a0c8f4"/>
          <stop offset="75%"  stopColor="#6090e0"/>
          <stop offset="100%" stopColor="#4870c8"/>
        </radialGradient>

        {/* Deep pupil */}
        <radialGradient id="nk-pupil" cx="34%" cy="28%" r="70%">
          <stop offset="0%"   stopColor="#2c3470"/>
          <stop offset="100%" stopColor="#0c0e22"/>
        </radialGradient>

        {/* Paw pad gradient */}
        <radialGradient id="nk-pad" cx="42%" cy="36%" r="68%">
          <stop offset="0%"   stopColor="#ffd8e4"/>
          <stop offset="100%" stopColor="#e898b0"/>
        </radialGradient>

        {/* Ear inner */}
        <radialGradient id="nk-ear" cx="50%" cy="70%" r="65%">
          <stop offset="0%"   stopColor="#ffc0d0"/>
          <stop offset="100%" stopColor="#e888a8"/>
        </radialGradient>

        {/* Cheek blush */}
        <radialGradient id="nk-blush" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#ffb0c0" stopOpacity="0.55"/>
          <stop offset="100%" stopColor="#ffb0c0" stopOpacity="0"/>
        </radialGradient>

        {/* Soft drop shadow */}
        <filter id="nk-shadow" x="-25%" y="-25%" width="150%" height="160%">
          <feDropShadow dx="0" dy="5" stdDeviation="7" floodColor="#8060a0" floodOpacity="0.22"/>
        </filter>

        {/* Glow for sparkles */}
        <filter id="nk-glow">
          <feGaussianBlur stdDeviation="2.5" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      <g className={`nk-root ${state}`} filter="url(#nk-shadow)">

        {/* ══ EARS ══ */}
        {/* Left ear — outer */}
        <path d="M 50,82 Q 32,44 58,16 Q 72,4 90,55 Z"
              fill="url(#nk-fur)" stroke="#cdc0d8" strokeWidth="1.4" strokeLinejoin="round"/>
        {/* Left ear — inner pink */}
        <path d="M 55,74 Q 42,46 63,24 Q 72,14 84,58 Z" fill="url(#nk-ear)" opacity="0.90"/>

        {/* Right ear — outer */}
        <path d="M 110,55 Q 128,4 142,16 Q 168,44 150,82 Z"
              fill="url(#nk-fur)" stroke="#cdc0d8" strokeWidth="1.4" strokeLinejoin="round"/>
        {/* Right ear — inner pink */}
        <path d="M 116,58 Q 128,14 137,24 Q 158,46 145,74 Z" fill="url(#nk-ear)" opacity="0.90"/>

        {/* ══ HEAD ══ */}
        {/* Ambient occlusion layer (outside) */}
        <ellipse cx="100" cy="108" rx="82" ry="80" fill="url(#nk-ao)"/>
        {/* Main head */}
        <ellipse cx="100" cy="108" rx="78" ry="76"
                 fill="url(#nk-fur)" stroke="#cdc0d8" strokeWidth="1.4"/>

        {/* ══ EYES ══ */}
        {/* Left eye */}
        <g className="nk-blink">
          {/* Sclera */}
          <circle cx="72" cy="102" r="24" fill="white" stroke="#c8bcd4" strokeWidth="1"/>
          {/* Iris */}
          <circle cx="72" cy="104" r="20" fill="url(#nk-iris)"/>
          {/* Pupil */}
          <ellipse cx="72" cy="106" rx="10" ry="14"
                   fill="url(#nk-pupil)"
                   style={{ transform: sad ? 'scaleY(0.6)' : 'none', transformBox: 'fill-box', transformOrigin: 'center' }}/>
          {/* Large highlight */}
          <circle cx="62" cy="93"  r="7"   fill="white" opacity="0.92"/>
          {/* Small highlight */}
          <circle cx="78" cy="92"  r="4"   fill="white" opacity="0.68"/>
          {/* Micro spec */}
          <circle cx="68" cy="113" r="1.8" fill="white" opacity="0.35"/>
          {/* Error frown brow */}
          {sad && <path d="M 52,82 Q 62,87 72,84" fill="none" stroke="#a090b0" strokeWidth="2.2" strokeLinecap="round"/>}
        </g>

        {/* Right eye */}
        <g className="nk-blink nk-blink2">
          <circle cx="128" cy="102" r="24" fill="white" stroke="#c8bcd4" strokeWidth="1"/>
          <circle cx="128" cy="104" r="20" fill="url(#nk-iris)"/>
          <ellipse cx="128" cy="106" rx="10" ry="14"
                   fill="url(#nk-pupil)"
                   style={{ transform: sad ? 'scaleY(0.6)' : 'none', transformBox: 'fill-box', transformOrigin: 'center' }}/>
          <circle cx="118" cy="93"  r="7"   fill="white" opacity="0.92"/>
          <circle cx="134" cy="92"  r="4"   fill="white" opacity="0.68"/>
          <circle cx="124" cy="113" r="1.8" fill="white" opacity="0.35"/>
          {sad && <path d="M 128,84 Q 138,87 148,82" fill="none" stroke="#a090b0" strokeWidth="2.2" strokeLinecap="round"/>}
        </g>

        {/* ══ NOSE ══ */}
        <path d="M 97,130 L 100,135 L 103,130 Q 100,127 97,130 Z" fill="#f090a8"/>
        {/* Nose shine */}
        <ellipse cx="99" cy="130" rx="1.4" ry="0.9" fill="white" opacity="0.55" transform="rotate(-10,99,130)"/>

        {/* ══ MOUTH ══ */}
        {isSuccess ? (
          /* Big smile */
          <path d="M 86,138 Q 100,155 114,138"
                fill="none" stroke="#d070a0" strokeWidth="2.2" strokeLinecap="round"/>
        ) : sad ? (
          /* Sad frown */
          <path d="M 91,146 Q 97,139 100,138 Q 103,139 109,146"
                fill="none" stroke="#c070a0" strokeWidth="1.8" strokeLinecap="round"/>
        ) : (
          /* Normal cute W mouth */
          <>
            <path d="M 100,136 Q 94,145 88,141" fill="none" stroke="#d078a0" strokeWidth="1.8" strokeLinecap="round"/>
            <path d="M 100,136 Q 106,145 112,141" fill="none" stroke="#d078a0" strokeWidth="1.8" strokeLinecap="round"/>
          </>
        )}

        {/* ══ CHEEKS ══ */}
        <ellipse cx="50"  cy="122" rx="18" ry="12" fill="url(#nk-blush)"/>
        <ellipse cx="150" cy="122" rx="18" ry="12" fill="url(#nk-blush)"/>

        {/* ══ WHISKERS ══ */}
        <line x1="22" y1="118" x2="64" y2="122" stroke="#b8aac8" strokeWidth="0.9" opacity="0.55"/>
        <line x1="20" y1="126" x2="64" y2="127" stroke="#b8aac8" strokeWidth="0.9" opacity="0.55"/>
        <line x1="22" y1="134" x2="64" y2="132" stroke="#b8aac8" strokeWidth="0.9" opacity="0.55"/>
        <line x1="136" y1="122" x2="178" y2="118" stroke="#b8aac8" strokeWidth="0.9" opacity="0.55"/>
        <line x1="136" y1="127" x2="180" y2="126" stroke="#b8aac8" strokeWidth="0.9" opacity="0.55"/>
        <line x1="136" y1="132" x2="178" y2="134" stroke="#b8aac8" strokeWidth="0.9" opacity="0.55"/>

        {/* ══ BODY (tiny peek) ══ */}
        <path d="M 66,182 Q 100,172 134,182 Q 136,210 100,215 Q 64,210 66,182 Z"
              fill="url(#nk-fur)" stroke="#cdc0d8" strokeWidth="1.2"/>

        {/* ══ LEFT ARM + WAVING PAW ══ */}
        <g className="nk-paw">
          {/* Arm */}
          <path d="M 72,175 Q 46,155 32,126"
                fill="none" stroke="#ede8f4" strokeWidth="17" strokeLinecap="round"/>
          <path d="M 72,175 Q 46,155 32,126"
                fill="none" stroke="#cdc0d8" strokeWidth="18.5" strokeLinecap="round" opacity="0.22"/>
          {/* Palm */}
          <ellipse cx="28" cy="119" rx="21" ry="17" fill="url(#nk-pad)" stroke="#d898b0" strokeWidth="1.3"/>
          {/* Palm highlight */}
          <ellipse cx="23" cy="114" rx="6"  ry="4"  fill="white" opacity="0.35" transform="rotate(-20,23,114)"/>
          {/* Toe pads */}
          <ellipse cx="16" cy="108" rx="7"  ry="6"  fill="url(#nk-pad)" stroke="#d898b0" strokeWidth="1"/>
          <ellipse cx="28" cy="104" rx="7"  ry="6"  fill="url(#nk-pad)" stroke="#d898b0" strokeWidth="1"/>
          <ellipse cx="40" cy="108" rx="7"  ry="6"  fill="url(#nk-pad)" stroke="#d898b0" strokeWidth="1"/>
          {/* Toe highlights */}
          <circle cx="14" cy="106" r="2"   fill="white" opacity="0.5"/>
          <circle cx="26" cy="102" r="2"   fill="white" opacity="0.5"/>
          <circle cx="38" cy="106" r="2"   fill="white" opacity="0.5"/>
          {/* Claw peeks */}
          <path d="M 14,114 Q 12,120 10,123" fill="none" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
          <path d="M 28,114 Q 27,121 26,124" fill="none" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
          <path d="M 41,114 Q 41,120 42,123" fill="none" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
        </g>

        {/* ══ RIGHT ARM (resting) ══ */}
        <path d="M 128,175 Q 152,165 160,190"
              fill="none" stroke="#ede8f4" strokeWidth="16" strokeLinecap="round"/>
        <path d="M 128,175 Q 152,165 160,190"
              fill="none" stroke="#cdc0d8" strokeWidth="17.5" strokeLinecap="round" opacity="0.22"/>
        {/* Right paw rest */}
        <ellipse cx="161" cy="196" rx="19" ry="12"
                 fill="url(#nk-pad)" stroke="#d898b0" strokeWidth="1.3"
                 transform="rotate(-15,161,196)"/>
        <ellipse cx="151" cy="187" rx="6.5" ry="5.5" fill="url(#nk-pad)" stroke="#d898b0" strokeWidth="1" transform="rotate(-15,151,187)"/>
        <ellipse cx="161" cy="184" rx="6.5" ry="5.5" fill="url(#nk-pad)" stroke="#d898b0" strokeWidth="1" transform="rotate(-15,161,184)"/>
        <ellipse cx="170" cy="188" rx="6.5" ry="5.5" fill="url(#nk-pad)" stroke="#d898b0" strokeWidth="1" transform="rotate(-15,170,188)"/>
        {/* Single claw peek */}
        <path d="M 160,208 Q 160,216 158,219" fill="none" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>

        {/* ══ THINKING BUBBLES ══ */}
        {isThinking && (
          <g>
            <circle cx="170" cy="68" r="5.5" fill="#c8a4e4" className="nk-bubble"/>
            <circle cx="181" cy="50" r="8"   fill="#c8a4e4" className="nk-bubble nk-bubble2"/>
            <circle cx="188" cy="30" r="11"  fill="#c8a4e4" className="nk-bubble nk-bubble3"/>
            <text x="183" y="35" fontSize="9" textAnchor="middle" fill="#9060b8" fontWeight="600">...</text>
          </g>
        )}

        {/* ══ SUCCESS SPARKLES ══ */}
        {isSuccess && (
          <g filter="url(#nk-glow)">
            <g className="nk-spark">
              <circle cx="22" cy="62" r="3.5" fill="#ffe060"/>
              <path d="M15,62 H29 M22,55 V69" stroke="#ffe060" strokeWidth="2" strokeLinecap="round" fill="none"/>
            </g>
            <g className="nk-spark" style={{ animationDelay: '0.2s' }}>
              <circle cx="178" cy="54" r="2.5" fill="#ffe060"/>
              <path d="M173,54 H183 M178,49 V59" stroke="#ffe060" strokeWidth="1.6" strokeLinecap="round" fill="none"/>
            </g>
            <g className="nk-spark" style={{ animationDelay: '0.4s' }}>
              <circle cx="165" cy="28" r="2"   fill="#ffc0f8"/>
              <path d="M161,28 H169 M165,24 V32" stroke="#ffc0f8" strokeWidth="1.4" strokeLinecap="round" fill="none"/>
            </g>
          </g>
        )}

        {/* ══ ERROR TEARS ══ */}
        {isError && (
          <g>
            <path d="M 56,120 Q 54,130 56,136 Q 58,140 60,136 Q 62,130 60,120 Z"
                  fill="#a8d0f8" opacity="0.8"/>
            <path d="M 140,120 Q 138,130 140,136 Q 142,140 144,136 Q 146,130 144,120 Z"
                  fill="#a8d0f8" opacity="0.8"/>
          </g>
        )}

      </g>
    </svg>
  )
}

