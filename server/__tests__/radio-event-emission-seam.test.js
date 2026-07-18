import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const serverRoot = path.resolve(import.meta.dirname, '..');
const socketEmitters = [
  'socket/bubbleHandler.js',
  'socket/chatHandler.js',
  'socket/connectionHandler.js',
  'socket/emitHelpers.js',
  'socket/handler.js',
  'socket/recurringTasks.js',
];

describe('versioned radio event emission seam', () => {
  it('socketModules_doNotBypassVersionedSongEventEmitter', () => {
    for (const relativePath of socketEmitters) {
      const source = fs.readFileSync(path.join(serverRoot, relativePath), 'utf8');
      expect(source, relativePath).not.toMatch(/\.emit\(EVENTS\.(RADIO_STATE|SONG_CHANGE|QUEUE_UPDATE)\b/);
    }
  });

  it('httpRoutes_doNotEmitUnversionedSongEventsDirectly', () => {
    const source = fs.readFileSync(path.join(serverRoot, 'infrastructure/http/httpRoutes.js'), 'utf8');

    expect(source).not.toMatch(/\.emit\(['"]radio:(state|song-change|queue-update)['"]/);
  });
});
