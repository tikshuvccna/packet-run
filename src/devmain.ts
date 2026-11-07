import './styles.css';
import { makeCtx } from './ctxFactory';
import { devRoute } from './devui';

const ctx = makeCtx();
const p = new URLSearchParams(location.search);
if (p.has('fresh')) ctx.save.reset();
ctx.save.data.started = true;
if (p.get('lessons')) for (const id of p.get('lessons')!.split(',')) ctx.save.lesson(id).done = true;
(window as unknown as { __ms: unknown }).__ms = { ctx };
void devRoute(ctx, p.get('dev') ?? 'title');
