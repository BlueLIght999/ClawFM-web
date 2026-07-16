/**
 * HTTP client adapter for web-based metadata search (MusicBrainz, Wikipedia).
 * Used by MusicBrainzSearcher and WikiSearcher in the enrichment chain.
 */
export class WebSearchAdapter {
  constructor({ timeout = 5000 } = {}) {
    this.timeout = timeout;
  }

  async get(url, params = {}) {
    const urlObj = new URL(url);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) urlObj.searchParams.set(k, String(v));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(urlObj.toString(), {
        signal: controller.signal,
        headers: { 'User-Agent': 'QclaudioProfileSystem/1.0' },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }
}
