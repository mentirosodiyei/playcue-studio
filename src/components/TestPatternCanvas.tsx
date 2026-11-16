import React, { useLayoutEffect, useRef } from 'react';
import { MosaicMode } from '../types/cue';

import { tr } from '../i18n';
interface TestPatternCanvasProps {
  showName?: string;
  label?: string;
  canvasWidth?: number;
  canvasHeight?: number;
  mosaicMode?: MosaicMode;
  /** When false the animation loop is stopped (used while the layer is kept mounted but hidden). */
  active?: boolean;
}

export const TestPatternCanvas: React.FC<TestPatternCanvasProps> = ({
  active = true,
  showName = 'PlayCue Studio',
  label,
  canvasWidth = 1920,
  canvasHeight = 1080,
  mosaicMode = 'single',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Use clean internal render resolution proportional to canvas aspect
  const aspect = canvasWidth / Math.max(1, canvasHeight);
  const internalW = aspect >= 2.2 ? 3840 : 1920;
  const internalH = Math.round(internalW / aspect);

  useLayoutEffect(() => {
    if (!active) return; // keep the canvas mounted but idle while the pattern is off
    let animId = 0;
    const startTime = performance.now();

    const render = (now: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;

      // Background dark grid
      ctx.fillStyle = '#0a0e17';
      ctx.fillRect(0, 0, w, h);

      // Square grid lines
      const step = Math.round(Math.min(w, h) / 10);
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 2;
      for (let x = 0; x <= w; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y <= h; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Outer border & diagonals
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 4;
      ctx.strokeRect(4, 4, w - 8, h - 8);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(w, h);
      ctx.moveTo(w, 0);
      ctx.lineTo(0, h);
      ctx.stroke();

      // Center circle
      const radius = Math.min(w, h) * 0.36;
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, radius, 0, Math.PI * 2);
      ctx.stroke();

      // If Mosaic 2x1 or 1x2, draw sub-circles and Seam Alignment Crosshairs!
      if (mosaicMode === 'horizontal_2x1') {
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 3;
        ctx.setLineDash([14, 10]);
        ctx.beginPath();
        ctx.moveTo(w / 2, 0);
        ctx.lineTo(w / 2, h);
        ctx.stroke();
        ctx.setLineDash([]);

        // Left & Right output center circles
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.55)';
        ctx.beginPath();
        ctx.arc(w * 0.25, h / 2, radius * 0.65, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
        ctx.beginPath();
        ctx.arc(w * 0.75, h / 2, radius * 0.65, 0, Math.PI * 2);
        ctx.stroke();

        // Output Labels
        ctx.fillStyle = '#10b981';
        ctx.font = `bold ${Math.round(h * 0.032)}px "Consolas", monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(tr("SALIDA 1 (IZQUIERDA)"), w * 0.25, h * 0.12);

        ctx.fillStyle = '#38bdf8';
        ctx.fillText(tr("SALIDA 2 (DERECHA)"), w * 0.75, h * 0.12);
      } else if (mosaicMode === 'vertical_1x2') {
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 3;
        ctx.setLineDash([14, 10]);
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#10b981';
        ctx.font = `bold ${Math.round(w * 0.025)}px "Consolas", monospace`;
        ctx.textAlign = 'left';
        ctx.fillText(tr("SALIDA 1 (SUPERIOR)"), 36, h * 0.08);

        ctx.fillStyle = '#38bdf8';
        ctx.fillText(tr("SALIDA 2 (INFERIOR)"), 36, h * 0.58);
      }

      // SMPTE Color Bars in middle band
      const colors = [
        '#e2e8f0',
        '#eab308',
        '#06b6d4',
        '#22c55e',
        '#d946ef',
        '#ef4444',
        '#3b82f6',
      ];
      const barW = (w * 0.58) / colors.length;
      const startX = w * 0.21;
      const barY = h * 0.24;
      const barH = h * 0.2;

      colors.forEach((col, i) => {
        ctx.fillStyle = col;
        ctx.fillRect(startX + i * barW, barY, barW + 1, barH);
      });

      // Grayscale ramp
      const grays = 11;
      const gW = (w * 0.58) / grays;
      for (let i = 0; i < grays; i++) {
        const v = Math.round((i / (grays - 1)) * 255);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(startX + i * gW, barY + barH + 10, gW + 1, h * 0.055);
      }

      // Moving Full-Width Sync / Frame-Lock Verification Bar (crosses the seam between outputs!)
      const elapsed = (now - startTime) / 1000;
      const bounce = (Math.sin(elapsed * 2.6) + 1) / 2;
      const syncX = startX + bounce * (w * 0.58 - 32);
      ctx.fillStyle = '#10b981';
      ctx.fillRect(syncX, barY + barH + h * 0.075, 32, h * 0.05);

      // Also draw a vertical moving sync line across the whole screen to test horizontal/vertical frame lock
      const scanY = ((elapsed * 260) % h);
      ctx.fillStyle = 'rgba(245, 158, 11, 0.65)';
      ctx.fillRect(0, scanY, w, 4);

      // Text Box
      ctx.fillStyle = 'rgba(7, 9, 13, 0.9)';
      ctx.fillRect(w * 0.24, h * 0.63, w * 0.52, h * 0.2);
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 2;
      ctx.strokeRect(w * 0.24, h * 0.63, w * 0.52, h * 0.2);

      const fontBase = Math.max(18, Math.round(Math.min(w, h) * 0.028));
      ctx.fillStyle = '#f8fafc';
      ctx.font = `bold ${fontBase}px "Segoe UI", monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(showName.toUpperCase(), w / 2, h * 0.695);

      const autoLabel =
        label ||
        tr("LIENZO DE SALIDA: {w} × {h} px ({mode})", { w: canvasWidth, h: canvasHeight, mode: mosaicMode.toUpperCase() });
      ctx.fillStyle = '#38bdf8';
      ctx.font = `600 ${Math.round(fontBase * 0.68)}px "Consolas", monospace`;
      ctx.fillText(autoLabel, w / 2, h * 0.748);

      const timeStr = new Date().toLocaleTimeString('es-ES', { hour12: false });
      const ms = String(Math.floor((now % 1000) / 10)).padStart(2, '0');
      ctx.fillStyle = '#10b981';
      ctx.font = `bold ${Math.round(fontBase * 0.78)}px "Consolas", monospace`;
      ctx.fillText(`FRAME-LOCK SYNC TC: ${timeStr}.${ms}`, w / 2, h * 0.8);

      animId = requestAnimationFrame(render);
    };

    // Paint the first frame synchronously (before the browser paints) so switching the pattern
    // on never shows an empty/transparent canvas for one frame
    render(performance.now());
    return () => cancelAnimationFrame(animId);
  }, [active, showName, label, canvasWidth, canvasHeight, mosaicMode]);

  return (
    <canvas
      ref={canvasRef}
      width={internalW}
      height={internalH}
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'fill',
        display: 'block',
        backgroundColor: '#0a0e17',
      }}
    />
  );
};
