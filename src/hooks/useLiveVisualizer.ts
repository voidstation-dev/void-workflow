import { useCallback, useEffect, useRef, useState } from 'react';
import { convertFileSrc, isTauri } from '@tauri-apps/api/core';

export type VisualizerType = 'frequencyBars' | 'waveform' | 'circularSpectrum';
export type VisualizerPosition = 'bottom' | 'center' | 'top';

export interface LiveVisualizer {
  playing: boolean;
  isSimulating: boolean;
  currentTime: number;
  duration: number;
  progress: number;
  volume: number;
  /** Toggle play/pause of audio playback. */
  toggle: () => void;
  /** Seek to time in seconds. */
  seek: (timeSeconds: number) => void;
  /** Set volume level 0..1. */
  setVolume: (vol: number) => void;
}

export interface LiveVisualizerOptions {
  backgroundPath?: string;
  simulateIdle?: boolean;
  position?: VisualizerPosition;
  opacity?: number;
}

export function useLiveVisualizer(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  audioPath: string,
  visualizerType: VisualizerType,
  barCount: number,
  accent: string,
  sensitivity: number,
  options?: LiveVisualizerOptions,
): LiveVisualizer {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(1);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  // Background image element cache
  const bgImgRef = useRef<HTMLImageElement | null>(null);
  const bgPathRef = useRef<string>('');

  // Smoothing array for fluid 60fps transitions
  const smoothedRef = useRef<Float32Array>(new Float32Array(256));

  const backgroundPath = options?.backgroundPath ?? '';
  const simulateIdle = options?.simulateIdle ?? false;
  const position = options?.position ?? 'bottom';
  const opacity = Math.max(0.1, Math.min(1.0, options?.opacity ?? 0.85));

  // Track latest params without restarting graph
  const paramsRef = useRef({
    visualizerType,
    barCount,
    accent,
    sensitivity,
    backgroundPath,
    simulateIdle,
    position,
    opacity,
    playing,
  });
  paramsRef.current = {
    visualizerType,
    barCount,
    accent,
    sensitivity,
    backgroundPath,
    simulateIdle,
    position,
    opacity,
    playing,
  };

  const stopDraw = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;

    // Match canvas backing store to CSS size × DPR for crisp HD display
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || canvas.width || 320;
    const cssH = canvas.clientHeight || canvas.height || 180;
    const targetW = Math.round(cssW * dpr);
    const targetH = Math.round(cssH * dpr);

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    const w = canvas.width;
    const h = canvas.height;

    const {
      visualizerType: vt,
      barCount: bars,
      accent: accentColor,
      sensitivity: sens,
      position: pos,
      opacity: visOpacity,
      playing: isAudioPlaying,
    } = paramsRef.current;

    // 1. Draw background image if available, else clean dark canvas
    ctx2d.clearRect(0, 0, w, h);
    if (bgImgRef.current && bgImgRef.current.complete && bgImgRef.current.naturalWidth > 0) {
      const img = bgImgRef.current;
      const imgRatio = img.naturalWidth / img.naturalHeight;
      const canvasRatio = w / h;
      let renderW = w;
      let renderH = h;
      let offsetX = 0;
      let offsetY = 0;

      if (imgRatio > canvasRatio) {
        renderW = h * imgRatio;
        offsetX = (w - renderW) / 2;
      } else {
        renderH = w / imgRatio;
        offsetY = (h - renderH) / 2;
      }

      ctx2d.drawImage(img, offsetX, offsetY, renderW, renderH);

      // Subtle gradient overlay for contrast
      ctx2d.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx2d.fillRect(0, 0, w, h);
    } else {
      // Sleek default background gradient
      const bgGrad = ctx2d.createLinearGradient(0, 0, 0, h);
      bgGrad.addColorStop(0, '#13141c');
      bgGrad.addColorStop(1, '#0b0c10');
      ctx2d.fillStyle = bgGrad;
      ctx2d.fillRect(0, 0, w, h);
    }

    const analyser = analyserRef.current;
    const hasLiveAudio = isAudioPlaying && analyser !== null;

    const accentRgb = hexToRgb(accentColor) ?? { r: 118, g: 105, b: 222 };
    const clampedBars = Math.max(4, Math.min(bars, 256));

    if (smoothedRef.current.length !== clampedBars) {
      smoothedRef.current = new Float32Array(clampedBars);
    }
    const smoothed = smoothedRef.current;

    ctx2d.save();
    ctx2d.globalAlpha = visOpacity;

    if (vt === 'waveform') {
      const points = 128;
      const step = w / (points - 1);
      const baseline = pos === 'top' ? h * 0.25 : pos === 'center' ? h * 0.5 : h * 0.72;
      const maxAmp = h * 0.24;

      ctx2d.lineWidth = Math.max(2, dpr * 2);
      ctx2d.strokeStyle = accentColor;
      ctx2d.shadowColor = accentColor;
      ctx2d.shadowBlur = 6 * dpr;

      ctx2d.beginPath();

      if (hasLiveAudio) {
        const timeBuf = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(timeBuf);
        const slice = timeBuf.length / points;
        for (let i = 0; i < points; i++) {
          const sampleIdx = Math.floor(i * slice);
          const v = (timeBuf[sampleIdx] - 128) / 128; // -1..1
          const amp = v * sens;
          const y = baseline + amp * maxAmp;
          const x = i * step;
          if (i === 0) ctx2d.moveTo(x, y);
          else ctx2d.lineTo(x, y);
        }
      } else {
        // Clean static waveform curve
        for (let i = 0; i < points; i++) {
          const norm = i / (points - 1);
          const v = Math.sin(norm * Math.PI * 4) * 0.45 + Math.sin(norm * Math.PI * 8) * 0.25;
          const windowEnvelope = Math.sin(norm * Math.PI); // Taper edges
          const amp = v * windowEnvelope * sens;
          const y = baseline + amp * maxAmp;
          const x = i * step;
          if (i === 0) ctx2d.moveTo(x, y);
          else ctx2d.lineTo(x, y);
        }
      }

      ctx2d.stroke();
    } else if (vt === 'circularSpectrum') {
      const cx = w / 2;
      const cy = pos === 'top' ? h * 0.32 : pos === 'bottom' ? h * 0.68 : h / 2;
      const baseR = Math.min(w, h) * 0.18;
      const maxR = Math.min(w, h) * 0.42;

      let freqBuf: Uint8Array | null = null;
      if (hasLiveAudio) {
        freqBuf = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(freqBuf);
      }

      for (let i = 0; i < clampedBars; i++) {
        let rawMag = 0;
        if (hasLiveAudio && freqBuf) {
          const binIdx = Math.floor((i / clampedBars) * (freqBuf.length * 0.7));
          rawMag = (freqBuf[binIdx] / 255) * sens;
          smoothed[i] = smoothed[i] * 0.75 + rawMag * 0.25;
        } else {
          const angle = (i / clampedBars) * Math.PI * 2;
          rawMag = (Math.sin(angle * 4) * 0.35 + Math.cos(angle * 6) * 0.2 + 0.4) * sens;
          smoothed[i] = rawMag;
        }
      }

      // Inner glow
      ctx2d.beginPath();
      ctx2d.arc(cx, cy, baseR * 0.85, 0, Math.PI * 2);
      ctx2d.fillStyle = `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.18)`;
      ctx2d.fill();
      ctx2d.lineWidth = Math.max(1.5, dpr);
      ctx2d.strokeStyle = `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.6)`;
      ctx2d.stroke();

      // Radial spokes
      ctx2d.beginPath();
      ctx2d.lineWidth = Math.max(1.5, ((Math.PI * 2 * baseR) / clampedBars) * 0.75);
      ctx2d.strokeStyle = `rgb(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b})`;
      ctx2d.shadowColor = accentColor;
      ctx2d.shadowBlur = 4 * dpr;

      for (let i = 0; i < clampedBars; i++) {
        const angle = (i / clampedBars) * Math.PI * 2 - Math.PI / 2;
        const mag = Math.min(1.2, smoothed[i]);
        const r = baseR + mag * (maxR - baseR);
        const x1 = cx + Math.cos(angle) * baseR;
        const y1 = cy + Math.sin(angle) * baseR;
        const x2 = cx + Math.cos(angle) * r;
        const y2 = cy + Math.sin(angle) * r;
        ctx2d.moveTo(x1, y1);
        ctx2d.lineTo(x2, y2);
      }
      ctx2d.stroke();
    } else {
      // Frequency Bars (Default)
      let freqBuf: Uint8Array | null = null;
      if (hasLiveAudio) {
        freqBuf = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(freqBuf);
      }

      for (let i = 0; i < clampedBars; i++) {
        let rawMag = 0;
        if (hasLiveAudio && freqBuf) {
          const binIdx = Math.floor((i / clampedBars) * (freqBuf.length * 0.75));
          rawMag = (freqBuf[binIdx] / 255) * sens;
          smoothed[i] = smoothed[i] * 0.75 + rawMag * 0.25;
        } else {
          const norm = i / clampedBars;
          rawMag = (Math.sin(norm * Math.PI) * 0.65 + Math.sin(norm * Math.PI * 3) * 0.18 + 0.1) * sens;
          smoothed[i] = rawMag;
        }
      }

      const gap = Math.max(1, dpr * 1.5);
      const totalGaps = (clampedBars - 1) * gap;
      const bw = Math.max(1, (w - totalGaps) / clampedBars);

      const maxBarH = h * (pos === 'center' ? 0.38 : 0.42);

      const grad = ctx2d.createLinearGradient(0, h, 0, 0);
      grad.addColorStop(0, `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.85)`);
      grad.addColorStop(1, `rgba(${Math.min(255, accentRgb.r + 50)}, ${Math.min(255, accentRgb.g + 50)}, ${Math.min(255, accentRgb.b + 50)}, 1)`);
      ctx2d.fillStyle = grad;
      ctx2d.shadowColor = accentColor;
      ctx2d.shadowBlur = 3 * dpr;

      for (let i = 0; i < clampedBars; i++) {
        const mag = Math.min(1.0, smoothed[i]);
        const bh = Math.max(2 * dpr, mag * maxBarH);
        const bx = i * (bw + gap);
        const by = pos === 'top' ? 0 : pos === 'center' ? (h - bh) / 2 : h - bh;
        const radius = Math.min(bw / 2, 3 * dpr);

        ctx2d.beginPath();
        if (pos === 'top') {
          ctx2d.roundRect(bx, by, bw, bh, [0, 0, radius, radius]);
        } else if (pos === 'center') {
          ctx2d.roundRect(bx, by, bw, bh, [radius, radius, radius, radius]);
        } else {
          ctx2d.roundRect(bx, by, bw, bh, [radius, radius, 0, 0]);
        }
        ctx2d.fill();
      }
    }

    ctx2d.restore();

    // ONLY continue rAF loop when actively playing audio
    if (isAudioPlaying) {
      rafRef.current = requestAnimationFrame(draw);
    }
  }, [canvasRef]);

  // Preload background image when path changes
  useEffect(() => {
    const p = backgroundPath.trim();
    if (!p) {
      bgImgRef.current = null;
      bgPathRef.current = '';
      draw();
      return;
    }
    if (p === bgPathRef.current) return;
    bgPathRef.current = p;

    const isWebUrl = /^(blob:|data:|https?:)/i.test(p);
    const playable = isTauri() && !isWebUrl ? convertFileSrc(p) : p;

    const img = new Image();
    img.src = playable;
    img.onload = () => {
      if (bgPathRef.current === p) {
        bgImgRef.current = img;
        draw();
      }
    };
    img.onerror = () => {
      if (bgPathRef.current === p) {
        bgImgRef.current = null;
        draw();
      }
    };
  }, [backgroundPath, draw]);

  // Initial draw & redraw on param changes without running animation loop
  useEffect(() => {
    stopDraw();
    if (playing) {
      rafRef.current = requestAnimationFrame(draw);
    } else {
      draw();
    }
    return () => {
      stopDraw();
    };
  }, [playing, visualizerType, barCount, accent, sensitivity, position, opacity, draw, stopDraw]);

  // Clean teardown on unmount
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
  }, [stopDraw]);

  const toggle = useCallback(() => {
    if (!audioPath) return;

    const isWebUrl = /^(blob:|data:|https?:)/i.test(audioPath);
    const playable = isTauri() && !isWebUrl ? convertFileSrc(audioPath) : audioPath;

    let audio = audioRef.current;
    if (!audio) {
      audio = new Audio();
      audio.crossOrigin = 'anonymous';
      audio.src = playable;
      audio.volume = volume;

      audio.ontimeupdate = () => {
        if (audioRef.current) {
          setCurrentTime(audioRef.current.currentTime);
          setDuration(audioRef.current.duration || 0);
        }
      };
      audio.onloadedmetadata = () => {
        if (audioRef.current) {
          setDuration(audioRef.current.duration || 0);
        }
      };
      audio.onended = () => {
        setPlaying(false);
      };

      audioRef.current = audio;
    } else if (audio.src !== playable) {
      audio.src = playable;
    }

    if (!ctxRef.current) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.8;
      const src = ctx.createMediaElementSource(audio);
      src.connect(analyser);
      analyser.connect(ctx.destination);
      ctxRef.current = ctx;
      analyserRef.current = analyser;
    }

    const ctx = ctxRef.current!;
    if (playing) {
      audio.pause();
      setPlaying(false);
      stopDraw();
      draw();
    } else {
      void ctx.resume();
      void audio.play();
      setPlaying(true);
      rafRef.current = requestAnimationFrame(draw);
    }
  }, [audioPath, playing, volume, draw, stopDraw]);

  const seek = useCallback((timeSeconds: number) => {
    if (audioRef.current && Number.isFinite(timeSeconds)) {
      audioRef.current.currentTime = Math.max(0, Math.min(timeSeconds, audioRef.current.duration || 0));
      setCurrentTime(audioRef.current.currentTime);
    }
  }, []);

  const setVolume = useCallback((vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol));
    setVolumeState(clamped);
    if (audioRef.current) {
      audioRef.current.volume = clamped;
    }
  }, []);

  // Reset to paused when audioPath changes
  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
    if (audioRef.current) {
      audioRef.current.pause();
    }
    draw();
  }, [audioPath, draw]);

  // Stop/resume rAF when document visibility changes
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        stopDraw();
      } else if (playing) {
        stopDraw();
        rafRef.current = requestAnimationFrame(draw);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [playing, draw, stopDraw]);

  const progress = duration > 0 ? currentTime / duration : 0;

  return {
    playing,
    isSimulating: false,
    currentTime,
    duration,
    progress,
    volume,
    toggle,
    seek,
    setVolume,
  };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}