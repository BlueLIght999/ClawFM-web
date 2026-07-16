import { useRef, useCallback } from 'react';

/**
 * usePerformanceMonitor — captures Web Vitals for observability.
 *
 * In production, reportVitals would send to an analytics endpoint.
 * In development, vitals are stored in a ref for debugging.
 *
 * Usage:
 *   const { reportVitals } = usePerformanceMonitor();
 *   import { onCLS, onLCP, onFCP } from 'web-vitals';
 *   onCLS(reportVitals);
 *   onLCP(reportVitals);
 */
export function usePerformanceMonitor() {
  const vitalsRef = useRef([]);

  const reportVitals = useCallback((metric) => {
    vitalsRef.current.push(metric);
    if (import.meta.env.DEV) {
      console.debug('[WebVitals]', metric.name, metric.value);
    }
  }, []);

  const getVitals = useCallback(() => vitalsRef.current, []);

  return { reportVitals, getVitals };
}
