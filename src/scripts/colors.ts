// A color name ("Yellow") passes a general dictionary check same as any
// other word, but it isn't an object — so "thing" needs this curated
// exclusion list the same way it excludes recognised places.
const COLORS = new Set(
  [
    "red", "orange", "yellow", "green", "blue", "indigo", "violet",
    "purple", "pink", "magenta", "cyan", "turquoise", "teal", "navy",
    "black", "white", "gray", "grey", "brown", "tan", "beige", "cream",
    "ivory", "gold", "silver", "bronze", "copper", "maroon", "crimson",
    "scarlet", "burgundy", "coral", "salmon", "peach", "amber", "khaki",
    "olive", "lime", "mint", "emerald", "jade", "azure", "cobalt",
    "sapphire", "lavender", "lilac", "mauve", "plum", "rust", "charcoal",
    "slate", "chartreuse", "vermilion", "ochre", "sepia", "taupe",
  ].map((color) => color.toLowerCase()),
);

export function isColor(word: string): boolean {
  return COLORS.has(word.trim().toLowerCase());
}
