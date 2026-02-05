/**
 * Timecode parsing and conversion utilities
 */

/**
 * Parse SRT timecode format: HH:MM:SS,mmm
 * @param timecode - Timecode string in SRT format
 * @returns Time in milliseconds, or null if invalid
 */
export function parseSrtTimecode(timecode: string): number | null {
  // SRT format: 00:01:23,456 (comma as decimal separator)
  const match = timecode.trim().match(/^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})$/);

  if (!match) {
    return null;
  }

  const hours = match[1];
  const minutes = match[2];
  const seconds = match[3];
  const ms = match[4];

  if (!hours || !minutes || !seconds || !ms) {
    return null;
  }

  const h = parseInt(hours, 10);
  const m = parseInt(minutes, 10);
  const s = parseInt(seconds, 10);
  // Pad milliseconds to 3 digits (e.g., "45" -> "450")
  const msNormalized = ms.padEnd(3, '0');
  const milliseconds = parseInt(msNormalized, 10);

  // Validate ranges
  if (m >= 60 || s >= 60 || milliseconds >= 1000) {
    return null;
  }

  return h * 3600000 + m * 60000 + s * 1000 + milliseconds;
}

/**
 * Parse VTT timecode format: HH:MM:SS.mmm or MM:SS.mmm
 * @param timecode - Timecode string in VTT format
 * @returns Time in milliseconds, or null if invalid
 */
export function parseVttTimecode(timecode: string): number | null {
  const trimmed = timecode.trim();

  // VTT format can be either:
  // - 00:01:23.456 (with hours)
  // - 01:23.456 (without hours)

  // Try with hours first: HH:MM:SS.mmm
  let match = trimmed.match(/^(\d{1,2}):(\d{2}):(\d{2})\.(\d{1,3})$/);

  if (match) {
    const hours = match[1];
    const minutes = match[2];
    const seconds = match[3];
    const ms = match[4];

    if (!hours || !minutes || !seconds || !ms) {
      return null;
    }

    const h = parseInt(hours, 10);
    const m = parseInt(minutes, 10);
    const s = parseInt(seconds, 10);
    const msNormalized = ms.padEnd(3, '0');
    const milliseconds = parseInt(msNormalized, 10);

    if (m >= 60 || s >= 60 || milliseconds >= 1000) {
      return null;
    }

    return h * 3600000 + m * 60000 + s * 1000 + milliseconds;
  }

  // Try without hours: MM:SS.mmm
  match = trimmed.match(/^(\d{1,2}):(\d{2})\.(\d{1,3})$/);

  if (match) {
    const minutes = match[1];
    const seconds = match[2];
    const ms = match[3];

    if (!minutes || !seconds || !ms) {
      return null;
    }

    const m = parseInt(minutes, 10);
    const s = parseInt(seconds, 10);
    const msNormalized = ms.padEnd(3, '0');
    const milliseconds = parseInt(msNormalized, 10);

    if (s >= 60 || milliseconds >= 1000) {
      return null;
    }

    return m * 60000 + s * 1000 + milliseconds;
  }

  return null;
}

/**
 * Format milliseconds to SRT timecode format: HH:MM:SS,mmm
 * @param ms - Time in milliseconds
 * @returns Formatted timecode string
 */
export function formatSrtTimecode(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`;
}

/**
 * Format milliseconds to VTT timecode format: HH:MM:SS.mmm
 * @param ms - Time in milliseconds
 * @returns Formatted timecode string
 */
export function formatVttTimecode(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
}
