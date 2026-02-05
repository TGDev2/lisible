import { describe, it, expect } from 'vitest';
import {
  parseSrtTimecode,
  parseVttTimecode,
  formatSrtTimecode,
  formatVttTimecode,
} from '../timecode';

describe('parseSrtTimecode', () => {
  it('should parse valid SRT timecode with comma', () => {
    expect(parseSrtTimecode('00:01:23,456')).toBe(83456);
  });

  it('should parse timecode with single-digit hours', () => {
    expect(parseSrtTimecode('1:02:03,456')).toBe(3723456);
  });

  it('should handle zero timecode', () => {
    expect(parseSrtTimecode('00:00:00,000')).toBe(0);
  });

  it('should parse timecode at max values', () => {
    expect(parseSrtTimecode('99:59:59,999')).toBe(359999999);
  });

  it('should handle short milliseconds (45 -> 450)', () => {
    expect(parseSrtTimecode('00:00:01,45')).toBe(1450);
  });

  it('should handle single-digit milliseconds (5 -> 500)', () => {
    expect(parseSrtTimecode('00:00:01,5')).toBe(1500);
  });

  it('should tolerate period instead of comma', () => {
    expect(parseSrtTimecode('00:01:23.456')).toBe(83456);
  });

  it('should return null for invalid format - missing parts', () => {
    expect(parseSrtTimecode('00:01:23')).toBeNull();
  });

  it('should return null for invalid format - bad separator', () => {
    expect(parseSrtTimecode('00-01-23,456')).toBeNull();
  });

  it('should return null for invalid minutes (>= 60)', () => {
    expect(parseSrtTimecode('00:60:00,000')).toBeNull();
  });

  it('should return null for invalid seconds (>= 60)', () => {
    expect(parseSrtTimecode('00:00:60,000')).toBeNull();
  });

  it('should handle whitespace', () => {
    expect(parseSrtTimecode('  00:01:23,456  ')).toBe(83456);
  });
});

describe('parseVttTimecode', () => {
  it('should parse VTT timecode with hours', () => {
    expect(parseVttTimecode('00:01:23.456')).toBe(83456);
  });

  it('should parse VTT timecode without hours', () => {
    expect(parseVttTimecode('01:23.456')).toBe(83456);
  });

  it('should handle zero timecode', () => {
    expect(parseVttTimecode('00:00:00.000')).toBe(0);
  });

  it('should handle zero timecode without hours', () => {
    expect(parseVttTimecode('00:00.000')).toBe(0);
  });

  it('should handle short milliseconds', () => {
    expect(parseVttTimecode('00:00:01.45')).toBe(1450);
  });

  it('should return null for invalid format', () => {
    expect(parseVttTimecode('00:01:23,456')).toBeNull(); // Uses comma instead of period
  });

  it('should return null for invalid seconds', () => {
    expect(parseVttTimecode('00:60.000')).toBeNull();
  });
});

describe('formatSrtTimecode', () => {
  it('should format milliseconds to SRT timecode', () => {
    expect(formatSrtTimecode(83456)).toBe('00:01:23,456');
  });

  it('should format zero', () => {
    expect(formatSrtTimecode(0)).toBe('00:00:00,000');
  });

  it('should pad hours, minutes, seconds correctly', () => {
    expect(formatSrtTimecode(3661001)).toBe('01:01:01,001');
  });

  it('should handle large hours', () => {
    expect(formatSrtTimecode(359999999)).toBe('99:59:59,999');
  });
});

describe('formatVttTimecode', () => {
  it('should format milliseconds to VTT timecode', () => {
    expect(formatVttTimecode(83456)).toBe('00:01:23.456');
  });

  it('should format zero', () => {
    expect(formatVttTimecode(0)).toBe('00:00:00.000');
  });

  it('should use period as decimal separator', () => {
    const result = formatVttTimecode(1500);
    expect(result).toBe('00:00:01.500');
    expect(result).toContain('.');
    expect(result).not.toContain(',');
  });
});

describe('roundtrip conversion', () => {
  it('should roundtrip SRT timecode correctly', () => {
    const original = '00:05:30,123';
    const ms = parseSrtTimecode(original);
    expect(ms).not.toBeNull();
    expect(formatSrtTimecode(ms!)).toBe(original);
  });

  it('should roundtrip VTT timecode correctly', () => {
    const original = '00:05:30.123';
    const ms = parseVttTimecode(original);
    expect(ms).not.toBeNull();
    expect(formatVttTimecode(ms!)).toBe(original);
  });
});
