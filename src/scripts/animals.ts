// Real animals, birds, and insects, classified from Princeton WordNet's
// noun.animal category (see scripts/generate-word-categories.mjs) --
// "animal" accepts all three per the brief, but still has to name an actual
// creature, the same way "place" has to name an actual geographic place.
import { GENERATED_ANIMALS } from "./animals-generated";

const ANIMALS = new Set(GENERATED_ANIMALS);

export function isKnownAnimal(word: string): boolean {
  return ANIMALS.has(word.trim().toLowerCase());
}
