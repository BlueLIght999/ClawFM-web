import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const lyricsCss = fs.readFileSync(
  path.resolve(__dirname, '../components/lyrics-display.css'),
  'utf-8',
);
const agentRadioCss = fs.readFileSync(
  path.resolve(__dirname, '../components/agent-radio/agent-radio.css'),
  'utf-8',
);

describe('Lyrics display layout contract', () => {
  it('keepsLongLyricsInsideAnInternalScrollViewport', () => {
    expect(lyricsCss).toMatch(/\.lyrics-display\s*\{[\s\S]*overflow-y:\s*auto/);
    expect(agentRadioCss).toMatch(/\.agent-radio-bottom\s*\{[\s\S]*grid-template-rows:\s*180px\s+auto/);
  });

  it('usesACompactFixedLyricsTrackOnMobile', () => {
    expect(agentRadioCss).toMatch(/@media\s*\(max-width:\s*600px\)[\s\S]*\.agent-radio-bottom\s*\{[\s\S]*grid-template-rows:\s*160px\s+auto/);
  });
});
