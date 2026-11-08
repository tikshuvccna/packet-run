import { describe, expect, it } from 'vitest';
import { castReceivers, castTraffic, flowSim, msgOutcome, tcpUdpSim, toBits, wordBits } from './simLogic';

describe('message lab', () => {
  it('all rules fine delivers, any broken rule fails with its symptom', () => {
    const ok = { address: true, sameCode: true, format: true, small: true, paced: true };
    expect(msgOutcome(ok).ok).toBe(true);
    for (const k of Object.keys(ok) as (keyof typeof ok)[]) {
      const o = msgOutcome({ ...ok, [k]: false });
      expect(o.ok).toBe(false);
      expect(o.broken.length).toBe(1);
      expect(o.text.length).toBeGreaterThan(10);
    }
  });
});

describe('encoding', () => {
  it('encodes letters as 8 bits', () => {
    expect(toBits('A')).toBe('01000001');
    expect(wordBits('HI')).toEqual(['01001000', '01001001']);
  });
});

describe('cast', () => {
  it('uni one, multi the picked, broadcast everyone else', () => {
    expect(castReceivers('uni', 8, [3, 4])).toEqual([3]);
    expect(castReceivers('multi', 8, [2, 5, 6])).toEqual([2, 5, 6]);
    expect(castReceivers('broad', 8, [])).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(castTraffic('broad', 8, [])).toBe(7);
  });
});

describe('flow control', () => {
  it('no loss when the sender is not faster than the receiver, loss when it is', () => {
    expect(flowSim(3, 4, 5, 8).lost).toBe(0);
    expect(flowSim(9, 4, 5, 8).lost).toBeGreaterThan(0);
    const f = flowSim(6, 6, 3, 5);
    expect(f.sent).toBeGreaterThan(0);
    expect(f.received + f.lost).toBe(f.sent);
  });
});

describe('tcp vs udp', () => {
  it('is deterministic; tcp delivers everything, udp loses some, tcp costs more transmissions', () => {
    const a = tcpUdpSim('tcp', 20, 30, 4), b = tcpUdpSim('tcp', 20, 30, 4);
    expect(a).toEqual(b);
    expect(a.delivered).toBe(20);
    const u = tcpUdpSim('udp', 20, 30, 4);
    expect(u.delivered).toBeLessThan(20);
    expect(u.transmissions).toBe(20);
    expect(a.transmissions).toBeGreaterThan(20);
    expect(a.seconds).toBeGreaterThan(u.seconds);
  });
  it('no loss means both identical in delivery', () => {
    expect(tcpUdpSim('udp', 10, 0, 1).delivered).toBe(10);
  });
});
