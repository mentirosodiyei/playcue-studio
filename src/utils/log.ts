/** Sends an event to the per-project log file kept by the main process (never throws). */
export function logEvent(level: 'INFO' | 'WARN' | 'ERROR', source: string, message: string): void {
  try {
    void window.electronAPI?.logWrite?.(level, source, message);
  } catch {
    // ignore
  }
}
