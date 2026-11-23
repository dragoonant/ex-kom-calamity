// The title's poster (docs/presentation-concept.md section 3: "a city skyline poster in flat colour under the
// console"): a teal-to-peach evening sky, a banded sun, drifting clouds, three layers of the City of Tomorrow
// (pale far towers, a teal middle city with windows that come on one by one, cream rocket towers in front after
// mood-dusk-s62), a monorail with its train crossing, civilian cars and an agency patrol car in the air. Flat
// shapes only, our own; deterministic, so every visit paints the same city. Motion is SVG and CSS and stops
// under prefers-reduced-motion.
// Round 10 (docs/art/round-10.md; owner's choice 2026-11-22, "Full painting"): a generated painting
// (public/title/backdrop.webp, title-backdrop-s174; a tall one, s176, for portrait screens) is the whole scene once it
// has loaded, and only what flies stays drawn on top of it: the drifting clouds, the civilian cars and the agency's
// patrol car. Until the painting loads, or if it fails, the poster is drawn in full as before.
import { useEffect, useMemo, useState, type ReactElement } from 'react';

const W = 1600;
const H = 900;
const BASE = 880;

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Kind = 'rocket' | 'slab' | 'dome' | 'mast' | 'step';

interface TowerSpec {
  x: number;
  w: number;
  h: number;
  kind: Kind;
}

/** One silhouette; `windows` adds a grid of panes, some of which light in turn. */
function tower(t: TowerSpec, fill: string, key: string, r: () => number, windows?: { colour: string; share: number }): ReactElement {
  const top = BASE - t.h;
  const parts: ReactElement[] = [];
  const body = (x: number, y: number, w: number, h: number, rx = 0) => <rect key={`${key}-b${parts.length}`} x={x} y={y} width={w} height={h} rx={rx} fill={fill} />;
  switch (t.kind) {
    case 'rocket': {
      parts.push(body(t.x, top + t.w * 0.5, t.w, t.h - t.w * 0.5, t.w * 0.18));
      parts.push(<ellipse key={`${key}-c`} cx={t.x + t.w / 2} cy={top + t.w * 0.55} rx={t.w / 2} ry={t.w * 0.55} fill={fill} />);
      parts.push(<rect key={`${key}-n`} x={t.x + t.w / 2 - 2} y={top - t.w * 0.6} width={4} height={t.w * 0.7} fill={fill} />);
      break;
    }
    case 'slab':
      parts.push(body(t.x, top, t.w, t.h, 4));
      parts.push(body(t.x + t.w * 0.2, top - 14, t.w * 0.6, 16, 3));
      break;
    case 'step':
      parts.push(body(t.x, top + t.h * 0.3, t.w, t.h * 0.7, 3));
      parts.push(body(t.x + t.w * 0.12, top + t.h * 0.12, t.w * 0.76, t.h * 0.2, 3));
      parts.push(body(t.x + t.w * 0.26, top, t.w * 0.48, t.h * 0.14, 3));
      break;
    case 'dome':
      parts.push(body(t.x, top + t.w * 0.45, t.w, t.h - t.w * 0.45, 2));
      parts.push(<path key={`${key}-d`} d={`M ${t.x} ${top + t.w * 0.47} A ${t.w / 2} ${t.w * 0.47} 0 0 1 ${t.x + t.w} ${top + t.w * 0.47} Z`} fill={fill} />);
      break;
    case 'mast': {
      const cx = t.x + t.w / 2;
      parts.push(<path key={`${key}-m`} d={`M ${t.x} ${BASE} L ${cx - 3} ${top + 20} L ${cx + 3} ${top + 20} L ${t.x + t.w} ${BASE} Z`} fill={fill} />);
      parts.push(<circle key={`${key}-o`} cx={cx} cy={top + 14} r={10} fill={fill} />);
      parts.push(<rect key={`${key}-a`} x={cx - 1.5} y={top - 30} width={3} height={40} fill={fill} />);
      break;
    }
  }
  if (windows && (t.kind === 'slab' || t.kind === 'rocket' || t.kind === 'step')) {
    const y0 = top + (t.kind === 'rocket' ? t.w * 0.9 : t.kind === 'step' ? t.h * 0.34 : 12);
    const cols = Math.max(1, Math.floor((t.w - 8) / 12));
    const pitch = (t.w - 8) / cols;
    for (let row = 0; y0 + row * 16 < BASE - 30; row++) {
      for (let c = 0; c < cols; c++) {
        if (r() > windows.share) continue;
        const slow = r() < 0.18;
        parts.push(
          <rect
            key={`${key}-w${row}-${c}`}
            className={slow ? 'poster-twinkle' : undefined}
            style={slow ? { animationDelay: `${(r() * 9).toFixed(2)}s`, animationDuration: `${(6 + r() * 8).toFixed(1)}s` } : undefined}
            x={t.x + 4 + c * pitch + pitch * 0.2}
            y={y0 + row * 16}
            width={pitch * 0.6}
            height={8}
            fill={windows.colour}
          />,
        );
      }
    }
  }
  return <g key={key}>{parts}</g>;
}

