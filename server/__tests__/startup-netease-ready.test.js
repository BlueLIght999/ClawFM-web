import { describe, it, expect, vi } from 'vitest';
import { ensureNeteaseReadyForRestore } from '../startup.js';

describe('ensureNeteaseReadyForRestore', () => {
  it('returnsTrue_whenWaitForReadySucceeds', async () => {
    const waitForReady = vi.fn().mockResolvedValue(true);
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    const result = await ensureNeteaseReadyForRestore(waitForReady, logger);

    expect(result).toBe(true);
    expect(waitForReady).toHaveBeenCalledWith(15000);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('returnsFalse_andWarns_whenWaitForReadyTimesOut', async () => {
    const waitForReady = vi.fn().mockResolvedValue(false);
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    const result = await ensureNeteaseReadyForRestore(waitForReady, logger);

    expect(result).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ component: 'server' }),
      expect.stringContaining('not ready'),
    );
  });

  it('returnsFalse_andErrors_whenWaitForReadyThrows', async () => {
    const waitForReady = vi.fn().mockRejectedValue(new Error('unexpected'));
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    const result = await ensureNeteaseReadyForRestore(waitForReady, logger);

    expect(result).toBe(false);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ component: 'server' }),
      expect.stringContaining('wait failed'),
    );
  });
});
