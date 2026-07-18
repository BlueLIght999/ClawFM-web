import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import './lyrics-display.css';

function parseLrc(lrcText) {
  if (!lrcText) return [];
  const lines = lrcText.split('\n');
  const parsed = [];
  for (const line of lines) {
    const match = line.match(/^\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
    if (match) {
      const min = parseInt(match[1], 10);
      const sec = parseInt(match[2], 10);
      let ms = parseInt(match[3], 10);
      if (ms < 100) ms *= 10;
      const time = min * 60 + sec + ms / 1000;
      const text = match[4].trim();
      if (text) parsed.push({ time, text });
    }
  }
  return parsed;
}

function activeLyricIndex(lyrics, elapsed) {
  return lyrics.findIndex((line, index) => {
    const next = lyrics[index + 1];
    return elapsed >= line.time && (!next || elapsed < next.time);
  });
}

/** Synchronized lyric viewport that keeps the active line centered without scrolling the page. */
export default function LyricsDisplay({ songId, song, elapsed, isPlaying }) {
  const [lyrics, setLyrics] = useState([]);
  const [transLyrics, setTransLyrics] = useState([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const containerRef = useRef(null);
  const trackRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    setActiveIdx(-1);
    if (!songId) {
      setLyrics([]);
      setTransLyrics([]);
      return () => controller.abort();
    }

    fetch(`/api/lyric/${songId}`, { signal: controller.signal })
      .then(response => response.json())
      .then(data => {
        setLyrics(parseLrc(data.lrc));
        setTransLyrics(parseLrc(data.tlrc));
      })
      .catch(error => {
        if (error.name !== 'AbortError') {
          setLyrics([]);
          setTransLyrics([]);
        }
      });

    return () => controller.abort();
  }, [songId]);

  useEffect(() => {
    const nextIndex = activeLyricIndex(lyrics, elapsed);
    setActiveIdx(currentIndex => (currentIndex === nextIndex ? currentIndex : nextIndex));
  }, [elapsed, lyrics]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const track = trackRef.current;
    if (!container || !track || activeIdx < 0) return undefined;

    const centerActiveLine = () => {
      const line = track.querySelector(`[data-lyric-index="${activeIdx}"]`);
      if (!line) return;

      // Symmetric padding gives the first and last lines enough scroll range to reach center.
      const centerOffset = Math.max(0, (container.clientHeight - line.offsetHeight) / 2);
      track.style.paddingBlock = `${centerOffset}px`;
      const targetTop = Math.max(0, line.offsetTop - centerOffset);
      const options = { top: targetTop, behavior: isPlaying ? 'smooth' : 'auto' };

      if (typeof container.scrollTo === 'function') container.scrollTo(options);
      else container.scrollTop = targetTop;
    };

    centerActiveLine();
    window.addEventListener('resize', centerActiveLine);
    return () => window.removeEventListener('resize', centerActiveLine);
  }, [activeIdx, isPlaying]);

  const empty = !song || !lyrics.length;

  return (
    <section
      ref={containerRef}
      className={`lyrics-display pixel-border${empty ? ' lyrics-display-empty' : ''}`}
      role="region"
      aria-label="Lyrics"
      tabIndex={0}
    >
      {empty ? (
        <p className="lyrics-empty-message">{song ? 'No lyrics available' : ''}</p>
      ) : (
        <div ref={trackRef} className="lyrics-track">
          {lyrics.map((line, index) => {
            const active = index === activeIdx;
            const translation = transLyrics.find(item => Math.abs(item.time - line.time) < 0.1);
            return (
              <div
                className={`lyrics-line${active ? ' is-active' : ''}`}
                data-lyric-index={index}
                aria-current={active ? 'true' : undefined}
                key={`${line.time}-${index}`}
              >
                <span>{line.text}</span>
                {translation && <span className="lyrics-translation">{translation.text}</span>}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
