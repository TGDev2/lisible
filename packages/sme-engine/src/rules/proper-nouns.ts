import type { Segment, ProperNounCheckResult, DetectedProperNoun } from '../types';

/**
 * Whitelist of common words that should not trigger alerts.
 * Includes:
 * - Country names commonly used in French context
 * - Common acronyms
 * - Product names with special casing
 */
const WHITELIST: Set<string> = new Set([
  // Countries / Geographic
  'France',
  'Paris',
  'Europe',
  'Allemagne',
  'Espagne',
  'Italie',
  'Belgique',
  'Suisse',
  'Canada',
  'Québec',
  'États-Unis',
  'Royaume-Uni',
  // Common acronyms (often written with capitals)
  'API',
  'HTML',
  'CSS',
  'HTTP',
  'HTTPS',
  'URL',
  'JSON',
  'XML',
  'PDF',
  'SQL',
  'USB',
  'GPS',
  'SMS',
  'TV',
  'OK',
  'CEO',
  'CTO',
  'CFO',
  'PME',
  'TPE',
  'RGPD',
  'CNIL',
  'INSEE',
  'SMIC',
  'TVA',
  'HT',
  'TTC',
  // Product names with specific casing
  'iPhone',
  'iPad',
  'iOS',
  'macOS',
  'YouTube',
  'LinkedIn',
  'Facebook',
  'Instagram',
  'WhatsApp',
  'PowerPoint',
  'JavaScript',
  'TypeScript',
]);

/**
 * Regex to match words starting with an uppercase letter.
 * Captures both position and the word itself.
 */
const CAPITALIZED_WORD_REGEX = /[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿA-ZÀ-ÖØ-Þ]*/g;

/**
 * Checks if a position in the text is at the start of a sentence.
 *
 * @param text - The full text
 * @param position - Character position to check
 * @returns true if the position is at the start of a sentence
 */
function isStartOfSentence(text: string, position: number): boolean {
  // Start of text is start of sentence
  if (position === 0) {
    return true;
  }

  // Look at text before this position
  const textBefore = text.substring(0, position);

  // Check if the text before ends with sentence-ending punctuation + space(s)
  // Also handle newlines as sentence boundaries
  const trimmed = textBefore.trimEnd();

  if (trimmed.length === 0) {
    return true;
  }

  const lastChar = trimmed[trimmed.length - 1];

  // Sentence-ending punctuation
  if (lastChar && ['.', '!', '?', '…'].includes(lastChar)) {
    return true;
  }

  // Check for dash/tiret after newline (common in subtitles for dialogue)
  const beforePosition = text.substring(0, position).trimEnd();
  if (beforePosition.endsWith('-') || beforePosition.endsWith('–')) {
    return true;
  }

  // Check for newline (subtitle lines often start new sentences)
  if (position > 0 && text[position - 1] === '\n') {
    return true;
  }

  return false;
}

/**
 * Checks if a word is an acronym (all uppercase, 2+ letters).
 *
 * @param word - The word to check
 * @returns true if the word appears to be an acronym
 */
function isAcronym(word: string): boolean {
  return word.length >= 2 && word === word.toUpperCase();
}

/**
 * Checks if a character is a letter (including accented).
 *
 * @param char - The character to check
 * @returns true if the character is a letter
 */
function isLetter(char: string): boolean {
  return /[a-zA-Zà-öø-ÿÀ-ÖØ-Þ]/.test(char);
}

/**
 * Checks if a position is at the start of a word (not mid-word).
 * This prevents matching "Phone" in "iPhone".
 *
 * @param text - The full text
 * @param position - Character position to check
 * @returns true if the position is at a word boundary
 */
function isWordStart(text: string, position: number): boolean {
  if (position === 0) {
    return true;
  }

  const charBefore = text[position - 1] ?? '';
  return !isLetter(charBefore);
}

/**
 * Checks a segment for potential proper nouns that may need verification.
 *
 * Detects words with capital letters that are not at the beginning of a sentence.
 * These may be:
 * - Person names (Martin, Sophie)
 * - Place names not in whitelist
 * - Organization names
 * - Technical terms
 *
 * Excludes:
 * - Words at the start of sentences (after . ! ? … or newline)
 * - Words in the whitelist (common countries, acronyms, products)
 * - Pure acronyms (all caps like API, HTML)
 *
 * @param segment - The segment to check
 * @returns ProperNounCheckResult with detected proper nouns
 */
export function checkProperNouns(segment: Segment): ProperNounCheckResult {
  const text = segment.text;
  const detectedNouns: DetectedProperNoun[] = [];

  // Find all capitalized words
  let match: RegExpExecArray | null;

  while ((match = CAPITALIZED_WORD_REGEX.exec(text)) !== null) {
    const word = match[0];
    const position = match.index;

    // Skip if not at word boundary (e.g., "Phone" in "iPhone")
    if (!isWordStart(text, position)) {
      continue;
    }

    // Skip if at start of sentence
    if (isStartOfSentence(text, position)) {
      continue;
    }

    // Skip if in whitelist
    if (WHITELIST.has(word)) {
      continue;
    }

    // Skip pure acronyms (all uppercase)
    if (isAcronym(word)) {
      continue;
    }

    // This is a potential proper noun needing verification
    detectedNouns.push({
      word,
      position,
    });
  }

  // Return result
  if (detectedNouns.length === 0) {
    return {
      hasAlert: false,
      detectedNouns: [],
    };
  }

  return {
    hasAlert: true,
    severity: 'info',
    detectedNouns,
  };
}
