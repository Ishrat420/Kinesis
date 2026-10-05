import { CUSTOM_MODULE_ICONS, type CustomModuleIconName } from "./icons";
import { ICON_KEYWORDS } from "./icon-keywords";
import ICON_TAGS from "./icon-tags.json";

/**
 * The custom-module icon picker's search: type "car" and the icons that fit
 * come to the front. Entirely local -- nothing typed leaves the device.
 *
 * Three sources, most trusted first:
 *   1. The icon's own names: our key ("laundry") and Lucide's
 *      ("washing-machine").
 *   2. Our own words for it (icon-keywords.ts) -- life admin, like "rego".
 *   3. Lucide's tags (icon-tags.json, from scripts/sync-icon-tags.mjs) --
 *      generic synonyms, like "vehicle", but sometimes noisy, so they only
 *      ever count for a little.
 *
 * Each word of the query scores against its best match -- exact, then
 * starts-with (so it works mid-word), then a typo or two, then contained
 * anywhere -- and an icon's score is the sum over the words, so a longer
 * name like "Car maintenance" still finds the car. Nothing is filtered out:
 * matches come first, best first, and every other icon follows in the
 * picker's usual order.
 */
export type IconSearchResult = { key: CustomModuleIconName; matched: boolean };

type Tier = { exact: number; prefix: number; typo: number; contains: number };
const NAME: Tier = { exact: 100, prefix: 75, typo: 40, contains: 30 };
const KEYWORD: Tier = { exact: 80, prefix: 60, typo: 32, contains: 25 };
const TAG: Tier = { exact: 45, prefix: 30, typo: 15, contains: 12 };

/** Words in a module's name that say nothing about what it is. */
const STOP_WORDS = new Set(["my", "the", "and", "of", "for", "to", "in", "on", "a", "an", "our", "with", "list", "tracker", "stuff", "things"]);

type IndexedIcon = { key: CustomModuleIconName; terms: { words: string[]; tier: Tier }[] };

function words(text: string) {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

const INDEX: IndexedIcon[] = (Object.keys(CUSTOM_MODULE_ICONS) as CustomModuleIconName[]).map((key) => {
  const tags = (ICON_TAGS as Record<string, { lucide: string; tags: string[] } | undefined>)[key];
  return {
    key,
    terms: [
      { words: [...words(key), ...words(tags?.lucide ?? "")], tier: NAME },
      { words: ICON_KEYWORDS[key].flatMap(words), tier: KEYWORD },
      { words: (tags?.tags ?? []).flatMap(words), tier: TAG },
    ],
  };
});

/**
 * How many typos a word may carry and still match: one from four letters,
 * two from seven ("vehical" is two away from "vehicle"). Shorter words get
 * none -- at that length one wrong letter is usually a different word.
 */
function allowedEdits(token: string) {
  return token.length >= 7 ? 2 : token.length >= 4 ? 1 : 0;
}

/** Edit distance, giving up as soon as it passes `limit`. */
function withinEdits(a: string, b: string, limit: number) {
  if (Math.abs(a.length - b.length) > limit) return false;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowBest = i;
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowBest = Math.min(rowBest, current[j]);
    }
    if (rowBest > limit) return false;
    previous = current;
  }
  return previous[b.length] <= limit;
}

/** "cars" should find "car", and "taxes" "tax": the token as typed, and without a plural ending. */
function variants(token: string) {
  const forms = [token];
  if (token.length >= 4 && token.endsWith("s")) forms.push(token.slice(0, -1));
  if (token.length >= 5 && token.endsWith("es")) forms.push(token.slice(0, -2));
  return forms;
}

function scoreToken(token: string, icon: IndexedIcon) {
  let best = 0;
  for (const { words: terms, tier } of icon.terms) {
    for (const term of terms) {
      let score = 0;
      if (variants(token).includes(term)) score = tier.exact;
      else if (term.startsWith(token)) score = tier.prefix;
      // Only for words starting with the same letter: typos land later in a
      // word, and without this "vehical" was as close to "medical" as to
      // "vehicle". Two typos count for half, and never against Lucide's
      // tags, where they mostly found coincidences ("journal" -> "journey").
      else if (allowedEdits(token) && term.length >= 4 && term[0] === token[0] && withinEdits(token, term, 1)) score = tier.typo;
      else if (allowedEdits(token) === 2 && tier !== TAG && term[0] === token[0] && withinEdits(token, term, 2)) score = tier.typo / 2;
      // From four letters: shorter ones turn up inside unrelated words
      // ("art" in "heart", "car" in "scarf").
      else if (token.length >= 4 && term.includes(token)) score = tier.contains;
      if (score > best) best = score;
    }
  }
  return best;
}

export function searchIcons(query: string): IconSearchResult[] {
  const tokens = words(query).filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
  if (!tokens.length) return INDEX.map(({ key }) => ({ key, matched: false }));

  const scored = INDEX.map((icon, order) => ({
    key: icon.key,
    order,
    score: tokens.reduce((total, token) => total + scoreToken(token, icon), 0),
  }));
  // Best first; ties, and everything unmatched, keep the picker's usual order.
  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  return scored.map(({ key, score }) => ({ key, matched: score > 0 }));
}
