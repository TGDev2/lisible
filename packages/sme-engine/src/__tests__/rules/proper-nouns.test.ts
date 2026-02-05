import { describe, it, expect } from 'vitest';
import { checkProperNouns } from '../../rules/proper-nouns';
import type { Segment } from '../../types';

/**
 * Helper to create a test segment with specific text
 */
function createSegment(text: string): Segment {
  return {
    sequenceNum: 1,
    startMs: 0,
    endMs: 2000,
    text,
  };
}

describe('checkProperNouns', () => {
  describe('detection of proper nouns mid-sentence', () => {
    it('should detect a proper noun in the middle of a sentence', () => {
      const segment = createSegment('Bonjour Martin comment allez-vous');

      const result = checkProperNouns(segment);

      expect(result.hasAlert).toBe(true);
      expect(result.severity).toBe('info');
      expect(result.detectedNouns).toHaveLength(1);
      expect(result.detectedNouns[0]!.word).toBe('Martin');
    });

    it('should detect multiple proper nouns', () => {
      const segment = createSegment('Je travaille avec Sophie et Pierre');

      const result = checkProperNouns(segment);

      expect(result.hasAlert).toBe(true);
      expect(result.severity).toBe('info');
      expect(result.detectedNouns).toHaveLength(2);
      expect(result.detectedNouns[0]!.word).toBe('Sophie');
      expect(result.detectedNouns[1]!.word).toBe('Pierre');
    });

    it('should return position of detected words', () => {
      const segment = createSegment('Bonjour Martin');

      const result = checkProperNouns(segment);

      expect(result.detectedNouns[0]!.position).toBe(8);
    });
  });

  describe('exclusion of sentence beginnings', () => {
    it('should not alert for word at start of text', () => {
      const segment = createSegment('Martin est arrivé');

      const result = checkProperNouns(segment);

      expect(result.hasAlert).toBe(false);
      expect(result.detectedNouns).toHaveLength(0);
    });

    it('should not alert for word after period', () => {
      const segment = createSegment('Il est parti. Martin est arrivé');

      const result = checkProperNouns(segment);

      expect(result.hasAlert).toBe(false);
      expect(result.detectedNouns).toHaveLength(0);
    });

    it('should not alert for word after exclamation mark', () => {
      const segment = createSegment('Incroyable! Sophie a gagné');

      const result = checkProperNouns(segment);

      expect(result.hasAlert).toBe(false);
      expect(result.detectedNouns).toHaveLength(0);
    });

    it('should not alert for word after question mark', () => {
      const segment = createSegment('Vraiment? Pierre a dit ça');

      const result = checkProperNouns(segment);

      expect(result.hasAlert).toBe(false);
      expect(result.detectedNouns).toHaveLength(0);
    });

    it('should not alert for word after newline', () => {
      const segment = createSegment('Première ligne\nMartin parle');

      const result = checkProperNouns(segment);

      expect(result.hasAlert).toBe(false);
      expect(result.detectedNouns).toHaveLength(0);
    });

    it('should not alert for word after dialogue dash', () => {
      const segment = createSegment('- Martin parle');

      const result = checkProperNouns(segment);

      expect(result.hasAlert).toBe(false);
      expect(result.detectedNouns).toHaveLength(0);
    });
  });

  describe('whitelist handling', () => {
    it('should not alert for whitelisted country names', () => {
      const segment = createSegment('Je vis en France depuis longtemps');

      const result = checkProperNouns(segment);

      expect(result.hasAlert).toBe(false);
      expect(result.detectedNouns).toHaveLength(0);
    });

    it('should not alert for whitelisted city names', () => {
      const segment = createSegment('Je travaille à Paris');

      const result = checkProperNouns(segment);

      expect(result.hasAlert).toBe(false);
      expect(result.detectedNouns).toHaveLength(0);
    });

    it('should not alert for whitelisted products like iPhone', () => {
      const segment = createSegment("J'utilise un iPhone");

      const result = checkProperNouns(segment);

      expect(result.hasAlert).toBe(false);
      expect(result.detectedNouns).toHaveLength(0);
    });

    it('should not alert for whitelisted services like YouTube', () => {
      const segment = createSegment('Je regarde YouTube tous les jours');

      const result = checkProperNouns(segment);

      expect(result.hasAlert).toBe(false);
      expect(result.detectedNouns).toHaveLength(0);
    });
  });

  describe('acronym handling', () => {
    it('should not alert for uppercase acronyms like API', () => {
      const segment = createSegment("L'API est disponible");

      const result = checkProperNouns(segment);

      expect(result.hasAlert).toBe(false);
      expect(result.detectedNouns).toHaveLength(0);
    });

    it('should not alert for uppercase acronyms like HTML', () => {
      const segment = createSegment('Le code HTML est valide');

      const result = checkProperNouns(segment);

      expect(result.hasAlert).toBe(false);
      expect(result.detectedNouns).toHaveLength(0);
    });

    it('should not alert for uppercase acronyms like RGPD', () => {
      const segment = createSegment('Conformité au RGPD');

      const result = checkProperNouns(segment);

      expect(result.hasAlert).toBe(false);
      expect(result.detectedNouns).toHaveLength(0);
    });

    it('should not alert for non-whitelisted acronyms (all caps)', () => {
      const segment = createSegment('La NASA a lancé une fusée');

      const result = checkProperNouns(segment);

      expect(result.hasAlert).toBe(false);
      expect(result.detectedNouns).toHaveLength(0);
    });
  });

  describe('no alert cases', () => {
    it('should return no alert for text without proper nouns', () => {
      const segment = createSegment('Bonjour comment allez-vous');

      const result = checkProperNouns(segment);

      expect(result.hasAlert).toBe(false);
      expect(result.detectedNouns).toHaveLength(0);
    });

    it('should return no alert for lowercase text', () => {
      const segment = createSegment('le chat dort sur le canapé');

      const result = checkProperNouns(segment);

      expect(result.hasAlert).toBe(false);
      expect(result.detectedNouns).toHaveLength(0);
    });

    it('should return no alert for empty text', () => {
      const segment = createSegment('');

      const result = checkProperNouns(segment);

      expect(result.hasAlert).toBe(false);
      expect(result.detectedNouns).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('should handle accented capital letters', () => {
      const segment = createSegment('Je connais Élodie');

      const result = checkProperNouns(segment);

      expect(result.hasAlert).toBe(true);
      expect(result.detectedNouns[0]!.word).toBe('Élodie');
    });

    it('should handle mixed case product names like iPhone', () => {
      const segment = createSegment("C'est un iPhone récent");

      const result = checkProperNouns(segment);

      // iPhone is whitelisted
      expect(result.hasAlert).toBe(false);
    });

    it('should detect non-whitelisted PascalCase words', () => {
      const segment = createSegment('Le projet MegaCorp avance bien');

      const result = checkProperNouns(segment);

      expect(result.hasAlert).toBe(true);
      expect(result.detectedNouns[0]!.word).toBe('MegaCorp');
    });

    it('should handle multiple sentences with proper nouns', () => {
      const segment = createSegment('Je connais Martin. Sophie est venue aussi');

      const result = checkProperNouns(segment);

      // Martin is mid-sentence, Sophie is at start of new sentence
      expect(result.hasAlert).toBe(true);
      expect(result.detectedNouns).toHaveLength(1);
      expect(result.detectedNouns[0]!.word).toBe('Martin');
    });
  });

  describe('DoD: "Bonjour Martin" → alerte info sur "Martin"', () => {
    it('should return info alert on "Martin" in "Bonjour Martin"', () => {
      const segment = createSegment('Bonjour Martin');

      const result = checkProperNouns(segment);

      expect(result.hasAlert).toBe(true);
      expect(result.severity).toBe('info');
      expect(result.detectedNouns).toHaveLength(1);
      expect(result.detectedNouns[0]!.word).toBe('Martin');
    });
  });
});
