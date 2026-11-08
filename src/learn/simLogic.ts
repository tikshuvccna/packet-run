/** Pure logic behind the lesson simulations (kept free of the DOM so it can be tested). */
import { rng } from './rng';

export interface MsgOpts { address: boolean; sameCode: boolean; format: boolean; small: boolean; paced: boolean }
export interface MsgOutcome { ok: boolean; broken: string[]; text: string }

const BROKEN_TEXT: Record<string, string> = {
  address: 'אין כתובת יעד. ההודעה לא יודעת לאן ללכת.',
  code: 'הקידוד שונה. היעד מקבל ג׳יבריש.',
  format: 'אין תבנית. לא ברור איפה ההודעה מתחילה ונגמרת.',
  size: 'ההודעה ענקית מדי למסגרת אחת. היא לא מגיעה.',
  time: 'השולח מהיר מדי. היעד לא מספיק לקלוט וחלק אובד.',
};

/** What happens to a message when some rules are broken. The first broken rule decides the visible symptom. */
export function msgOutcome(o: MsgOpts): MsgOutcome {
  const broken: string[] = [];
  if (!o.address) broken.push('address');
  if (!o.sameCode) broken.push('code');
  if (!o.format) broken.push('format');
  if (!o.small) broken.push('size');
  if (!o.paced) broken.push('time');
  if (broken.length === 0) return { ok: true, broken, text: 'ההודעה הגיעה שלמה.' };
  return { ok: false, broken, text: broken.map((b) => BROKEN_TEXT[b]).join(' ') };
}

/** 8-bit binary of one character (code point below 256; Hebrew letters use their low byte in the lesson demo, so the demo uses Latin letters). */
export function toBits(ch: string): string {
  const c = ch.charCodeAt(0) & 0xff;
  return c.toString(2).padStart(8, '0');
}
export function wordBits(word: string): string[] { return [...word].map(toBits); }

/** Receivers for a cast mode among `n` hosts (index 0 is the sender). */
export function castReceivers(mode: 'uni' | 'multi' | 'broad', n: number, picked: number[]): number[] {
  if (mode === 'broad') return Array.from({ length: n - 1 }, (_, i) => i + 1);
  const valid = picked.filter((p) => p > 0 && p < n);
  return mode === 'uni' ? valid.slice(0, 1) : valid;
}
/** Frames travelling on the wires: unicast and multicast send one copy per receiver, broadcast floods all. */
export function castTraffic(mode: 'uni' | 'multi' | 'broad', n: number, picked: number[]): number {
  return castReceivers(mode, n, picked).length;
}

export interface FlowResult { sent: number; received: number; lost: number; peakBuffer: number }
/** Receiver drains `cap` packets per second into an application and holds up to `buf` waiting; the sender pushes `rate` per second for `secs`. */
export function flowSim(rate: number, cap: number, buf: number, secs: number): FlowResult {
  let queue = 0, received = 0, lost = 0, peak = 0;
  const steps = secs * 10;
  let sendAcc = 0, drainAcc = 0;
  let sent = 0;
  for (let i = 0; i < steps; i++) {
    sendAcc += rate / 10;
    while (sendAcc >= 1) {
      sendAcc -= 1; sent++;
      if (queue < buf) queue++; else lost++;
    }
    peak = Math.max(peak, queue);
    drainAcc += cap / 10;
    while (drainAcc >= 1 && queue > 0) { drainAcc -= 1; queue--; received++; }
    if (queue === 0) drainAcc = Math.min(drainAcc, 1);
  }
  received += queue;   // what still waits is delivered after the run
  return { sent, received, lost, peakBuffer: peak };
}

export interface TcpUdpResult { proto: 'tcp' | 'udp'; total: number; delivered: number; transmissions: number; seconds: number; log: string[] }
/** Sends `total` numbered packets over a link that loses `lossPct` percent. TCP resends until acknowledged, UDP never does. Deterministic by seed. */
export function tcpUdpSim(proto: 'tcp' | 'udp', total: number, lossPct: number, seed: number): TcpUdpResult {
  const r = rng(seed);
  let delivered = 0, tx = 0, seconds = 0;
  const log: string[] = [];
  for (let n = 1; n <= total; n++) {
    let tries = 0;
    for (;;) {
      tries++; tx++; seconds += 0.1;
      const lost = r() * 100 < lossPct;
      if (!lost) { delivered++; if (proto === 'tcp') { seconds += 0.1; log.push(`${n}: הגיעה, אישור חזר`); } else log.push(`${n}: הגיעה`); break; }
      if (proto === 'udp') { log.push(`${n}: אבדה. אף אחד לא ישלח שוב`); break; }
      seconds += 0.3;   // timeout waiting for the acknowledgement
      log.push(`${n}: אבדה, אין אישור, שולחים שוב`);
      if (tries > 20) break;
    }
  }
  return { proto, total, delivered, transmissions: tx, seconds: Math.round(seconds * 10) / 10, log };
}
