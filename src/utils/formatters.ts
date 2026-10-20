/**
 * Format a duration in seconds into a human-readable string.
 * Examples:
 *   0        → "0 min"
 *   90       → "2 min"
 *   3600     → "1 hr"
 *   3720     → "1 hr 2 min"
 *   7380     → "2 hr 3 min"
 */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0 min';

  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} hr`;
  return `${hours} hr ${minutes} min`;
}

/**
 * Format a station count into a labelled string.
 * Examples:
 *   1 → "1 station"
 *   5 → "5 stations"
 */
export function formatStationCount(count: number): string {
  return count === 1 ? '1 station' : `${count} stations`;
}

/**
 * Format an interchange count into a labelled string.
 * Examples:
 *   0 → "Direct"
 *   1 → "1 interchange"
 *   2 → "2 interchanges"
 */
export function formatInterchangeCount(count: number): string {
  if (count === 0) return 'Direct';
  return count === 1 ? '1 interchange' : `${count} interchanges`;
}

/**
 * Return estimated fare (INR) based on DMRC zone-based distance fare table.
 * This is a simplified approximation — not an official DMRC fare.
 *
 * DMRC fare slabs (approximate as of 2023):
 *   0–2 km    → ₹10
 *   2–5 km    → ₹20
 *   5–12 km   → ₹30
 *   12–21 km  → ₹40
 *   21–32 km  → ₹50
 *   32+ km    → ₹60
 *
 * We approximate distance as (stationCount - 1) × 1.5 km average.
 */
export function estimateFare(stationCount: number): { amount: number; label: string } {
  const distanceKm = Math.max(0, (stationCount - 1) * 1.5);
  let amount: number;

  if (distanceKm <= 2)       amount = 10;
  else if (distanceKm <= 5)  amount = 20;
  else if (distanceKm <= 12) amount = 30;
  else if (distanceKm <= 21) amount = 40;
  else if (distanceKm <= 32) amount = 50;
  else                       amount = 60;

  return {
    amount,
    label: `₹${amount} (estimated)`,
  };
}
