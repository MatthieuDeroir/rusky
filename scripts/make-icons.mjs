// Generate PWA icons (192/512 + maskable + apple) from the onion-dome logo, using sharp.
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");
const appDir = join(root, "src", "app");
mkdirSync(pub, { recursive: true });

const GOLD = "#e3b34a";
const BG = "#1c1813";

// The dome drawn in a 24x24 space (matches src/components/logo.tsx).
const dome = (stroke) => `
  <path d="M12 3.6 C 12.7 5.6 13.8 6.4 14.9 7.4 C 16.8 9.1 17.8 11.1 17.8 13.3
           C 17.8 16.6 15.2 18.9 12 18.9 C 8.8 18.9 6.2 16.6 6.2 13.3
           C 6.2 11.1 7.2 9.1 9.1 7.4 C 10.2 6.4 11.3 5.6 12 3.6 Z" fill="${GOLD}"/>
  <path d="M8.6 18.9 H15.4 L14.8 21.4 H9.2 Z" fill="${GOLD}"/>
  <rect x="7.7" y="21.2" width="8.6" height="1.4" rx="0.5" fill="${GOLD}"/>
  <g stroke="${GOLD}" stroke-width="0.75" stroke-linecap="round">
    <line x1="12" y1="0.6" x2="12" y2="3.6"/>
    <line x1="10.7" y1="1.5" x2="13.3" y2="1.5"/>
    <line x1="10.1" y1="2.3" x2="13.9" y2="2.3"/>
    <line x1="10.7" y1="3.2" x2="13.3" y2="2.8"/>
  </g>`;

// Full icon SVG at a given canvas size; `pad` scales the dome down for maskable safe zone.
function iconSvg(size, { rounded, scale }) {
  const s = (size / 24) * scale;
  const cx = 12,
    cy = 11.6;
  const tx = size / 2 - cx * s;
  const ty = size / 2 - cy * s;
  const bg = rounded
    ? `<rect width="${size}" height="${size}" rx="${size * 0.22}" fill="${BG}"/>`
    : `<rect width="${size}" height="${size}" fill="${BG}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${bg}
    <g transform="translate(${tx.toFixed(2)},${ty.toFixed(2)}) scale(${s.toFixed(3)})">${dome()}</g>
  </svg>`;
}

async function png(svg, size, out) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(join(pub, out));
  console.log("✓", out);
}

await png(iconSvg(512, { rounded: true, scale: 0.62 }), 512, "icon-192.png"); // downscaled below
await png(iconSvg(512, { rounded: true, scale: 0.62 }), 192, "icon-192.png");
await png(iconSvg(512, { rounded: true, scale: 0.62 }), 512, "icon-512.png");
await png(iconSvg(512, { rounded: false, scale: 0.5 }), 512, "icon-maskable-512.png");
await png(iconSvg(512, { rounded: true, scale: 0.62 }), 180, "apple-icon.png");

// Favicon: ship the SVG directly (Next serves src/app/icon.svg as the favicon).
writeFileSync(
  join(appDir, "icon.svg"),
  iconSvg(64, { rounded: true, scale: 0.62 }),
  "utf8",
);
console.log("✓ src/app/icon.svg");
