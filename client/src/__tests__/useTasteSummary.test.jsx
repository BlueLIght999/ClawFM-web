import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useTasteSummary } from '../hooks/useTasteSummary.js';

describe('useTasteSummary', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loadsTasteSummary_fromExistingApi', async () => {
    const data = { topGenres: [{ name: 'Indie' }], topArtists: [], currentMood: 'calm' };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(data) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useTasteSummary());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchMock).toHaveBeenCalledWith('/api/taste', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(result.current.data).toEqual(data);
    expect(result.current.error).toBeNull();
    expect(typeof result.current.refresh).toBe('function');
  });

  it('returnsError_withoutThrowingWhenRequestFails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const { result } = renderHook(() => useTasteSummary());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe('offline');
  });
});
