import type { CatState } from '../../store/app'

interface Props {
  state: CatState
  size?: number
}

const CSS = `
.nc { animation: nc-float 3s ease-in-out infinite; }
.nc.thinking, .nc.working { animation: nc-think 1.4s ease-in-out infinite; }
.nc.success { animation: nc-bounce 0.55s ease-in-out 3; }
.nc.error   { animation: nc-shake 0.4s ease-in-out 3; }

@keyframes nc-float  { 0%,100%{transform:translateY(0)}    50%{transform:translateY(-7px)} }
@keyframes nc-think  { 0%,100%{transform:translateY(0) rotate(0deg)} 35%{transform:translateY(-5px) rotate(-4deg)} 70%{transform:translateY(-5px) rotate(4deg)} }
@keyframes nc-bounce { 0%,100%{transform:scale(1) translateY(0)} 50%{transform:scale(1.07) translateY(-10px)} }
@keyframes nc-shake  { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-6px)} 75%{transform:translateX(6px)} }

.nc-eye {
  animation: nc-blink 4.5s ease-in-out infinite;
  transform-box: fill-box;
  transform-origin: center;
}
@keyframes nc-blink { 0%,88%,100%{transform:scaleY(1)} 93%{transform:scaleY(0.07)} }

.nc-paw {
  animation: nc-wave 2.2s ease-in-out infinite;
  transform-box: fill-box;
  transform-origin: center bottom;
}
.nc.success .nc-paw { animation: nc-wave-fast 0.45s ease-in-out infinite; }

@keyframes nc-wave      { 0%,100%{transform:rotate(0deg)}   25%{transform:rotate(-20deg)} 75%{transform:rotate(14deg)} }
@keyframes nc-wave-fast { 0%,100%{transform:rotate(-28deg)} 50%{transform:rotate(28deg)} }
`

