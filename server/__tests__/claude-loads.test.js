import { describe, it, expect } from 'vitest';

describe('claude module loads', () => {
  it('importsWithoutThrowing', async () => {
    const mod = await import('../services/claude.js');
    expect(mod.generateTransition).toBeTypeOf('function');
    expect(mod.chatWithDj).toBeTypeOf('function');
    expect(mod.isConfigured).toBeTypeOf('function');
  });
});
