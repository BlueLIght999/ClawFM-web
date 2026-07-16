import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePerformanceMonitor } from '../hooks/usePerformanceMonitor.js';

describe('usePerformanceMonitor', () => {
  it('returns a reportVitals function', () => {
    const { result } = renderHook(() => usePerformanceMonitor());
    expect(typeof result.current.reportVitals).toBe('function');
  });

  it('stores vitals in ref without crashing', () => {
    const { result } = renderHook(() => usePerformanceMonitor());
    result.current.reportVitals({ name: 'CLS', value: 0.1, id: 'test-1' });
    expect(result.current.getVitals()).toHaveLength(1);
  });

  it('accumulates multiple vitals', () => {
    const { result } = renderHook(() => usePerformanceMonitor());
    result.current.reportVitals({ name: 'CLS', value: 0.1, id: '1' });
    result.current.reportVitals({ name: 'LCP', value: 2500, id: '2' });
    expect(result.current.getVitals()).toHaveLength(2);
  });
});
