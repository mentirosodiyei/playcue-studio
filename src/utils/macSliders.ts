/**
 * Keeps the `--pct` CSS variable of every range input in sync with its value so the
 * macOS-style filled track (see index.css) always reflects the current position,
 * including when React changes the value programmatically.
 */
function sync(el: HTMLInputElement) {
  const min = parseFloat(el.min || '0');
  const max = parseFloat(el.max || '100');
  const val = parseFloat(el.value || '0');
  const pct = max > min ? Math.min(100, Math.max(0, ((val - min) / (max - min)) * 100)) : 0;
  const next = `${pct.toFixed(2)}%`;
  if (el.style.getPropertyValue('--pct') !== next) el.style.setProperty('--pct', next);
}

export function installMacSliders() {
  const all = () => document.querySelectorAll<HTMLInputElement>('input[type="range"]');
  document.addEventListener(
    'input',
    (e) => {
      const t = e.target as HTMLInputElement;
      if (t && t.type === 'range') sync(t);
    },
    true
  );
  const tick = () => all().forEach(sync);
  tick();
  window.setInterval(tick, 150);
}