function layer(seed: number, n: number, hMin: number, hMax: number, wMin: number, wMax: number, kinds: Kind[]): TowerSpec[] {
  const r = rng(seed);
  const out: TowerSpec[] = [];
  let x = -40;
  for (let i = 0; i < n && x < W + 40; i++) {
    const w = wMin + r() * (wMax - wMin);
    const kind = kinds[Math.floor(r() * kinds.length)]!;
    out.push({ x, w: kind === 'mast' ? w * 0.6 : w, h: hMin + r() * (hMax - hMin), kind });
    x += w + 4 + r() * 18;
  }
  return out;
}

/** A cream rocket tower in the foreground, with a mustard spine and a shaded flank clipped to its outline. */
function heroTower(x: number, w: number, h: number, key: string): ReactElement {
  const top = BASE - h;
  const outline = (
    <>
      <rect x={x} y={top + w * 0.6} width={w} height={h - w * 0.6} rx={w * 0.2} />
      <ellipse cx={x + w / 2} cy={top + w * 0.65} rx={w / 2} ry={w * 0.65} />
    </>
  );
  return (
    <g key={key}>
      <clipPath id={`poster-clip-${key}`}>{outline}</clipPath>
      <g fill="#efe6cf">{outline}</g>
      <g clipPath={`url(#poster-clip-${key})`}>
        <rect x={x + w * 0.64} y={top} width={w * 0.4} height={h} fill="#d9cba6" />
        <rect x={x} y={top} width={w * 0.1} height={h} fill="#fbf7ea" opacity={0.6} />
      </g>
      <rect x={x + w * 0.42} y={top + w * 0.2} width={w * 0.16} height={h - w * 0.2} fill="#d9a62e" />
      <rect x={x + w * 0.46} y={top + w * 0.35} width={w * 0.08} height={h - w * 0.5} fill="#2f5f62" opacity={0.75} />
      <rect x={x - w * 0.08} y={top + h * 0.3} width={w * 1.16} height={10} rx={5} fill="#2f5f62" />
      <rect x={x - w * 0.14} y={top + h * 0.62} width={w * 1.28} height={14} rx={7} fill="#d9a62e" />
      <rect x={x + w / 2 - 3} y={top - w * 0.45} width={6} height={w * 0.7} fill="#c9cdd1" />
      <circle cx={x + w / 2} cy={top - w * 0.45} r={6} fill="#c8322a" className="poster-beacon" />
    </g>
  );
}

const RAIL = `M -60 712 C 260 650, 520 690, 800 664 S 1320 610, 1660 650`;
const SKY_LANES = [
  { d: 'M -80 250 C 400 230, 900 270, 1700 220', dur: 26, colour: '#f1e8d2', delay: 0 },
  { d: 'M 1700 330 C 1200 310, 700 350, -80 300', dur: 34, colour: '#5fa8a0', delay: 6 },
  { d: 'M -80 410 C 500 380, 1000 420, 1700 380', dur: 22, colour: '#d2a23a', delay: 11 },
  { d: 'M 1700 180 C 1100 200, 600 170, -80 190', dur: 40, colour: '#e7dcc1', delay: 3 },
];

/** Loads the painting for this screen's shape; resolves to its url, or null while loading or on a failure. */
function useBackdrop(): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof Image === 'undefined') return;
    const tall = window.matchMedia?.('(orientation: portrait)').matches;
    const want = tall ? 'title/backdrop-tall.webp' : 'title/backdrop.webp';
    const img = new Image();
    let live = true;
    img.onload = () => {
      if (live) setUrl(want);
    };
    img.src = want;
    return () => {
      live = false;
    };
  }, []);
  return url;
}

