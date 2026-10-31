// Numbers the presenter actually said. Halo may put a number on screen when it
// comes from loaded data or from the presenter's own words; this module finds
// the numbers in speech so every spoken value can be checked against it.

export type SpokenUnit = "number" | "percent" | "currency";

export interface SpokenNumber {
  value: number;
  unit: SpokenUnit;
  currency: string | null;
  /** Character span in the text it was found in. */
  start: number;
  end: number;
}

const SMALL: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const SCALE: Record<string, number> = {
  k: 1e3, thousand: 1e3, m: 1e6, mm: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9, trillion: 1e12, lakh: 1e5, lakhs: 1e5, crore: 1e7, crores: 1e7,
};
const SYMBOLS: Record<string, string> = { $: "$", "€": "€", "£": "£", "₹": "₹", "¥": "¥" };
const CURRENCY_WORDS: Record<string, string> = {
  dollar: "$", dollars: "$", usd: "$", bucks: "$", euro: "€", euros: "€", eur: "€", pound: "£", pounds: "£", gbp: "£",
  rupee: "₹", rupees: "₹", inr: "₹", rs: "Rs", pkr: "Rs", yen: "¥",
};

interface Token {
  text: string;
  lower: string;
  start: number;
  end: number;
}

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  const re = /[$€£₹¥]|\d[\d,]*(?:\.\d+)?|[A-Za-z]+|%/g;
  for (const m of text.matchAll(re)) {
    out.push({ text: m[0], lower: m[0].toLowerCase(), start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  }
  return out;
}

/** Finds every number in speech: "$100,000", "200k", "1.5 million", "44%", "two hundred thousand dollars". */
export function spokenNumbers(text: string): SpokenNumber[] {
  const t = tokenize(text);
  const out: SpokenNumber[] = [];
  let i = 0;
  while (i < t.length) {
    const startTok = i;
    let currency: string | null = null;
    if (SYMBOLS[t[i].text]) {
      currency = SYMBOLS[t[i].text];
      i++;
    } else if ((t[i].lower === "rs" || t[i].lower === "inr" || t[i].lower === "pkr" || t[i].lower === "usd") && t[i + 1] && /^\d/.test(t[i + 1].text)) {
      currency = CURRENCY_WORDS[t[i].lower];
      i++;
    }
    if (i >= t.length) break;

    let value: number | null = null;
    let j = i;
    if (/^\d/.test(t[j].text)) {
      // "100,000" or "1.5"; a trailing "k"/"m" may be glued on ("200k") or separate ("200 k").
      const glued = text.slice(t[j].end).match(/^([kKmMbB](?:n)?)\b/);
      value = Number(t[j].text.replace(/,/g, ""));
      j++;
      if (glued) {
        value *= SCALE[glued[1].toLowerCase()] ?? 1;
        // The glued suffix is its own token; skip it.
        if (t[j] && t[j].start === t[j - 1].end) j++;
      }
    } else if (t[j].lower === "a" && t[j + 1] && (t[j + 1].lower === "hundred" || SCALE[t[j + 1].lower])) {
      value = 1;
      j++;
    } else if (SMALL[t[j].lower] !== undefined) {
      value = 0;
      let cur = 0;
      while (j < t.length && SMALL[t[j].lower] !== undefined) {
        cur += SMALL[t[j].lower];
        j++;
        if (t[j]?.lower === "and") j++;
      }
      value = cur;
      if (t[j]?.lower !== "hundred" && !SCALE[t[j]?.lower ?? ""] && cur <= 10 && t[j]?.lower !== "percent" && !CURRENCY_WORDS[t[j]?.lower ?? ""]) {
        // A lone small word ("three moves") is an item count, not data.
        i = startTok + 1;
        continue;
      }
    }
    if (value === null) {
      i = startTok + 1;
      continue;
    }
    // Multipliers: "two hundred thousand", "1.5 million", "3 lakh".
    let total = 0;
    for (;;) {
      const w = t[j]?.lower;
      if (w === "hundred") {
        value *= 100;
        j++;
        // "two hundred fifty thousand"
        let tail = 0;
        while (t[j] && SMALL[t[j].lower] !== undefined) {
          tail += SMALL[t[j].lower];
          j++;
        }
        value += tail;
      } else if (w && SCALE[w] && !/^\d/.test(t[j].text)) {
        value *= SCALE[w];
        total += value;
        value = 0;
        j++;
        if (t[j] && SMALL[t[j].lower] !== undefined) {
          let rest = 0;
          while (t[j] && SMALL[t[j].lower] !== undefined) {
            rest += SMALL[t[j].lower];
            j++;
          }
          value = rest;
        }
      } else {
        break;
      }
    }
    total += value;

    let unit: SpokenUnit = currency ? "currency" : "number";
    const after = t[j]?.lower;
    if (after === "%" || after === "percent" || (after === "per" && t[j + 1]?.lower === "cent")) {
      unit = "percent";
      j += after === "per" ? 2 : 1;
    } else if (after && CURRENCY_WORDS[after] && !currency) {
      currency = CURRENCY_WORDS[after];
      unit = "currency";
      j++;
    }
    const end = t[j - 1].end;
    out.push({ value: total, unit, currency, start: t[startTok].start, end });
    i = j;
  }
  return out;
}

/** Whether a value matches one the presenter said (allowing for rounding, e.g. 1.5M vs 1,500,000). */
export function wasSaid(value: number, said: SpokenNumber[]): boolean {
  return said.some((s) => Math.abs(s.value - value) <= Math.max(1e-9, Math.abs(value) * 0.005));
}
