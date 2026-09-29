const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Calendar time as design v6 prints it (components.md, StatTile Projects passing and
 * RecoveryStats): "4m" under an hour, "2h 14m" and "9h 02m" under a day, "3d 4h" from a day.
 * Units are whole and counted down, as a clock reads, so a stretch is never shown longer
 * than it has been.
 */
export function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) throw new Error(`formatElapsed: ${ms} is not a duration`);
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)}m`;
  if (ms < DAY) {
    const minutes = Math.floor((ms % HOUR) / MINUTE);
    return `${Math.floor(ms / HOUR)}h ${String(minutes).padStart(2, '0')}m`;
  }
  return `${Math.floor(ms / DAY)}d ${Math.floor((ms % DAY) / HOUR)}h`;
}
