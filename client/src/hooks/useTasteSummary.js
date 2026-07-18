import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Loads the existing listener taste summary for the FM sidebar.
 * Returns stable loading/error states and aborts stale requests on refresh or unmount.
 */
export function useTasteSummary() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const controllerRef = useRef(null);

  const refresh = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/taste', { signal: controller.signal });
      if (!response.ok) throw new Error(`Taste request failed (${response.status})`);
      setData(await response.json());
    } catch (requestError) {
      if (requestError.name !== 'AbortError') {
        setData(null);
        setError(requestError.message || 'Taste request failed');
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    return () => controllerRef.current?.abort();
  }, [refresh]);

  return { data, loading, error, refresh };
}
