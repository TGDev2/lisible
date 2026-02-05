import { describe, it, expect } from 'vitest';
import { parseVTT } from '../parse-vtt';

describe('parseVTT', () => {
  describe('valid VTT files', () => {
    it('should parse a simple VTT file', () => {
      const content = `WEBVTT

1
00:00:01.000 --> 00:00:04.000
Hello world

2
00:00:05.000 --> 00:00:08.000
This is a test`;

      const { segments, errors } = parseVTT(content);

      expect(errors).toHaveLength(0);
      expect(segments).toHaveLength(2);

      expect(segments[0]).toEqual({
        sequenceNum: 1,
        startMs: 1000,
        endMs: 4000,
        text: 'Hello world',
      });

      expect(segments[1]).toEqual({
        sequenceNum: 2,
        startMs: 5000,
        endMs: 8000,
        text: 'This is a test',
      });
    });

    it('should parse VTT without cue identifiers', () => {
      const content = `WEBVTT

00:00:01.000 --> 00:00:04.000
Hello world

00:00:05.000 --> 00:00:08.000
This is a test`;

      const { segments, errors } = parseVTT(content);

      expect(errors).toHaveLength(0);
      expect(segments).toHaveLength(2);
      expect(segments[0].sequenceNum).toBe(1);
      expect(segments[1].sequenceNum).toBe(2);
    });

    it('should handle WEBVTT with metadata', () => {
      const content = `WEBVTT
Kind: captions
Language: fr

00:00:01.000 --> 00:00:04.000
Hello world`;

      const { segments, errors } = parseVTT(content);

      expect(errors).toHaveLength(0);
      expect(segments).toHaveLength(1);
    });

    it('should parse timecodes without hours', () => {
      const content = `WEBVTT

01:00.000 --> 04:00.000
Hello world`;

      const { segments, errors } = parseVTT(content);

      expect(errors).toHaveLength(0);
      expect(segments[0].startMs).toBe(60000);
      expect(segments[0].endMs).toBe(240000);
    });

    it('should handle multi-line cues', () => {
      const content = `WEBVTT

00:00:01.000 --> 00:00:04.000
First line
Second line`;

      const { segments, errors } = parseVTT(content);

      expect(errors).toHaveLength(0);
      expect(segments[0].text).toBe('First line\nSecond line');
    });

    it('should ignore NOTE blocks (comments)', () => {
      const content = `WEBVTT

NOTE
This is a comment

00:00:01.000 --> 00:00:04.000
Hello world`;

      const { segments, errors } = parseVTT(content);

      expect(errors).toHaveLength(0);
      expect(segments).toHaveLength(1);
    });

    it('should ignore STYLE blocks', () => {
      const content = `WEBVTT

STYLE
::cue {
  color: white;
}

00:00:01.000 --> 00:00:04.000
Hello world`;

      const { segments, errors } = parseVTT(content);

      expect(errors).toHaveLength(0);
      expect(segments).toHaveLength(1);
    });

    it('should handle cue settings after timecode', () => {
      const content = `WEBVTT

00:00:01.000 --> 00:00:04.000 align:start position:10%
Hello world`;

      const { segments, errors } = parseVTT(content);

      expect(errors).toHaveLength(0);
      expect(segments[0].startMs).toBe(1000);
      expect(segments[0].endMs).toBe(4000);
    });

    it('should strip VTT formatting tags', () => {
      const content = `WEBVTT

00:00:01.000 --> 00:00:04.000
<b>Bold</b> and <i>italic</i>`;

      const { segments, errors } = parseVTT(content);

      expect(errors).toHaveLength(0);
      expect(segments[0].text).toBe('Bold and italic');
    });

    it('should strip voice tags', () => {
      const content = `WEBVTT

00:00:01.000 --> 00:00:04.000
<v Speaker>Hello world`;

      const { segments, errors } = parseVTT(content);

      expect(errors).toHaveLength(0);
      expect(segments[0].text).toBe('Hello world');
    });

    it('should handle BOM at start of file', () => {
      const content = `\uFEFFWEBVTT

00:00:01.000 --> 00:00:04.000
Hello world`;

      const { segments, errors } = parseVTT(content);

      expect(errors).toHaveLength(0);
      expect(segments).toHaveLength(1);
    });

    it('should extract speaker from bracket notation', () => {
      const content = `WEBVTT

00:00:01.000 --> 00:00:04.000
[NARRATOR] Once upon a time`;

      const { segments, errors } = parseVTT(content);

      expect(errors).toHaveLength(0);
      expect(segments[0].speaker).toBe('[NARRATOR]');
      expect(segments[0].text).toBe('Once upon a time');
    });

    it('should detect sound info', () => {
      const content = `WEBVTT

00:00:01.000 --> 00:00:04.000
[Music]`;

      const { segments, errors } = parseVTT(content);

      expect(errors).toHaveLength(0);
      expect(segments[0].isSoundInfo).toBe(true);
    });
  });

  describe('malformed VTT files', () => {
    it('should report error for missing WEBVTT header in lenient mode', () => {
      const content = `00:00:01.000 --> 00:00:04.000
Hello world`;

      const { segments: _segments, errors } = parseVTT(content, { lenient: true });

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain('WEBVTT');
    });

    it('should fail without WEBVTT header in strict mode', () => {
      const content = `00:00:01.000 --> 00:00:04.000
Hello world`;

      const { segments, errors } = parseVTT(content, { lenient: false });

      expect(errors.length).toBeGreaterThan(0);
      expect(segments).toHaveLength(0);
    });

    it('should handle invalid timecode', () => {
      const content = `WEBVTT

invalid --> timecode
Hello world`;

      const { segments: _segments, errors } = parseVTT(content, { lenient: true });

      expect(errors.length).toBeGreaterThan(0);
    });

    it('should continue parsing after error', () => {
      const content = `WEBVTT

invalid cue
more invalid

00:00:05.000 --> 00:00:08.000
Valid cue`;

      const { segments, errors: _errors } = parseVTT(content, { lenient: true });

      expect(segments).toHaveLength(1);
      expect(segments[0].text).toBe('Valid cue');
    });
  });

  describe('encoding handling', () => {
    it('should handle UTF-8 characters', () => {
      const content = `WEBVTT

00:00:01.000 --> 00:00:04.000
Éléphant français naïve`;

      const { segments, errors } = parseVTT(content);

      expect(errors).toHaveLength(0);
      expect(segments[0].text).toBe('Éléphant français naïve');
    });
  });

  describe('edge cases', () => {
    it('should handle WEBVTT only', () => {
      const { segments, errors } = parseVTT('WEBVTT');

      expect(segments).toHaveLength(0);
      expect(errors).toHaveLength(0);
    });

    it('should handle empty file', () => {
      const { segments, errors } = parseVTT('');

      expect(segments).toHaveLength(0);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should handle text-only cue identifiers', () => {
      const content = `WEBVTT

intro
00:00:01.000 --> 00:00:04.000
Hello world`;

      const { segments, errors } = parseVTT(content);

      expect(errors).toHaveLength(0);
      expect(segments).toHaveLength(1);
    });
  });
});
