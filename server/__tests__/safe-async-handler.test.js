import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { safeAsyncHandler } from '../domain/socket/safeAsyncHandler.js';

describe('safeAsyncHandler', () => {
  it('returns the result when handler succeeds', async () => {
    const handler = vi.fn().mockResolvedValue('ok');
    const wrapped = safeAsyncHandler(handler);
    const result = await wrapped({ data: 1 });
    expect(result).toBe('ok');
    expect(handler).toHaveBeenCalledWith({ data: 1 });
  });

  it('catches errors and logs them instead of throwing', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handler = vi.fn().mockRejectedValue(new Error('boom'));
    const wrapped = safeAsyncHandler(handler);
    await expect(wrapped()).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Socket handler error'),
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });

  it('catches synchronous throws in async handler', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handler = vi.fn(() => { throw new Error('sync boom'); });
    const wrapped = safeAsyncHandler(handler);
    await expect(wrapped()).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('passes arguments through to handler', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const wrapped = safeAsyncHandler(handler);
    await wrapped('arg1', 'arg2', 'arg3');
    expect(handler).toHaveBeenCalledWith('arg1', 'arg2', 'arg3');
  });

  it('calls optional onError callback when provided', async () => {
    const onError = vi.fn();
    const handler = vi.fn().mockRejectedValue(new Error('fail'));
    const wrapped = safeAsyncHandler(handler, { onError });
    await wrapped();
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });
});
