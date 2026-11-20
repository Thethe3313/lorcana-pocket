// Bannière de l'accueil : château au clair de lune, dessiné en SVG (aucun visuel externe)
const win = (x, y, d = 0, h = 10) => `<path class="win" style="animation-delay:${d}s" d="M${x} ${y + h}v-${h - 4}a3 3 0 0 1 6 0v${h - 4}z"/>`;
const tower = (x, w, top, roofH, flag = true, wins = []) => {
  const cx = x + w / 2;
  return `<g>
    <rect x="${x}" y="${top}" width="${w}" height="${236 - top}" fill="url(#cs-stone)"/>
    <rect x="${x - 4}" y="${top - 6}" width="${w + 8}" height="8" fill="#1a1f52"/>
    <polygon points="${x - 7},${top - 5} ${cx},${top - roofH} ${x + w + 7},${top - 5}" fill="url(#cs-roof)"/>
    ${flag ? `<path d="M${cx} ${top - roofH}v-18" stroke="#f5cf6b" stroke-width="1.6"/><path class="flag" d="M${cx} ${top - roofH - 18}l16 5l-16 5z" fill="#d4213d"/>` : ''}
    ${wins.map(([wx, wy, d]) => win(x + wx, top + wy, d)).join('')}
  </g>`;
};
const battlements = (x1, x2, y) => { let s = ''; for (let x = x1; x < x2; x += 14) s += `<rect x="${x}" y="${y - 7}" width="8" height="8" fill="#1a1f52"/>`; return s; };
const star = (x, y, r, d) => `<path class="tw" style="animation-delay:${d}s" d="M${x} ${y - r}l${r * .28} ${r * .72}l${r * .72} ${r * .28}l-${r * .72} ${r * .28}l-${r * .28} ${r * .72}l-${r * .28} -${r * .72}l-${r * .72} -${r * .28}l${r * .72} -${r * .28}z" fill="#fff6d8"/>`;
const burst = (x, y, c, d) => `<g class="fw" style="transform-origin:${x}px ${y}px;animation-delay:${d}s" stroke="${c}" stroke-width="2" stroke-linecap="round">${Array.from({ length: 12 }, (_, i) => { const a = i * Math.PI / 6; return `<line x1="${x + Math.cos(a) * 8}" y1="${y + Math.sin(a) * 8}" x2="${x + Math.cos(a) * 22}" y2="${y + Math.sin(a) * 22}"/>`; }).join('')}<circle cx="${x}" cy="${y}" r="3" fill="${c}" stroke="none"/></g>`;

export function castleHTML() {
  return `<svg class="castle" viewBox="0 -40 600 280" preserveAspectRatio="xMaxYMax slice" aria-hidden="true">
    <defs>
      <radialGradient id="cs-moon" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff6d8" stop-opacity=".95"/><stop offset=".35" stop-color="#f5cf6b" stop-opacity=".35"/><stop offset="1" stop-color="#f5cf6b" stop-opacity="0"/></radialGradient>
      <linearGradient id="cs-stone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c2f78"/><stop offset="1" stop-color="#14183f"/></linearGradient>
      <linearGradient id="cs-roof" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9b4fc4"/><stop offset="1" stop-color="#3b2a86"/></linearGradient>
      <linearGradient id="cs-hill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c3a6e"/><stop offset="1" stop-color="#0a1030"/></linearGradient>
    </defs>
    <circle cx="520" cy="36" r="90" fill="url(#cs-moon)"/>
    <circle cx="520" cy="36" r="17" fill="#fff6d8" opacity=".95"/><circle cx="526" cy="31" r="15" fill="#14183f" opacity=".18"/>
    ${star(60, 40, 7, 0)}${star(130, 90, 5, .8)}${star(205, 28, 6, 1.6)}${star(420, 34, 5, .4)}${star(470, 100, 6, 1.2)}${star(560, 30, 5, 2)}${star(90, 150, 4, 1)}${star(540, 140, 4, .6)}
    ${burst(130, 60, '#f5cf6b', 0)}${burst(60, 70, "#6ad1ff", 1.4)}${burst(540, 120, '#ff7a90', 2.6)}
    <path d="M0 200 Q120 150 250 190 T600 175 V240 H0z" fill="url(#cs-hill)" opacity=".9"/>
    <g>
      ${tower(120, 34, 120, 50, false, [[14, 22, .3], [14, 50, 1.1]])}
      ${tower(446, 34, 126, 48, false, [[14, 22, 1.7], [14, 52, .6]])}
      ${tower(190, 40, 96, 60, true, [[17, 24, .9], [17, 56, 2.1]])}
      ${tower(370, 40, 100, 58, true, [[17, 24, 1.3], [17, 58, .2]])}
      <rect x="150" y="170" width="300" height="70" fill="url(#cs-stone)"/>
      ${battlements(152, 446, 172)}
      ${tower(274, 52, 54, 64, true, [[10, 20, .5], [34, 20, 1.5], [22, 56, 2.4]])}
      <path d="M276 240v-34a24 24 0 0 1 48 0v34z" fill="#070a24"/>
      <path class="win" style="animation-delay:.7s" d="M292 240v-20a8 8 0 0 1 16 0v20z" opacity=".55"/>
      ${win(178, 196, .4)}${win(220, 196, 1.9)}${win(372, 196, 1.2)}${win(414, 196, .1)}
    </g>
    <path d="M0 222 Q150 196 300 214 T600 206 V240 H0z" fill="#070a24"/>
  </svg>`;
}
