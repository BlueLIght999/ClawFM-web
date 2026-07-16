import { describe, it, expect, vi } from 'vitest';
import { LogStream } from '../infrastructure/logging/logStream.js';

function makeSocket() {
  const events = [];
  return {
    id: `socket-${Math.random()}`,
    emit: vi.fn((event, data) => events.push({ event, data })),
    _events: events,
  };
}

describe('LogStream', () => {
  it('buffersLogEntries', () => {
    const ls = new LogStream();
    ls.write(JSON.stringify({ level: 30, msg: 'test', time: Date.now() }));
    expect(ls.getBuffer()).toHaveLength(1);
  });

  it('broadcastsToSubscribers', () => {
    const ls = new LogStream();
    const socket = makeSocket();
    ls.subscribe(socket);

    ls.write(JSON.stringify({ level: 30, msg: 'hello', time: Date.now() }));

    expect(socket.emit).toHaveBeenCalledWith('dashboard:log', expect.objectContaining({ msg: 'hello' }));
  });

  it('doesNotBroadcastToUnsubscribed', () => {
    const ls = new LogStream();
    const socket = makeSocket();
    // subscribe then unsubscribe
    ls.subscribe(socket);
    ls.unsubscribe(socket);

    ls.write(JSON.stringify({ level: 30, msg: 'test', time: Date.now() }));

    expect(socket.emit).not.toHaveBeenCalled();
  });

  it('respectsMinLevelFilter', () => {
    const ls = new LogStream();
    const socket = makeSocket();
    ls.subscribe(socket, { minLevel: 'warn' }); // level >= 40

    ls.write(JSON.stringify({ level: 30, msg: 'info msg', time: Date.now() }));
    ls.write(JSON.stringify({ level: 40, msg: 'warn msg', time: Date.now() }));
    ls.write(JSON.stringify({ level: 50, msg: 'error msg', time: Date.now() }));

    const logEvents = socket._events.filter(e => e.event === 'dashboard:log');
    expect(logEvents).toHaveLength(2);
    expect(logEvents[0].data.msg).toBe('warn msg');
    expect(logEvents[1].data.msg).toBe('error msg');
  });

  it('sendsBufferedLogsToNewSubscriber', () => {
    const ls = new LogStream();
    ls.write(JSON.stringify({ level: 30, msg: 'old log', time: Date.now() }));
    ls.write(JSON.stringify({ level: 50, msg: 'old error', time: Date.now() }));

    const socket = makeSocket();
    ls.subscribe(socket);

    expect(socket.emit).toHaveBeenCalledTimes(2);
  });

  it('enforcesMaxBufferLimit', () => {
    const ls = new LogStream();
    for (let i = 0; i < 600; i++) {
      ls.write(JSON.stringify({ level: 30, msg: `log ${i}`, time: Date.now() }));
    }
    expect(ls.getBuffer().length).toBe(500);
  });

  it('handlesNonJsonInput', () => {
    const ls = new LogStream();
    expect(() => ls.write('not json')).not.toThrow();
    expect(ls.getBuffer()).toHaveLength(1);
  });

  it('subscriberCountTracksSubscriptions', () => {
    const ls = new LogStream();
    expect(ls.subscriberCount).toBe(0);
    const s1 = makeSocket();
    ls.subscribe(s1);
    expect(ls.subscriberCount).toBe(1);
    const s2 = makeSocket();
    ls.subscribe(s2);
    expect(ls.subscriberCount).toBe(2);
    ls.unsubscribe(s1);
    expect(ls.subscriberCount).toBe(1);
  });
});
