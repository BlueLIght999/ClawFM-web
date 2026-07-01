import { useRef, useEffect, useCallback, useState } from 'react';
import { SPECTRUM_COLORS, NIGHT_SPECTRUM_COLORS } from '../theme/themes.js';

const FFT_SIZE = 128;
const BAR_GAP = 2;
const BAR_HEIGHT = 48;

export default function Spectrum({ audioElement, isPlaying, onBeatData, theme, songKey }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const animRef = useRef(null);
  const connectedRef = useRef(false);
  const nightColorRef = useRef(null);
  const [canvasW, setCanvasW] = useState(400);

  // Reset night spectrum color on song change
  useEffect(() => {
    nightColorRef.current = null;
  }, [songKey]);
  const [barCount, setBarCount] = useState(50);

  // Measure container width for responsive sizing
  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth;
        setCanvasW(w);
        setBarCount(Math.max(20, Math.floor(w / 7)));
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const resumeCtx = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  }, []);

  const onCtxStateChange = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  }, []);

  const setupAudio = useCallback(() => {
    const audio = audioElement;
    if (!audio || connectedRef.current) return;

    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.7;

      const source = ctx.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(ctx.destination);

      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      sourceRef.current = source;
      connectedRef.current = true;

      // Resume when music starts playing
      audio.addEventListener('play', resumeCtx);
      // Browser may auto-suspend — resume immediately
      ctx.addEventListener('statechange', onCtxStateChange);
    } catch (e) {
      console.log('[Spectrum] Audio connect failed:', e.message);
    }
  }, [audioElement, resumeCtx, onCtxStateChange]);

  useEffect(() => {
    if (!audioElement) return;
    const t = setTimeout(setupAudio, 200);
    return () => {
      clearTimeout(t);
      audioElement.removeEventListener('play', resumeCtx);
    };
  }, [audioElement, setupAudio, resumeCtx]);

  // Release MediaElementSource on unmount so next mount can reconnect
  useEffect(() => {
    return () => {
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
      const ctx = audioCtxRef.current;
      if (ctx) {
        ctx.removeEventListener('statechange', onCtxStateChange);
        ctx.close().catch(() => {});
        audioCtxRef.current = null;
      }
      if (audioElement) {
        audioElement.removeEventListener('play', resumeCtx);
      }
      connectedRef.current = false;
      analyserRef.current = null;
      sourceRef.current = null;
    };
  }, [audioElement, resumeCtx, onCtxStateChange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    const buffer = new Uint8Array(analyser.frequencyBinCount);

    let frameSkip = 0;
    const draw = () => {
      frameSkip++;
      if (frameSkip % 2 === 0) {
        animRef.current = requestAnimationFrame(draw);
        return;
      }
      // Resume context if suspended (belt-and-suspenders)
      if (audioCtxRef.current?.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }
      analyser.getByteFrequencyData(buffer);

      const w = canvas.width;
      const h = canvas.height;
      const barWidth = Math.max(3, (w / barCount) - BAR_GAP);
      const barValues = new Array(barCount).fill(0);
      const binCount = buffer.length;

      for (let i = 0; i < barCount; i++) {
        const t = i / barCount;
        const binIndex = Math.floor(t * t * binCount * 0.7 + t * binCount * 0.3);
        const val = Math.min(buffer[binIndex] || 0, 255) / 255;
        barValues[i] = val;
      }

      let totalEnergy = 0;
      for (let i = 0; i < barCount; i++) totalEnergy += barValues[i];
      totalEnergy /= barCount;

      if (onBeatData) {
        onBeatData({ totalEnergy, barValues: [...barValues] });
      }

      ctx.clearRect(0, 0, w, h);
      const px = barWidth + BAR_GAP;

      for (let i = 0; i < barCount; i++) {
        const v = barValues[i];
        const barH = Math.max(2, v * (h - 4));
        const x = i * px;
        const y = h - barH;

        let r, g, b;

        if (theme === 'night') {
          // Random neon color, pick on first draw if not set
          if (!nightColorRef.current) {
            const idx = Math.floor(Math.random() * NIGHT_SPECTRUM_COLORS.length);
            nightColorRef.current = NIGHT_SPECTRUM_COLORS[idx];
          }
          const nc = nightColorRef.current;
          r = Math.floor(nc.r * v * 1.2);
          g = Math.floor(nc.g * v * 1.2);
          b = Math.floor(nc.b * v * 1.2);
        } else if (theme === 'morning') {
          const sc = SPECTRUM_COLORS.morning;
          r = sc.barR + Math.floor(v * (sc.highlightR - sc.barR));
          g = sc.barG + Math.floor(v * (sc.highlightG - sc.barG));
          b = sc.barB + Math.floor(v * (sc.highlightB - sc.barB));
        } else {
          // afternoon or fallback: warm gradient
          const sc = SPECTRUM_COLORS.afternoon;
          const t2 = i / barCount;
          r = Math.floor(sc.barR * (1 - t2) + sc.highlightR * t2 * v);
          g = Math.floor(sc.barG * (1 - t2) + sc.highlightG * t2 * v);
          b = Math.floor(sc.barB * (1 - t2) + sc.highlightB * t2 * v);
        }

        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x, y, barWidth, barH);

        if (barH > 6) {
          ctx.fillStyle = `rgba(${Math.min(r + 40, 255)},${Math.min(g + 30, 255)},${Math.min(b + 20, 255)},0.7)`;
          ctx.fillRect(x, y, barWidth, 2);
        }
      }

      animRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isPlaying, onBeatData, barCount]);

  // Resume AudioContext on any user click (helps with autoplay policy)
  useEffect(() => {
    window.addEventListener('click', resumeCtx);
    return () => window.removeEventListener('click', resumeCtx);
  }, [resumeCtx]);

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <canvas
        ref={canvasRef}
        width={canvasW}
        height={BAR_HEIGHT}
        style={{
          width: canvasW,
          height: BAR_HEIGHT,
          imageRendering: 'pixelated',
          display: 'block',
        }}
      />
    </div>
  );
}
