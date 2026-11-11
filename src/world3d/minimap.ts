/** Canvas-2D minimap drawing (pure DOM, no three). The UI may import it. */
import { DISTRICTS, type Poi } from '../drive/contract';
import { type City, HALF, roadSegments } from './city';

export interface MinimapOpts {
  /** player pose */ x: number; z: number; heading: number;
  /** meters shown across the canvas (default 600); 0 = whole map */ span?: number;
  /** rotate so the car points up (default true) */ rotate?: boolean;
  pois?: Poi[]; target?: { x: number; z: number } | null;
  racePath?: { x: number; z: number }[] | null;
  rivals?: { x: number; z: number }[];
}

const poiColor: Record<string, string> = { lesson: '#ffd23f', garage: '#ff7f6e', shop: '#4ad6c8', race: '#ffffff', fuel: '#7fd957', secret: '#b79ae0', place: '#9ecbd9' };

export function drawMinimap(g: CanvasRenderingContext2D, city: City, o: MinimapOpts): void {
  const W = g.canvas.width, H = g.canvas.height;
  const span = o.span === 0 ? HALF * 2 : o.span ?? 600;
  const sc = Math.min(W, H) / span;
  g.save();
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#2d3b4a'; g.fillRect(0, 0, W, H);
  g.translate(W / 2, H / 2);
  if (o.span !== 0 && o.rotate !== false) g.rotate(-o.heading);
  g.scale(sc, sc);
  const cx = o.span === 0 ? 0 : o.x, cz = o.span === 0 ? 0 : o.z;
  g.translate(-cx, -cz);
  // sea
  g.fillStyle = '#3f7fb5';
  g.beginPath(); g.moveTo(-HALF, HALF);
  for (let x = -HALF; x <= HALF; x += 50) g.lineTo(x, city.coastZ(x));
  g.lineTo(HALF, HALF); g.closePath(); g.fill();
  // river
  g.strokeStyle = '#3f7fb5'; g.lineWidth = city.riverHalf * 2; g.lineJoin = 'round';
  g.beginPath(); city.river.forEach((p, i) => (i ? g.lineTo(p.x, p.z) : g.moveTo(p.x, p.z))); g.stroke();
  // roads
  g.lineCap = 'round';
  for (const s of roadSegments(city)) {
    g.strokeStyle = s.avenue ? '#f3e4c4' : '#c9cdd6';
    g.lineWidth = Math.max(s.w, 3 / sc);
    g.beginPath(); g.moveTo(s.ax, s.az); g.lineTo(s.bx, s.bz); g.stroke();
  }
  if (o.racePath && o.racePath.length > 1) {
    g.strokeStyle = '#ffd23f'; g.lineWidth = Math.max(6, 4 / sc);
    g.beginPath(); o.racePath.forEach((p, i) => (i ? g.lineTo(p.x, p.z) : g.moveTo(p.x, p.z))); g.stroke();
  }
  const dot = (x: number, z: number, r: number, c: string): void => { g.fillStyle = c; g.beginPath(); g.arc(x, z, r / sc, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#1b1f2a'; g.lineWidth = 1.5 / sc; g.stroke(); };
  for (const p of o.pois ?? city.pois) dot(p.x, p.z, p.kind === 'race' ? 4 : 6, poiColor[p.kind] ?? '#fff');
  for (const r of o.rivals ?? []) dot(r.x, r.z, 4, '#e55a4e');
  if (o.target) {
    // keep the objective on the map edge when it is far away
    let tx = o.target.x, tz = o.target.z;
    if (o.span !== 0) { const dx = tx - o.x, dz = tz - o.z, d = Math.hypot(dx, dz), lim = (Math.min(W, H) / 2 - 9) / sc; if (d > lim) { tx = o.x + (dx / d) * lim; tz = o.z + (dz / d) * lim; } }
    dot(tx, tz, 8, '#ffd23f');
    dot(tx, tz, 3.5, '#e5484d');
  }
  // player arrow
  g.translate(o.x, o.z); g.rotate(o.heading); g.scale(1 / sc, 1 / sc);
  g.fillStyle = '#35d3b0'; g.strokeStyle = '#10141c'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, -9); g.lineTo(7, 7); g.lineTo(0, 3); g.lineTo(-7, 7); g.closePath(); g.fill(); g.stroke();
  g.restore();
  void DISTRICTS;
}
