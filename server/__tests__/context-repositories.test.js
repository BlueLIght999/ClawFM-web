import { describe, it, expect, vi } from 'vitest';

vi.mock('../db/history.js', () => ({
  getListenHistory: vi.fn(() => { throw new Error('legacy getListenHistory called'); }),
  getUserProfile: vi.fn(() => { throw new Error('legacy getUserProfile called'); }),
  getSeedPool: vi.fn(() => { throw new Error('legacy getSeedPool called'); }),
  recordListen: vi.fn(() => { throw new Error('legacy recordListen called'); }),
  getRecentSongIds: vi.fn(() => { throw new Error('legacy getRecentSongIds called'); }),
  getArtistPlayCount: vi.fn(() => { throw new Error('legacy getArtistPlayCount called'); }),
  setUserProfile: vi.fn(() => { throw new Error('legacy setUserProfile called'); }),
  upsertSeedPool: vi.fn(() => { throw new Error('legacy upsertSeedPool called'); }),
  incrementPlayCount: vi.fn(() => { throw new Error('legacy incrementPlayCount called'); }),
}));

const { assemblePrompt } = await import('../services/context.js');

describe('assemblePrompt repository seams', () => {
  it('memorySlot_readsFromInjectedRepositories', () => {
    const prompt = assemblePrompt({
      repositories: {
        listenHistory: {
          history: vi.fn(() => [{
            title: '晴天',
            artist: '周杰伦',
            playedAt: '2026-07-03T08:00:00.000Z',
          }]),
        },
        profile: {
          get: vi.fn(() => ({ topArtists: [{ name: '周杰伦', count: 3 }] })),
        },
        seedPool: {
          all: vi.fn(() => [{ songId: '1' }, { songId: '2' }]),
        },
      },
      corpus: {
        readTaste: () => '',
        readRoutines: () => '',
        readMoodRules: () => '',
      },
    });

    expect(prompt).toContain('### Recently Played');
    expect(prompt).toContain('晴天');
    expect(prompt).toContain('周杰伦');
    expect(prompt).not.toContain('Invalid Date');
    expect(prompt).toContain('### Top Artists');
    expect(prompt).toContain('Seed pool: 2 songs');
  });
});
