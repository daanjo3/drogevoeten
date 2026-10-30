import type { CSSProperties } from "react";

/* The landscape on the start screen: three svg layers (sea higher than the
   polder, dike, mill, pumping station) with parallax and subtle animations.
   Ported from the design prototype. */

export type LandscapePhase = "idle" | "going";

/* zoom scale and downward shift per layer during the leaving transition */
const ZOOM = [1.3, 2, 3];
const SHIFT = [4, 10, 18];

export function Landscape({ phase, dx }: { phase: LandscapePhase; dx: number }) {
  let i = 0;
  /* dx is the pointer position from -0.5 to 0.5; each layer moves at most
     24px times its own factor */
  function layerStyle(factor: number): CSSProperties {
    const n = i++;
    if (phase === "going") {
      return {
        transformOrigin: "56% 80%",
        transition: "transform 1.2s cubic-bezier(.55,0,.35,1) .25s",
        transform: `scale(${ZOOM[n]}) translateY(${SHIFT[n]}%)`,
      };
    }
    return { transform: `translateX(${dx * -24 * factor}px)` };
  }

  return (
    <div className="land" aria-hidden="true">
      <svg className="lyr" style={layerStyle(0.25)} viewBox="0 0 1440 400" preserveAspectRatio="xMidYMax slice">
        <g className="drift" fill="#fff" opacity=".85">
          <rect x="170" y="104" width="230" height="40" rx="20"/><circle cx="235" cy="104" r="34"/><circle cx="300" cy="94" r="44"/><circle cx="360" cy="110" r="26"/>
        </g>
        <g className="drift b" fill="#fff" opacity=".75">
          <rect x="1030" y="70" width="210" height="34" rx="17"/><circle cx="1090" cy="70" r="30"/><circle cx="1150" cy="62" r="38"/>
        </g>
        <path d="M0 268 Q360 244 720 256 T1440 250 V400 H0Z" fill="#c3d1bc"/>
        <g fill="#a3b89b">
          <rect x="652" y="236" width="6" height="16" rx="3"/><circle cx="655" cy="232" r="16"/>
          <rect x="684" y="240" width="6" height="14" rx="3"/><circle cx="687" cy="236" r="12"/>
          <rect x="1052" y="232" width="6" height="18" rx="3"/><circle cx="1055" cy="228" r="17"/>
          <rect x="1352" y="234" width="6" height="16" rx="3"/><circle cx="1355" cy="230" r="14"/>
        </g>
        <g transform="translate(790 256)" fill="#a3b89b">
          <polygon points="-12,0 12,0 8,-40 -8,-40"/>
          <g transform="translate(0 -44)"><g className="spin slow">
            <rect x="-3" y="-34" width="6" height="68" rx="3"/><rect x="-34" y="-3" width="68" height="6" rx="3"/>
          </g></g>
        </g>
      </svg>
      
      <svg className="lyr" style={layerStyle(0.6)} viewBox="0 0 1440 400" preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id="seaG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5fb4ec"/><stop offset="1" stopColor="#0087D8"/></linearGradient>
          <linearGradient id="fieldG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#93ab8b"/><stop offset="1" stopColor="#617E5A"/></linearGradient>
        </defs>
        {/* zee, hoger dan het land */}
        <rect x="0" y="258" width="480" height="142" fill="url(#seaG)"/>
        <g stroke="#fff" strokeWidth="6" strokeLinecap="round" fill="none" opacity=".75">
          <path className="bob" d="M40 286 q22 -10 44 0"/><path className="bob b" d="M170 300 q22 -10 44 0"/>
          <path className="bob" d="M300 282 q22 -10 44 0"/><path className="bob b" d="M90 340 q22 -10 44 0"/><path className="bob" d="M250 352 q22 -10 44 0"/>
        </g>
        {/* dijk */}
        <path d="M430 400 L476 244 Q510 228 548 244 L660 312 L660 400Z" fill="#7a8f5c"/>
        <path d="M476 244 Q510 228 548 244" stroke="#617E5A" strokeWidth="8" strokeLinecap="round" fill="none"/>
        {/* polder, lager dan de zee */}
        <path d="M640 312 L1440 302 V400 H640Z" fill="url(#fieldG)"/>
        <g stroke="#0087D8" strokeWidth="9" strokeLinecap="round" fill="none" opacity=".8">
          <path className="shimmer" d="M700 340 L1440 330"/><path className="shimmer" d="M740 376 L1440 366" style={{ animationDelay: "-3s" }}/>
        </g>
        {/* molen */}
        <g transform="translate(900 314) scale(.82)">
          <polygon points="-36,0 36,0 24,-124 -24,-124" fill="#242424"/>
          <path d="M-28 -122 Q0 -162 28 -122Z" fill="#242424"/>
          <rect x="-10" y="-40" width="20" height="40" rx="10" fill="#F4EFEB"/>
          <g transform="translate(0 -132)"><g className="spin">
            <g fill="#F4EFEB" stroke="#242424" strokeWidth="4">
              <rect x="6" y="-106" width="24" height="84" rx="4"/><rect x="-30" y="22" width="24" height="84" rx="4"/>
              <rect x="-106" y="-30" width="84" height="24" rx="4"/><rect x="22" y="6" width="84" height="24" rx="4"/>
            </g>
            <rect x="-6" y="-112" width="12" height="224" rx="6" fill="#242424"/>
            <rect x="-112" y="-6" width="224" height="12" rx="6" fill="#242424"/>
          </g>
          <circle r="10" fill="#FFA654" stroke="#242424" strokeWidth="5"/></g>
        </g>
        {/* gemaal met rook */}
        <g transform="translate(1120 314) scale(.9)">
          <circle className="smoke" cx="128" cy="-152" r="12" fill="#fff"/>
          <circle className="smoke s2" cx="128" cy="-152" r="12" fill="#fff"/>
          <circle className="smoke s3" cx="128" cy="-152" r="12" fill="#fff"/>
          <rect x="118" y="-150" width="20" height="60" rx="4" fill="#7a432c"/>
          <rect x="0" y="-90" width="160" height="90" rx="8" fill="#9b5a3c"/>
          <polygon points="-14,-84 174,-84 80,-136" fill="#242424" stroke="#242424" strokeWidth="8" strokeLinejoin="round"/>
          <g fill="#F4EFEB"><path d="M20 -6 v-46 a12 12 0 0 1 24 0 v46z"/><path d="M68 -6 v-46 a12 12 0 0 1 24 0 v46z"/><path d="M116 -6 v-46 a12 12 0 0 1 24 0 v46z"/></g>
        </g>
      </svg>
      
      <svg className="lyr" style={layerStyle(1.1)} viewBox="0 0 1440 400" preserveAspectRatio="xMidYMax slice">
        <path d="M0 374 Q240 348 520 364 T1040 354 T1440 362 V400 H0Z" fill="#4f6a49"/>
        <g stroke="#4f6a49" strokeWidth="7" strokeLinecap="round" fill="none">
          <g className="sway"><path d="M118 376 l-10 -48 M130 376 l2 -58 M142 376 l12 -44"/></g>
          <g className="sway b"><path d="M560 368 l-8 -40 M570 368 l3 -50"/></g>
          <g className="sway"><path d="M990 362 l-10 -44 M1002 362 l2 -54 M1014 362 l12 -40"/></g>
          <g className="sway b"><path d="M1318 366 l-8 -46 M1330 366 l4 -56"/></g>
        </g>
      </svg>
    </div>
  );
}
