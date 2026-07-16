import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const CONFIG_PATH = path.resolve(__dirname, '../../vite.config.js');

describe('vite.config.js build optimization', () => {
  it('contains manualChunks configuration', () => {
    const source = fs.readFileSync(CONFIG_PATH, 'utf-8');
    expect(source).toContain('manualChunks');
  });

  it('splits react and react-dom into vendor-react chunk', () => {
    const source = fs.readFileSync(CONFIG_PATH, 'utf-8');
    expect(source).toContain('vendor-react');
    expect(source).toContain('react-dom');
  });

  it('splits socket.io-client into vendor-socket chunk', () => {
    const source = fs.readFileSync(CONFIG_PATH, 'utf-8');
    expect(source).toContain('vendor-socket');
    expect(source).toContain('socket.io-client');
  });
});
