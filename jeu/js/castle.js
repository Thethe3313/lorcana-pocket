// Bannière de l'accueil : un château de conte de fées à tourelles effilées, au clair de lune
// (dessin original en SVG, inspiré des châteaux de parcs Disney ; aucun visuel externe)
const win = (x, y, d = 0, h = 9) => `<path class="win" style="animation-delay:${d}s" d="M${x} ${y + h}v-${h - 3}a2.5 2.5 0 0 1 5 0v${h - 3}z"/>`;

// Tourelle effilée : corps, balcon, toit pointu bleu et pointe dorée
const spire = (x, w, top, apex, wins = [], flag = false) => {
  const cx = x + w / 2;
  return `<g>
    <rect x="${x}" y="${top}" width="${w}" height="${240 - top}" fill="url(#cs-stone)"/>
    <rect x="${x - 3}" y="${top - 1}" width="${w + 6}" height="5" rx="1" fill="#e7e3ff" opacity=".85"/>
    <path d="M${x - 5} ${top} Q${cx - w * .3} ${(top + apex) / 2 + 8} ${cx} ${apex} Q${cx + w * .3} ${(top + apex) / 2 + 8} ${x + w + 5} ${top}z" fill="url(#cs-roof)"/>
    <path d="M${cx} ${apex}v-9" stroke="#f5cf6b" stroke-width="1.6"/><circle cx="${cx}" cy="${apex - 10}" r="2.2" fill="#f5cf6b"/>
    ${flag ? `<path class="flag" d="M${cx} ${apex - 9}l14 4l-14 4z" fill="#f5cf6b"/>` : ''}
    ${wins.map(([wx, wy, d]) => win(x + wx, top + wy, d)).join('')}
  </g>`;
};
const battlements = (x1, x2, y) => { let s = ''; for (let x = x1; x < x2; x += 12) s += `<rect x="${x}" y="${y - 6}" width="7" height="7" fill="#9aa0e0" opacity=".85"/>`; return s; };
const star = (x, y, r, d) => `<path class="tw" style="animation-delay:${d}s" d="M${x} ${y - r}l${r * .28} ${r * .72}l${r * .72} ${r * .28}l-${r * .72} ${r * .28}l-${r * .28} ${r * .72}l-${r * .28} -${r * .72}l-${r * .72} -${r * .28}l${r * .72} -${r * .28}z" fill="#fff6d8"/>`;
const burst = (x, y, c, d) => `<g class="fw" style="transform-origin:${x}px ${y}px;animation-delay:${d}s" stroke="${c}" stroke-width="2" stroke-linecap="round">${Array.from({ length: 12 }, (_, i) => { const a = i * Math.PI / 6; return `<line x1="${x + Math.cos(a) * 8}" y1="${y + Math.sin(a) * 8}" x2="${x + Math.cos(a) * 24}" y2="${y + Math.sin(a) * 24}"/>`; }).join('')}<circle cx="${x}" cy="${y}" r="3" fill="${c}" stroke="none"/></g>`;
const glints = Array.from({ length: 9 }, (_, i) => `<rect class="win" style="animation-delay:${(i * .37) % 3}s" x="${236 + i * 16}" y="${248 + (i % 3) * 7}" width="2" height="${5 + (i % 2) * 3}" rx="1"/>`).join('');

export function castleHTML() {
  return `<svg class="castle" viewBox="0 0 600 280" preserveAspectRatio="xMaxYMax slice" aria-hidden="true">
    <defs>
      <radialGradient id="cs-moon" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff6d8" stop-opacity=".95"/><stop offset=".35" stop-color="#f5cf6b" stop-opacity=".3"/><stop offset="1" stop-color="#f5cf6b" stop-opacity="0"/></radialGradient>
      <linearGradient id="cs-stone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9aa0ec"/><stop offset=".55" stop-color="#4a4fa6"/><stop offset="1" stop-color="#1f2260"/></linearGradient>
      <linearGradient id="cs-roof" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5fb0ff"/><stop offset="1" stop-color="#1f4aa8"/></linearGradient>
      <linearGradient id="cs-water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a2c6e"/><stop offset="1" stop-color="#070b22"/></linearGradient>
      <radialGradient id="cs-halo" cx="50%" cy="100%" r="70%"><stop offset="0" stop-color="#f5cf6b" stop-opacity=".35"/><stop offset="1" stop-color="#f5cf6b" stop-opacity="0"/></radialGradient>
    </defs>
    <circle cx="540" cy="40" r="80" fill="url(#cs-moon)"/>
    <circle cx="540" cy="40" r="15" fill="#fff6d8" opacity=".95"/>
    ${star(40, 40, 7, 0)}${star(120, 100, 5, .8)}${star(200, 30, 6, 1.6)}${star(440, 80, 5, .4)}${star(480, 130, 6, 1.2)}${star(580, 100, 5, 2)}${star(70, 170, 4, 1)}${star(560, 170, 4, .6)}
    ${burst(110, 60, '#f5cf6b', 0)}${burst(470, 52, '#6ad1ff', 1.4)}${burst(40, 130, '#ff7a90', 2.6)}${burst(570, 150, '#c58cf0', 3.4)}
    <ellipse cx="300" cy="240" rx="230" ry="130" fill="url(#cs-halo)"/>
    <g>
      ${spire(160, 18, 168, 136)}${spire(422, 18, 168, 136)}
      <rect x="150" y="196" width="300" height="44" fill="url(#cs-stone)"/>
      ${battlements(152, 446, 197)}
      ${spire(204, 20, 140, 94, [[7, 14, 1.4]])}${spire(376, 20, 140, 94, [[7, 14, .5]])}
      <rect x="226" y="170" width="148" height="70" fill="url(#cs-stone)"/>
      ${battlements(228, 372, 171)}
      ${spire(238, 24, 120, 52, [[9, 18, .9], [9, 40, 2.2]])}${spire(338, 24, 120, 52, [[9, 18, 1.8], [9, 40, .3]])}
      ${spire(279, 42, 100, 6, [[10, 16, .6], [27, 16, 1.5], [18, 44, 2.5]], true)}
      <path d="M284 240v-24a16 16 0 0 1 32 0v24z" fill="#0a0d2e"/>
      <path class="win" style="animation-delay:.7s" d="M292 240v-16a8 8 0 0 1 16 0v16z" opacity=".6"/>
      ${win(182, 214, .4)}${win(232, 214, 1.9)}${win(360, 214, 1.2)}${win(410, 214, .1)}
    </g>
    <path d="M0 238 Q150 228 300 236 T600 230 V280 H0z" fill="url(#cs-water)"/>
    <g opacity=".55">${glints}</g>
  </svg>`;
}
