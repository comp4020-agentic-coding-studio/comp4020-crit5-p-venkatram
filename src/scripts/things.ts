// Concrete, nameable objects, classified from Princeton WordNet's noun
// categories for artifacts, natural objects, food, plants, body parts,
// materials, and shapes (see scripts/generate-word-categories.mjs) --
// deliberately excludes people, places, and abstract concepts, so a "thing"
// answer has to name an object rather than any dictionary word.
import { GENERATED_THINGS } from "./things-generated";

const THINGS = new Set(GENERATED_THINGS);

export function isKnownThing(word: string): boolean {
  return THINGS.has(word.trim().toLowerCase());
}
