import './styles.css';
import { makeCtx } from './ctxFactory';
import { Flow } from './game/flow';
import { createDrive } from './drive';

declare const __BUILD__: string;

const ctx = makeCtx();
const { save, bus } = ctx;

const container = document.getElementById('game') as HTMLElement;
const drive = createDrive(container, bus);

const flow = new Flow(ctx);
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
