import './styles.css';
import { makeCtx } from './ctxFactory';
import { Flow } from './game/flow';
import { createDrive } from './drive';
import { buildCity } from './world3d/city';
import { drawMinimap } from './world3d/minimap';

declare const __BUILD__: string;

const ctx = makeCtx();
const { save, bus } = ctx;

const container = document.getElementById('game') as HTMLElement;
const drive = createDrive(container, bus);

const flow = new Flow(ctx);
const CITY_SEED = 11;                       // the same seed the flow gives the engine in DriveConfig
const city = buildCity(CITY_SEED);
flow.setCity({
  lessonPoi: (id) => `garage_${id}`,
  poiPos: (id) => {
    const p = city.pois.find((x) => x.id === id);
    if (!p) return null;
    const r = city.nearestRoad(p.x, p.z);
    return { x: r.x, z: r.z, heading: r.heading };
  },
  minimap: {
    draw: (g, _w, _h, s) => {
      const target = flow.objective();
      drawMinimap(g, city, { x: s.x, z: s.z, heading: s.heading, span: 520, rotate: true, pois: city.pois, target });
    },
  },
});
const params = new URLSearchParams(location.search);
if (params.has('fresh')) save.reset();
const dev = params.get('dev');
if (dev) {
  save.data.started = true;
  void import('./devui').then((m) => m.devRoute(ctx, dev));
} else {
  void flow.boot();
}

(window as unknown as { __pr: unknown }).__pr = { ctx, bus, flow, drive, build: __BUILD__ };