export function NekoCat({ state, size = 180 }: Props) {
  const isError            = state === 'error'
  const isSuccess          = state === 'success'
  const isThinkingOrWorking = state === 'thinking' || state === 'working'

  return (
    <svg viewBox="0 0 200 224" width={size} height={size} style={{ overflow: 'visible' }}>
      <defs>
        <style>{CSS}</style>

        {/* Soft white fur */}
        <radialGradient id="nc-body" cx="40%" cy="30%" r="70%">
          <stop offset="0%"   stopColor="#ffffff" />
          <stop offset="100%" stopColor="#f0edf5" />
        </radialGradient>

        {/* Blue iris gradient — top light, edge deep */}
        <radialGradient id="nc-iris" cx="38%" cy="32%" r="66%">
          <stop offset="0%"   stopColor="#daeaf8" />
          <stop offset="50%"  stopColor="#9cbae8" />
          <stop offset="100%" stopColor="#6882c8" />
        </radialGradient>

        {/* Deep pupil */}
        <radialGradient id="nc-pupil" cx="35%" cy="28%" r="72%">
          <stop offset="0%"   stopColor="#3c4285" />
          <stop offset="100%" stopColor="#181830" />
        </radialGradient>
      </defs>

      <g className={`nc ${state}`}>

        {/* ── EARS ── */}
        <path d="M36,74 L58,15 L89,71"   fill="url(#nc-body)" stroke="#ccc3cc" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M45,70 L61,27 L81,67"   fill="#f5abc0" />
        <path d="M111,71 L142,15 L164,74" fill="url(#nc-body)" stroke="#ccc3cc" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M119,67 L139,27 L155,70" fill="#f5abc0" />

        {/* ── HEAD ── */}
        <ellipse cx="100" cy="103" rx="70" ry="68" fill="url(#nc-body)" stroke="#ccc3cc" strokeWidth="1.5" />

        {/* ── LEFT EYE ── */}
        <g className="nc-eye">
          <circle cx="75" cy="97" r="22"   fill="white" stroke="#ccc3cc" strokeWidth="1" />
          <circle cx="75" cy="97" r="18.5" fill="url(#nc-iris)" />
          <ellipse cx="75" cy="99" rx="9" ry="12" fill="url(#nc-pupil)" />
          <circle cx="67" cy="89" r="6"   fill="white" opacity="0.9" />
          <circle cx="80" cy="88" r="3.5" fill="white" opacity="0.65" />
          {isError && <path d="M56,82 L93,87" stroke="#aaa0aa" strokeWidth="2.5" strokeLinecap="round" fill="none" />}
        </g>

        {/* ── RIGHT EYE ── */}
        <g className="nc-eye" style={{ animationDelay: '0.18s' }}>
          <circle cx="125" cy="97" r="22"   fill="white" stroke="#ccc3cc" strokeWidth="1" />
          <circle cx="125" cy="97" r="18.5" fill="url(#nc-iris)" />
          <ellipse cx="125" cy="99" rx="9" ry="12" fill="url(#nc-pupil)" />
          <circle cx="117" cy="89" r="6"   fill="white" opacity="0.9" />
          <circle cx="130" cy="88" r="3.5" fill="white" opacity="0.65" />
          {isError && <path d="M107,87 L144,82" stroke="#aaa0aa" strokeWidth="2.5" strokeLinecap="round" fill="none" />}
        </g>

        {/* ── NOSE ── */}
        <path d="M97,121 L100,126 L103,121 Q100,119 97,121Z" fill="#f090a2" />

        {/* ── MOUTH ── */}
        {isSuccess ? (
          <path d="M87,127 Q100,141 113,127" fill="none" stroke="#d07888" strokeWidth="2" strokeLinecap="round" />
        ) : isError ? (
          <path d="M93,134 Q97,129 100,128 Q103,129 107,134" fill="none" stroke="#d07888" strokeWidth="1.5" strokeLinecap="round" />
        ) : (
          <>
            <path d="M100,127 Q95,134 90,131" fill="none" stroke="#d07888" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M100,127 Q105,134 110,131" fill="none" stroke="#d07888" strokeWidth="1.5" strokeLinecap="round" />
          </>
        )}

        {/* ── CHEEKS ── */}
        <ellipse cx="56"  cy="120" rx="14" ry="9" fill="#f9b8c4" opacity="0.42" />
        <ellipse cx="144" cy="120" rx="14" ry="9" fill="#f9b8c4" opacity="0.42" />

        {/* ── WHISKERS ── */}
        <line x1="26" y1="115" x2="67" y2="119" stroke="#c0b4c0" strokeWidth="0.9" opacity="0.5" />
        <line x1="24" y1="122" x2="66" y2="123" stroke="#c0b4c0" strokeWidth="0.9" opacity="0.5" />
        <line x1="26" y1="129" x2="67" y2="127" stroke="#c0b4c0" strokeWidth="0.9" opacity="0.5" />
        <line x1="133" y1="119" x2="174" y2="115" stroke="#c0b4c0" strokeWidth="0.9" opacity="0.5" />
        <line x1="134" y1="123" x2="176" y2="122" stroke="#c0b4c0" strokeWidth="0.9" opacity="0.5" />
        <line x1="133" y1="127" x2="174" y2="129" stroke="#c0b4c0" strokeWidth="0.9" opacity="0.5" />

        {/* ── BODY ── */}
        <ellipse cx="100" cy="192" rx="44" ry="33" fill="url(#nc-body)" stroke="#ccc3cc" strokeWidth="1.5" />

        {/* ── LEFT ARM + RAISED PAW (waving) ── */}
        <g className="nc-paw">
          <path d="M62,155 Q43,136 36,113" fill="none" stroke="#e8e4ec" strokeWidth="15" strokeLinecap="round" />
          <path d="M62,155 Q43,136 36,113" fill="none" stroke="#ccc3cc" strokeWidth="16.5" strokeLinecap="round" opacity="0.2" />
          {/* Main paw pad */}
          <ellipse cx="32" cy="106" rx="19" ry="15" fill="#f5b5c2" stroke="#d8a0b2" strokeWidth="1.2" />
          {/* Toe pads */}
          <ellipse cx="22" cy="96" rx="6.5" ry="5.5" fill="#eca0b5" stroke="#d8a0b2" strokeWidth="1" />
          <ellipse cx="33" cy="93" rx="6.5" ry="5.5" fill="#eca0b5" stroke="#d8a0b2" strokeWidth="1" />
          <ellipse cx="43" cy="97" rx="6.5" ry="5.5" fill="#eca0b5" stroke="#d8a0b2" strokeWidth="1" />
        </g>

        {/* ── RIGHT ARM + RESTING PAW ── */}
        <path d="M138,155 Q155,168 155,184" fill="none" stroke="#e8e4ec" strokeWidth="15" strokeLinecap="round" />
        <path d="M138,155 Q155,168 155,184" fill="none" stroke="#ccc3cc" strokeWidth="16.5" strokeLinecap="round" opacity="0.2" />
        <ellipse cx="153" cy="190" rx="20" ry="13" fill="#f5b5c2" stroke="#d8a0b2" strokeWidth="1.2" transform="rotate(-12,153,190)" />
        <ellipse cx="142" cy="181" rx="6" ry="5" fill="#eca0b5" stroke="#d8a0b2" strokeWidth="1" transform="rotate(-12,142,181)" />
        <ellipse cx="152" cy="178" rx="6" ry="5" fill="#eca0b5" stroke="#d8a0b2" strokeWidth="1" transform="rotate(-12,152,178)" />
        <ellipse cx="161" cy="183" rx="6" ry="5" fill="#eca0b5" stroke="#d8a0b2" strokeWidth="1" transform="rotate(-12,161,183)" />
        {/* Single claw peek */}
        <path d="M154,200 Q153,208 150,211" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" />

        {/* ── THINKING BUBBLES ── */}
        {isThinkingOrWorking && (
          <g>
            <circle cx="168" cy="60" r="5"  fill="#c8a8e0" opacity="0.65" />
            <circle cx="178" cy="44" r="7.5" fill="#c8a8e0" opacity="0.75" />
            <circle cx="185" cy="25" r="10" fill="#c8a8e0" opacity="0.82" />
          </g>
        )}

        {/* ── SUCCESS SPARKLES ── */}
        {isSuccess && (
          <g>
            <circle cx="20" cy="62" r="3" fill="#ffd860" opacity="0.85" />
            <path d="M13,62 H27 M20,55 V69" stroke="#ffd860" strokeWidth="2" strokeLinecap="round" fill="none" />
            <circle cx="175" cy="52" r="2" fill="#ffd860" opacity="0.8" />
            <path d="M170,52 H180 M175,47 V57" stroke="#ffd860" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          </g>
        )}

        {/* ── ERROR TEARS ── */}
        {isError && (
          <>
            <ellipse cx="65"  cy="115" rx="3.5" ry="6" fill="#b8d4f8" opacity="0.75" />
            <ellipse cx="135" cy="115" rx="3.5" ry="6" fill="#b8d4f8" opacity="0.75" />
          </>
        )}
      </g>
    </svg>
  )
}
