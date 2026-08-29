// A curated set of real animals, birds, and insects — "animal" accepts all
// three per the brief, but still has to name an actual creature, the same
// way "place" has to name an actual geographic place.
const ANIMALS = new Set(
  [
    "aardvark", "albatross", "alligator", "ant", "anteater", "antelope",
    "ape",
    "baboon", "badger", "bat", "bear", "bee", "beetle", "bison", "boar",
    "buffalo", "butterfly",
    "camel", "caterpillar", "cat", "cheetah", "chicken", "chimpanzee",
    "cobra", "cockroach", "coyote", "crab", "cricket", "crocodile", "crow",
    "deer", "dingo", "dog", "dolphin", "donkey", "dove", "dragonfly",
    "duck",
    "eagle", "earthworm", "eel", "elephant", "emu",
    "falcon", "ferret", "finch", "firefly", "flamingo", "fly", "fox",
    "frog",
    "gazelle", "gecko", "gerbil", "gibbon", "giraffe", "goat", "goose",
    "gorilla", "grasshopper", "gull",
    "hamster", "hare", "hawk", "hedgehog", "heron", "hippopotamus",
    "hornet", "horse", "hummingbird", "hyena",
    "ibex", "ibis", "iguana", "impala",
    "jackal", "jaguar", "jellyfish",
    "kangaroo", "kingfisher", "kiwi", "koala", "komodo dragon",
    "ladybug", "lark", "lemur", "leopard", "lion", "lizard", "llama",
    "lobster", "locust", "lynx",
    "macaque", "macaw", "magpie", "mantis", "meerkat", "mole", "mongoose",
    "monkey", "moose", "mosquito", "moth", "mouse", "mule",
    "newt", "nightingale",
    "octopus", "orangutan", "orca", "ostrich", "otter", "owl", "ox",
    "panda", "panther", "parrot", "peacock", "pelican", "penguin",
    "pig", "pigeon", "platypus", "porcupine", "possum", "prawn", "puma",
    "python",
    "quail", "quokka",
    "rabbit", "raccoon", "rat", "raven", "rhinoceros", "robin", "rooster",
    "salamander", "salmon", "scorpion", "seagull", "seahorse", "seal",
    "shark", "sheep", "shrimp", "skunk", "sloth", "snail", "snake",
    "sparrow", "spider", "squid", "squirrel", "starfish", "stork", "swan",
    "termite", "tiger", "toad", "tortoise", "toucan", "turkey", "turtle",
    "uakari", "urial",
    "vole", "vulture",
    "wallaby", "walrus", "wasp", "weasel", "whale", "wolf", "wolverine",
    "wombat", "woodpecker", "worm",
    "xerus",
    "yak",
    "zebra", "zebu",
  ].map((animal) => animal.toLowerCase()),
);

export function isKnownAnimal(word: string): boolean {
  return ANIMALS.has(word.trim().toLowerCase());
}
