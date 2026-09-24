// Decorative brand artwork behind the sign-in panel: a navy field, a bundle of
// fine blue filaments that pinch in the lower left and fan out to the right,
// and two gold curves sweeping across them. Pure SVG so it stays crisp at any
// size and needs no image asset.

const FILAMENTS = Array.from({ length: 24 }, (_, i) => i);
const UNDERCURRENT = Array.from({ length: 9 }, (_, i) => i);

// The bundle: in from the left, a pinch just below centre-left, then a fan out
// to the right. `i` slides the entry down and the exit up, opening the fan.
const filament = (i: number) =>
  `M -80 ${596 + i * 7} C 50 ${728 + i * 5}, 160 ${820 - i}, 255 ${826 - i * 3}` +
  ` C 442 ${834 - i * 13}, 602 ${560 - i * 21}, 1060 ${300 - i * 29}`;

// Strands peeling off below the pinch, running out to the bottom-right.
const undercurrent = (i: number) =>
  `M -80 ${716 + i * 10} C 60 ${818 + i * 6}, 172 ${858 + i * 4}, 292 ${882 + i * 6}` +
  ` C 482 ${912 + i * 10}, 700 ${944 + i * 8}, 1060 ${958 + i * 6}`;

export default function LoginArtwork() {
  return (
    <svg className="signin-art" viewBox="0 0 1000 960" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="wosField" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#123963" />
          <stop offset="46%" stopColor="#0B2450" />
          <stop offset="100%" stopColor="#05132A" />
        </linearGradient>
        <radialGradient id="wosGlowTop" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#245FAE" stopOpacity=".5" />
          <stop offset="100%" stopColor="#245FAE" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="wosGlowLow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#5FB4FF" stopOpacity=".42" />
          <stop offset="100%" stopColor="#5FB4FF" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="wosGold" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#C9922E" stopOpacity=".25" />
          <stop offset="20%" stopColor="#E8B75A" stopOpacity=".95" />
          <stop offset="64%" stopColor="#F6D284" stopOpacity="1" />
          <stop offset="100%" stopColor="#F6D284" stopOpacity=".12" />
        </linearGradient>
        <linearGradient id="wosGoldSoft" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#E8B75A" stopOpacity="0" />
          <stop offset="42%" stopColor="#E8B75A" stopOpacity=".5" />
          <stop offset="100%" stopColor="#F6D284" stopOpacity=".04" />
        </linearGradient>
      </defs>

      <rect width="1000" height="960" fill="url(#wosField)" />
      <ellipse cx="600" cy="110" rx="560" ry="360" fill="url(#wosGlowTop)" />
      <ellipse cx="330" cy="838" rx="400" ry="180" fill="url(#wosGlowLow)" />

      {/* A wide, very faint pass fakes the bloom. An feGaussianBlur over two dozen
          stroked paths looks marginally softer and costs a full-panel filter
          rasterise, which is not a trade worth making on the sign-in screen. */}
      {FILAMENTS.map((i) => (
        <path key={`bloom${i}`} d={filament(i)} fill="none" stroke="#7CBEF8" strokeWidth="3.4"
          opacity={0.05 + (i % 4) * 0.022} />
      ))}
      {FILAMENTS.map((i) => (
        <path key={i} d={filament(i)} fill="none" stroke="#A8D6FD" strokeWidth=".9"
          opacity={0.17 + (i % 5) * 0.05} />
      ))}
      {UNDERCURRENT.map((i) => (
        <path key={i} d={undercurrent(i)} fill="none" stroke="#7CBEF8" strokeWidth=".8"
          opacity={0.12 + (i % 3) * 0.05} />
      ))}

      {/* gold sweeps: a long S through the bundle, and a thinner echo below it */}
      <path
        d="M -60 792 C 62 836, 166 860, 254 856 C 454 842, 642 600, 1060 96"
        fill="none" stroke="url(#wosGold)" strokeWidth="2.6" strokeLinecap="round"
      />
      <path
        d="M 330 960 C 520 800, 700 624, 1100 300"
        fill="none" stroke="url(#wosGoldSoft)" strokeWidth="1.4" strokeLinecap="round"
      />

      {/* nodes riding the sweep */}
      {[[314, 845], [575, 660], [786, 425]].map(([cx, cy]) => (
        <g key={cx}>
          <circle cx={cx} cy={cy} r="7.5" fill="#F6D284" opacity=".2" />
          <circle cx={cx} cy={cy} r="2.8" fill="#FBE3A4" />
        </g>
      ))}
    </svg>
  );
}
