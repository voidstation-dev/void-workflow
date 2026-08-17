import { useCallback, useEffect, useRef, useState } from 'react';
import { convertFileSrc, isTauri } from '@tauri-apps/api/core';

/**
 * useLiveVisualizer — edit-time live preview of the Soundwave Visualizer's
 * output, BEFORE a run. Loads the upstream Audio & Cover node's selected audio
 * into a Web Audio `AnalyserNode` and draws an animation on the provided canvas
 * that mirrors the FFmpeg filter the Rust executor will use at render time:
 *
 *   frequencyBars    → showfreqs=mode=bar        → frequency-bin bars (left→right)
 *   waveform         → showwaves=mode=cline      → time-domain oscilloscope line
 *   circularSpectrum → avectorscope              → centered circular phase plot
 *
 * This is a PREVIEW only — the authoritative render is the Rust FFmpeg pipeline.
 * The canvas intentionally uses the same accent color, bar count, and
 * sensitivity the node configures so what the user sees approximates the MP4.
 * The `frequencyBars` and `waveform` previews closely match their FFmpeg
 * counterparts; `circularSpectrum` draws radial frequency bins as an
 * approximation of `avectorscope`'s stereo Lissajous (both are circular audio
 * visualizations, but not pixel-identical — the preview is indicative, the MP4
 * is authoritative).
 *
 * The hook owns the AudioContext + analyser + <audio> element lifecycle. It
 * returns `playing` + `toggle` so the caller can wire a play/pause control. The
 * AudioContext is created lazily on first play (browsers block autoplay), and
 * torn down when the audio path changes or the node unmounts. No `invoke()` —
 * pure browser Web Audio, consistent with the single-writer IPC rule.
 */
export type VisualizerType = 'frequencyBars' | 'waveform' | 'circularSpectrum';

export interface LiveVisualizer {
  playing: boolean;
  /** Toggle play/pause. No-op when there's no audio path or canvas. */
  toggle: () => void;
}

