import { GENERATED_CITIES } from "./cities-generated";
import { GENERATED_STATES } from "./states-generated";

// A curated set of continents, countries, and phrase-name aliases
// ("new zealand", "uae", "usa") a gazetteer wouldn't have on its own, plus
// generated lists of thousands more cities and country subdivisions --
// states, provinces, regions -- (see scripts/generate-places.mjs) --
// together wide enough that a stranger playing cold can find one for
// almost any letter.
const CURATED_PLACES = [
    // continents
    "africa", "antarctica", "asia", "europe", "oceania",
    "north america", "south america",

    // countries (plus common alternate/phrase names)
    "afghanistan", "albania", "algeria", "andorra", "angola", "antigua",
    "argentina", "armenia", "australia", "austria", "azerbaijan",
    "bahamas", "bahrain", "bangladesh", "barbados", "belarus", "belgium",
    "belize", "benin", "bhutan", "bolivia", "bosnia", "botswana", "brazil",
    "brunei", "bulgaria", "burkina faso", "burundi",
    "cambodia", "cameroon", "canada", "cape verde", "chad", "chile", "china",
    "colombia", "comoros", "congo", "costa rica", "croatia", "cuba",
    "cyprus", "czechia", "czech republic",
    "denmark", "djibouti", "dominica", "dominican republic",
    "ecuador", "egypt", "el salvador", "england", "eritrea", "estonia",
    "eswatini", "ethiopia",
    "fiji", "finland", "france",
    "gabon", "gambia", "georgia", "germany", "ghana", "greece", "grenada",
    "guatemala", "guinea", "guyana",
    "haiti", "honduras", "hungary",
    "iceland", "india", "indonesia", "iran", "iraq", "ireland", "israel",
    "italy", "ivory coast",
    "jamaica", "japan", "jordan",
    "kazakhstan", "kenya", "kiribati", "kuwait", "kyrgyzstan",
    "laos", "latvia", "lebanon", "lesotho", "liberia", "libya",
    "liechtenstein", "lithuania", "luxembourg",
    "madagascar", "malawi", "malaysia", "maldives", "mali", "malta",
    "marshall islands", "mexico", "moldova", "monaco", "mongolia",
    "montenegro", "morocco", "mozambique", "myanmar",
    "namibia", "nauru", "nepal", "netherlands", "new zealand", "nicaragua",
    "niger", "nigeria", "north korea", "north macedonia", "norway",
    "oman",
    "pakistan", "palau", "panama", "papua new guinea", "paraguay", "peru",
    "philippines", "poland", "portugal",
    "qatar",
    "romania", "russia", "rwanda",
    "samoa", "san marino", "sao tome", "saudi arabia", "scotland",
    "senegal", "serbia", "seychelles", "singapore", "slovakia", "slovenia",
    "solomon islands", "somalia", "south africa", "south korea",
    "spain", "sri lanka", "sudan", "suriname", "sweden", "switzerland",
    "syria",
    "taiwan", "tajikistan", "tanzania", "thailand", "togo", "tonga",
    "trinidad", "tobago", "tunisia", "turkey", "turkmenistan", "tuvalu",
    "uganda", "ukraine", "united arab emirates", "uae", "united kingdom",
    "uk", "united states", "usa", "uruguay", "uzbekistan",
    "vanuatu", "vatican", "venezuela", "vietnam",
    "wales",
    "yemen",
    "zambia", "zimbabwe",

    // well-known states/regions the generated subdivision list either
    // doesn't have (a historical or cross-border region, not a formal
    // administrative unit) or only has under its native-language spelling
    "bavaria", "tibet", "wallonia", "flanders", "catalonia", "tuscany",
    "andalusia", "siberia", "patagonia", "normandy", "provence",
    "transylvania",

    // cities not otherwise covered by the generated list below, or listed
    // here under an alternate name/spelling a player might type -- the
    // generated list uses GeoNames' own-language spelling, so common
    // English exonyms ("cologne" for Köln) need an explicit alias here
    "abu dhabi", "abuja", "accra", "addis ababa", "adelaide", "algiers",
    "amman", "amsterdam", "ankara", "athens", "auckland",
    "baghdad", "bangalore", "bangkok", "barcelona", "beirut", "beijing",
    "belfast", "berlin", "birmingham", "bogota", "boston", "brasilia",
    "brisbane", "brussels", "budapest", "buenos aires", "busan",
    "cairo", "calgary", "canberra", "cape town", "capetown", "caracas",
    "casablanca", "chennai", "chicago", "cologne", "colombo", "copenhagen",
    "damascus", "dakar", "delhi", "denver", "dhaka", "doha", "dubai",
    "dublin",
    "edinburgh",
    "florence", "frankfurt",
    "geneva", "glasgow", "guangzhou",
    "hanoi", "harare", "havana", "helsinki", "hollywood", "hong kong",
    "houston", "hyderabad",
    "islamabad", "istanbul",
    "jakarta", "jeddah", "johannesburg",
    "kampala", "karachi", "kathmandu", "khartoum", "kigali", "kolkata",
    "kyoto",
    "lagos", "lahore", "lima", "lisbon", "liverpool", "london",
    "los angeles", "lusaka", "lyon",
    "madrid", "manchester", "manila", "marrakech", "melbourne", "miami", "milan",
    "montevideo", "montreal", "moscow", "mumbai", "munich",
    "nagoya", "nairobi", "naples", "new york",
    "osaka", "oslo", "ottawa",
    "paris", "perth", "phnom penh", "prague", "pune",
    "quebec", "quito",
    "reykjavik", "riyadh", "rio de janeiro", "rome",
    "santiago", "seoul", "shanghai", "shenzhen", "singapore city",
    "stockholm", "sydney",
    "taipei", "tehran", "tel aviv", "tokyo", "toronto", "tunis",
    "vancouver", "venice", "vienna",
    "warsaw", "washington", "wuhan",
    "xiamen", "xian",
    "yangon", "yokohama", "york",
    "zurich",
  ].map((place) => place.toLowerCase());

const CURATED_PLACES_SET = new Set(CURATED_PLACES);
const PLACES = new Set([...CURATED_PLACES, ...GENERATED_CITIES, ...GENERATED_STATES]);

// A narrower check than isKnownPlace, for callers that need to know whether
// a word is an *obvious* place -- a country, or a city/region famous enough
// to be hand-curated -- rather than any of the thousands of small cities
// and subdivisions in the generated lists. Those generated entries collide
// with ordinary English words often enough ("van" is a city in Turkey,
// "bath" is a city in England) that treating every one of them as "this
// can't also be a thing" would wrongly block the common-word reading. Only
// the curated list is a strong enough signal for that.
export function isObviousPlace(word: string): boolean {
  return CURATED_PLACES_SET.has(stripDiacritics(word.trim().toLowerCase()));
}

// Diacritics stripped so a plain-ASCII guess ("koln") matches an accented
// source name ("Köln") -- generate-places.mjs strips them the same way when
// building GENERATED_CITIES.
function stripDiacritics(word: string): string {
  return word.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function isKnownPlace(word: string): boolean {
  return PLACES.has(stripDiacritics(word.trim().toLowerCase()));
}