export function Poster() {
  const backdrop = useBackdrop();
  const reduced = useMemo(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, []);
  const art = useMemo(() => {
    const r = rng(1962);
    const far = layer(11, 60, 160, 380, 30, 70, ['rocket', 'slab', 'dome', 'mast', 'step', 'rocket']).map((t, i) => tower(t, '#a9cbc5', `f${i}`, r));
    const mid = layer(23, 50, 120, 300, 50, 100, ['slab', 'step', 'rocket', 'slab', 'dome']).map((t, i) => tower(t, '#3f7f82', `m${i}`, r, { colour: '#f2c86a', share: 0.4 }));
    const near = layer(37, 40, 50, 130, 70, 140, ['slab', 'step', 'slab']).map((t, i) => tower(t, '#2f5f62', `n${i}`, r, { colour: '#f6d590', share: 0.5 }));
    const stars = Array.from({ length: 40 }, (_, i) => <circle key={`s${i}`} cx={r() * W} cy={r() * 160} r={r() < 0.2 ? 1.8 : 1.1} fill="#fbf7ea" opacity={0.35 + r() * 0.5} />);
    return { far, mid, near, stars };
  }, []);
  return (
    <>
    {backdrop && <div className="poster-backdrop" data-testid="poster-backdrop" style={{ backgroundImage: `url(${backdrop})` }} />}
    <svg className="poster-art" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>
        <linearGradient id="poster-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#24505a" />
          <stop offset="0.3" stopColor="#4f8f92" />
          <stop offset="0.58" stopColor="#9cc1b4" />
          <stop offset="0.74" stopColor="#f2c890" />
          <stop offset="0.9" stopColor="#f0a06a" />
        </linearGradient>
        <radialGradient id="poster-halo" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fbe3a6" stopOpacity="0.85" />
          <stop offset="1" stopColor="#fbe3a6" stopOpacity="0" />
        </radialGradient>
        <mask id="poster-sun-bands">
          <rect x="0" y="0" width={W} height={H} fill="#fff" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <rect key={i} x="0" y={548 + i * 22} width={W} height={4 + i * 2.2} fill="#000" />
          ))}
        </mask>
      </defs>
      {!backdrop && (
        <>
          <rect width={W} height={H} fill="url(#poster-sky)" />
          {art.stars}
          <circle cx="1090" cy="560" r="300" fill="url(#poster-halo)" />
          <circle cx="1090" cy="560" r="150" fill="#f7d58a" mask="url(#poster-sun-bands)" />
        </>
      )}
      <g className="poster-clouds">
        <g className="poster-cloud poster-cloud-a">
          <rect x="120" y="150" width="340" height="26" rx="13" fill="#f8eedb" opacity="0.5" />
          <rect x="200" y="128" width="200" height="26" rx="13" fill="#f8eedb" opacity="0.5" />
        </g>
        <g className="poster-cloud poster-cloud-b">
          <rect x="1000" y="96" width="420" height="22" rx="11" fill="#f8eedb" opacity="0.4" />
          <rect x="1110" y="76" width="220" height="22" rx="11" fill="#f8eedb" opacity="0.4" />
        </g>
        <g className="poster-cloud poster-cloud-c">
          <rect x="560" y="300" width="300" height="18" rx="9" fill="#f9d7b0" opacity="0.7" />
        </g>
      </g>
      {!backdrop && <g>{art.far}</g>}
      {/* Civilian cars on their lanes, small and high. */}
      {SKY_LANES.map((l, i) => (
        <g key={`car${i}`} opacity={reduced ? 0 : 1}>
          <rect x="-14" y="-5" width="28" height="10" rx="5" fill={l.colour} />
          <rect x="-6" y="-9" width="12" height="6" rx="3" fill="#2f4552" />
          {!reduced && <animateMotion dur={`${l.dur}s`} begin={`${l.delay}s`} repeatCount="indefinite" path={l.d} rotate="auto" />}
        </g>
      ))}
      {!backdrop && <g>{art.mid}</g>}
      {!backdrop && (
        <>
      {/* The monorail: track, pylons and a three-car train. */}
      <path d={RAIL} stroke="#d9dde0" strokeWidth="9" fill="none" />
      <path d={RAIL} stroke="#8d959b" strokeWidth="2" fill="none" transform="translate(0 6)" />
      {[60, 260, 470, 690, 900, 1110, 1330, 1540].map((x) => (
        <rect key={`p${x}`} x={x - 6} y={680} width={12} height={BASE - 680} fill="#d9cba6" />
      ))}
      {!reduced &&
        [0, 1, 2].map((i) => (
          <g key={`t${i}`}>
            <rect x="-34" y="-20" width="66" height="22" rx="11" fill="#f1e8d2" />
            <rect x="-28" y="-15" width="54" height="7" rx="3" fill="#f6d590" />
            <rect x="-34" y="-4" width="66" height="4" fill="#d9a62e" />
            <animateMotion dur="18s" begin={`${-i * 0.42}s`} repeatCount="indefinite" path={RAIL} rotate="auto" />
          </g>
        ))}
      <g>{art.near}</g>
      {heroTower(70, 120, 640, 'h1')}
      {heroTower(1380, 140, 620, 'h2')}
      {heroTower(1240, 80, 420, 'h3')}
        </>
      )}
      {/* The agency's patrol car: red with a black belly and two fan pods. */}
      <g className="poster-patrol" opacity={reduced ? 0 : 1}>
        <ellipse cx="0" cy="0" rx="34" ry="11" fill="#c8322a" />
        <path d="M -34 2 Q 0 16 34 2 Z" fill="#1b1b1f" />
        <ellipse cx="6" cy="-8" rx="13" ry="8" fill="#2f4552" />
        <ellipse cx="-16" cy="10" rx="9" ry="5" fill="#c9cdd1" />
        <ellipse cx="16" cy="10" rx="9" ry="5" fill="#c9cdd1" />
        {!reduced && <animateMotion dur="15s" begin="2s" repeatCount="indefinite" path="M -120 520 C 300 460, 700 560, 1000 480 S 1500 430, 1760 470" rotate="auto" />}
      </g>
      {!backdrop && <rect x="0" y={BASE} width={W} height={H - BASE} fill="#1f3f42" />}
    </svg>
    </>
  );
}