export function useLiveVisualizer(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  audioPath: string,
  visualizerType: VisualizerType,
  barCount: number,
  accent: string,
  sensitivity: number,
): LiveVisualizer {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  // The drawing loop reads the latest params without restarting the analyser
  // graph — refs updated every render so rAF always sees current values.
  const paramsRef = useRef({ visualizerType, barCount, accent, sensitivity });
  paramsRef.current = { visualizerType, barCount, accent, sensitivity };

  const stopDraw = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) {
      rafRef.current = requestAnimationFrame(draw);
      return;
    }
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) {
      rafRef.current = requestAnimationFrame(draw);
      return;
    }
    // Match canvas backing store to its CSS size × DPR for crisp rendering.
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || canvas.width;
    const cssH = canvas.clientHeight || canvas.height;
    if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
      canvas.width = cssW * dpr;
      canvas.height = cssH * dpr;
    }
    const w = canvas.width;
    const h = canvas.height;
    const { visualizerType: vt, barCount: bars, accent: accentColor, sensitivity: sens } = paramsRef.current;

    ctx2d.clearRect(0, 0, w, h);

    if (vt === 'waveform') {
      const buf = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(buf);
      ctx2d.lineWidth = Math.max(1.5, dpr * 1.5);
      ctx2d.strokeStyle = accentColor;
      ctx2d.beginPath();
      const slice = w / buf.length;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128; // -1..1
        const amp = v * sens;
        const y = h / 2 + (amp * h) / 2;
        const x = i * slice;
        if (i === 0) ctx2d.moveTo(x, y);
        else ctx2d.lineTo(x, y);
      }
      ctx2d.stroke();
    } else {
      // frequencyBars + circularSpectrum both read frequency bins.
      const binCount = analyser.frequencyBinCount;
      const buf = new Uint8Array(binCount);
      analyser.getByteFrequencyData(buf);
      const accentRgb = hexToRgb(accentColor) ?? { r: 118, g: 105, b: 222 };

      if (vt === 'circularSpectrum') {
        const cx = w / 2;
        const cy = h / 2;
        const baseR = Math.min(w, h) * 0.18;
        const maxR = Math.min(w, h) * 0.46;
        const bins = Math.min(bars, binCount);
        for (let i = 0; i < bins; i++) {
          const angle = (i / bins) * Math.PI * 2 - Math.PI / 2;
          const mag = (buf[i] / 255) * sens;
          const r = baseR + mag * (maxR - baseR);
          const x1 = cx + Math.cos(angle) * baseR;
          const y1 = cy + Math.sin(angle) * baseR;
          const x2 = cx + Math.cos(angle) * r;
          const y2 = cy + Math.sin(angle) * r;
          ctx2d.strokeStyle = `rgba(${accentRgb.r},${accentRgb.g},${accentRgb.b},${0.4 + mag * 0.6})`;
          ctx2d.lineWidth = Math.max(1.5, (Math.PI * 2 * baseR) / bins);
          ctx2d.beginPath();
          ctx2d.moveTo(x1, y1);
          ctx2d.lineTo(x2, y2);
          ctx2d.stroke();
        }
      } else {
        // frequencyBars — left-to-right bars over the canvas height.
        const bins = Math.min(bars, binCount);
        const gap = dpr;
        const bw = (w - gap * (bins - 1)) / bins;
        for (let i = 0; i < bins; i++) {
          const mag = (buf[i] / 255) * sens;
          const bh = mag * h;
          ctx2d.fillStyle = `rgba(${accentRgb.r},${accentRgb.g},${accentRgb.b},${0.35 + mag * 0.65})`;
          ctx2d.fillRect(i * (bw + gap), h - bh, bw, bh);
        }
      }
    }
    rafRef.current = requestAnimationFrame(draw);
  }, [canvasRef]);

  // Tear down the whole graph when the audio path changes or the hook unmounts.
  useEffect(() => {
    return () => {
      stopDraw();
      const audio = audioRef.current;
      const ctx = ctxRef.current;
      if (audio) {
        audio.pause();
        audio.src = '';
      }
      if (ctx && ctx.state !== 'closed') {
        void ctx.close();
      }
      audioRef.current = null;
      ctxRef.current = null;
      analyserRef.current = null;
    };
  }, [audioPath, stopDraw]);

  const toggle = useCallback(() => {
    if (!audioPath) return;
    // Resolve the playable URL for the <audio> element. In Tauri, audioPath is a
    // filesystem path → convertFileSrc turns it into the asset-protocol URL the
    // webview can load. In a plain browser (vite dev without the Tauri shell),
    // audioPath is already a blob:/data: URL produced by the HTML file-input
    // fallback → use it directly. Either way the Web Audio graph below reads the
    // same element. Without a usable URL the preview stays a no-op (honest).
    const isWebUrl = /^(blob:|data:|https?:)/i.test(audioPath);
    const playable = isTauri() && !isWebUrl ? convertFileSrc(audioPath) : audioPath;
    let audio = audioRef.current;
    if (!audio) {
      audio = new Audio(playable);
      audioRef.current = audio;
    } else if (audio.src !== playable) {
      // Path changed since the element was created — swap the source.
      audio.src = playable;
    }
    // Build the Web Audio graph lazily on first play (browsers suspend
    // AudioContext until a user gesture). Connect <audio> → source → analyser
    // → destination so the user hears the audio while the canvas reads it.
    if (!ctxRef.current) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      const src = ctx.createMediaElementSource(audio);
      src.connect(analyser);
      analyser.connect(ctx.destination);
      ctxRef.current = ctx;
      analyserRef.current = analyser;
    }
    const ctx = ctxRef.current!;
    if (playing) {
      audio.pause();
      stopDraw();
      setPlaying(false);
    } else {
      void ctx.resume();
      void audio.play();
      rafRef.current = requestAnimationFrame(draw);
      setPlaying(true);
    }
  }, [audioPath, playing, draw, stopDraw]);

  // Reset to paused when the audio path changes.
  useEffect(() => {
    setPlaying(false);
    stopDraw();
  }, [audioPath, stopDraw]);

  // Stop drawing when the tab is hidden (saves a steady rAF wake).
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        stopDraw();
      } else if (playing && audioRef.current && !audioRef.current.paused) {
        rafRef.current = requestAnimationFrame(draw);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [playing, draw, stopDraw]);

  return { playing, toggle };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}