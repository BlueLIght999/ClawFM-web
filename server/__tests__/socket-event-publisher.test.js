import { describe, it, expect, vi } from 'vitest';
import { SocketEventPublisher } from '../socket/SocketEventPublisher.js';

/**
 * SocketEventPublisher 契约测试。
 * 验证语义方法正确映射到底层 io.emit(eventName, payload)。
 * 用注入的 io spy，不依赖真实 socket（数据隔离 DI4）。
 *
 * 目的：让 domain/service 层(proactive)通过语义方法发事件，
 * 不再 import socket/events 常量、不再持有 io —— 切断反向依赖🔴(D4)。
 */
describe('SocketEventPublisher', () => {
  function makeSpyIo() {
    return { emit: vi.fn() };
  }

  it('djMessage_emitsRadioDjMessageEvent', () => {
    const io = makeSpyIo();
    const pub = new SocketEventPublisher(io);

    pub.djMessage('hello listeners');

    expect(io.emit).toHaveBeenCalledWith('radio:dj-message', { text: 'hello listeners' });
  });

  it('djStreamChunk_emitsChunkWithMessageIdAndToken', () => {
    const io = makeSpyIo();
    const pub = new SocketEventPublisher(io);

    pub.djStreamChunk('msg-1', 'tok');

    expect(io.emit).toHaveBeenCalledWith('radio:dj-stream-chunk', {
      messageId: 'msg-1',
      token: 'tok',
    });
  });

  it('djStreamEnd_emitsEndWithFullText', () => {
    const io = makeSpyIo();
    const pub = new SocketEventPublisher(io);

    pub.djStreamEnd('msg-1', 'full message');

    expect(io.emit).toHaveBeenCalledWith('radio:dj-stream-end', {
      messageId: 'msg-1',
      fullText: 'full message',
    });
  });

  it('djSpeechStart_emitsSpeechStartWithPayload', () => {
    const io = makeSpyIo();
    const pub = new SocketEventPublisher(io);

    pub.djSpeechStart({ audioUrl: '/audio/tts/x.mp3', text: 'spoken', type: 'proactive' });

    expect(io.emit).toHaveBeenCalledWith('radio:dj-speech-start', {
      audioUrl: '/audio/tts/x.mp3',
      text: 'spoken',
      type: 'proactive',
    });
  });
});
