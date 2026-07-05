import { EVENTS } from './events.js';

/**
 * SocketEventPublisher — implements the EventPublisher port over Socket.IO.
 *
 * Exposes semantic methods (djMessage / djStreamChunk / ...) so that
 * domain/application code can publish events WITHOUT importing socket/events
 * or holding the io instance directly — this breaks the reverse dependency
 * proactive.js → socket/events.js (architecture rule D4).
 */
export class SocketEventPublisher {
  /** @param {{ emit: Function }} io Socket.IO server (or namespace) */
  constructor(io) {
    this._io = io;
  }

  emit(event, payload) {
    this._io.emit(event, payload);
  }

  toClient(socketId, event, payload) {
    this._io.to(socketId).emit(event, payload);
  }

  djMessage(text) {
    this._io.emit(EVENTS.DJ_MESSAGE, { text });
  }

  djStreamChunk(messageId, token) {
    this._io.emit(EVENTS.DJ_STREAM_CHUNK, { messageId, token });
  }

  djStreamEnd(messageId, fullText) {
    this._io.emit(EVENTS.DJ_STREAM_END, { messageId, fullText });
  }

  djSpeechStart({ audioUrl, text, type }) {
    this._io.emit(EVENTS.DJ_SPEECH_START, { audioUrl, text, type });
  }
}
