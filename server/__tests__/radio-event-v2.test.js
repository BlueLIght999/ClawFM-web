import { describe, expect, it } from 'vitest';
import {
  projectQueueUpdateV2,
  projectRadioStateV2,
  projectSongChangeV2,
} from '../domain/curation/radioEventV2.js';

const rawSong = {
  id: 186016,
  name: '晴天',
  ar: [{ name: '周杰伦' }],
  al: { name: '叶惠美', picUrl: 'https://example.com/cover.jpg' },
  dt: 269000,
  sourceSecret: 'must-not-leak',
};

const stableSong = {
  id: '186016',
  title: '晴天',
  artist: '周杰伦',
  album: '叶惠美',
  durationMs: 269000,
  coverUrl: 'https://example.com/cover.jpg',
};

describe('radio event v2 projectors', () => {
  it('projectRadioStateV2_whenSongsAreLegacy_emitsOnlyStableSongFields', () => {
    const state = projectRadioStateV2({
      currentSong: rawSong,
      upcomingSongs: [rawSong],
      isPlaying: true,
      queueMode: 'sequential',
    });

    expect(state).toEqual({
      schemaVersion: 2,
      currentSong: stableSong,
      upcomingSongs: [stableSong],
      isPlaying: true,
      queueMode: 'sequential',
    });
    expect(state.currentSong).not.toHaveProperty('ar');
    expect(state.currentSong).not.toHaveProperty('sourceSecret');
  });

  it('projectSongChangeV2_whenSongIsNull_preservesPlaybackMetadata', () => {
    expect(projectSongChangeV2({ song: null, startedAt: 123, audioUrl: null })).toEqual({
      schemaVersion: 2,
      song: null,
      startedAt: 123,
      audioUrl: null,
    });
  });

  it('projectQueueUpdateV2_whenModeExists_mapsEverySong', () => {
    expect(projectQueueUpdateV2({ upcomingSongs: [rawSong], mode: 'shuffle' })).toEqual({
      schemaVersion: 2,
      upcomingSongs: [stableSong],
      mode: 'shuffle',
    });
  });
});
