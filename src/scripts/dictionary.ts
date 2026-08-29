import words from "an-array-of-english-words";

// The standard SCOWL-derived English word list (~275k words) bundled as a
// static asset — the shared "is this actually a word" check for categories
// that need one, checked offline and synchronously so it never costs a
// network round-trip inside a 25-second round.
const WORDS = new Set(words);

export function isDictionaryWord(word: string): boolean {
  return WORDS.has(word.trim().toLowerCase());
}
