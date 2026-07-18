import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const globalCss = fs.readFileSync(path.resolve(__dirname, '../styles/global.css'), 'utf-8');
const sidebarCss = fs.readFileSync(
  path.resolve(__dirname, '../components/agent-radio/agent-radio.css'),
  'utf-8',
);

describe('Agent Radio sidebar typography contract', () => {
  it('definesACjkPixelFontStackWithDotGothicFallback', () => {
    expect(globalCss).toContain('family=DotGothic16');
    expect(globalCss).toMatch(/--font-cjk-pixel:\s*'Fusion Pixel 12px',\s*'DotGothic16',\s*'Zpix',\s*monospace/);
    expect(sidebarCss).toMatch(/\.agent-radio-sidebar\s*\{[\s\S]*font-family:\s*var\(--font-cjk-pixel\)/);
  });

  it('usesBrownPixelHierarchyForSidebarText', () => {
    expect(sidebarCss).toMatch(/\.radio-sidebar-title\s*\{[\s\S]*color:\s*#4A3728[\s\S]*font-size:\s*10px/);
    expect(sidebarCss).toMatch(/\.playlist-name,[\s\S]*\.up-next-title\s*\{[\s\S]*color:\s*#4A3728[\s\S]*font-size:\s*16px[\s\S]*font-weight:\s*400/);
    expect(sidebarCss).toMatch(/\.playlist-meta,[\s\S]*\.up-next-duration\s*\{[\s\S]*color:\s*#8B6F4E[\s\S]*font-size:\s*12px/);
    expect(sidebarCss).toMatch(/\.radio-sidebar-count,[\s\S]*\.playlist-play-label\s*\{[\s\S]*color:\s*#E8863C/);
  });

  it('usesPixelGridRowsDashedSeparatorsAndReverseHover', () => {
    expect(sidebarCss).toMatch(/\.playlist-item,[\s\S]*\.up-next-item\s*\{[\s\S]*min-height:\s*64px[\s\S]*border-bottom:\s*1px dashed #D9CDB8/);
    expect(sidebarCss).toMatch(/\.playlist-item:hover,[\s\S]*\.up-next-item:focus-visible\s*\{[\s\S]*background:\s*#4A3728/);
    expect(sidebarCss).toMatch(/\.playlist-item:hover \.playlist-name,[\s\S]*color:\s*#FBF6E9/);
  });

  it('rendersTasteTagsAsSquarePixelControls', () => {
    expect(sidebarCss).toMatch(/\.taste-tag\s*\{[\s\S]*border:\s*2px solid #4A3728/);
    expect(sidebarCss).toMatch(/\.taste-tag\s*\{[\s\S]*background:\s*#FBF6E9/);
    expect(sidebarCss).toMatch(/\.taste-tag\s*\{[\s\S]*color:\s*#4A3728[\s\S]*font-size:\s*12px/);
    expect(sidebarCss).toMatch(/\.taste-tag\s*\{[\s\S]*box-shadow:\s*0 3px 0 #3D3229/);
    expect(sidebarCss).toMatch(/\.taste-tag\.is-selected,[\s\S]*background:\s*#4A3728[\s\S]*color:\s*#FBF6E9/);
  });
});
