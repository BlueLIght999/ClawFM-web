import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { SPECTRUM_COLORS, THEME_NAMES } from '../theme/themes.js';
import { useTheme } from '../theme/useTheme.js';

const STORAGE_KEY = 'qclaudio-theme-override';

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('usesCreamTheme_whenNoPreferenceHasBeenStored', () => {
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('cream');
    expect(result.current.override).toBe('cream');
    expect(document.documentElement.dataset.theme).toBe('cream');
  });

  it('persistsAutoMode_whenManualOverrideIsCleared', () => {
    const { result, unmount } = renderHook(() => useTheme());

    act(() => result.current.clearOverride());
    expect(result.current.override).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify('auto'));

    unmount();
    const nextRender = renderHook(() => useTheme());
    expect(nextRender.result.current.override).toBeNull();
    expect(nextRender.result.current.theme).toBe(nextRender.result.current.autoTheme);
  });

  it('restoresLegacyStoredThemeName', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify('night'));

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('night');
    expect(result.current.override).toBe('night');
  });
});

describe('cream theme contract', () => {
  it('registersCreamAsSelectableThemeWithSpectrumColors', () => {
    expect(THEME_NAMES).toContain('cream');
    expect(SPECTRUM_COLORS.cream).toMatchObject({
      barR: expect.any(Number),
      barG: expect.any(Number),
      barB: expect.any(Number),
    });
  });
});
