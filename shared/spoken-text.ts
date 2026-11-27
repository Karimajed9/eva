const ABBREVIATIONS = new Set([
  "mr",
  "mrs",
  "ms",
  "dr",
  "prof",
  "sr",
  "jr",
  "st",
  "vs",
  "etc",
  "e.g",
  "i.e",
  "u.s",
  "u.k",
]);

export const MAX_SPOKEN_CHARS = 4_000;
export const MAX_SPEECH_SEGMENTS = 80;
export const MAX_SEGMENT_CHARS = 500;

export function spokenText(source: string): string {
  let text = source.replace(/\r\n/g, "\n");
  text = text.replace(/```[\w-]*\n?[\s\S]*?```/g, " code block omitted. ");
  text = text.replace(/`[^`\n]{1,80}`/g, (token) => ` ${token.slice(1, -1)} `);
  text = text.replace(/`[^`]*`/g, " code omitted. ");
  text = text.replace(/\[([^\]]+)\]\((?:https?:\/\/|mailto:)[^)\s]+\)/gi, " $1 ");
  text = text.replace(/https?:\/\/\S+/gi, " a link ");
  text = text.replace(/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/gm, " ");
  text = text.replace(/\|/g, ", ");
  text = text.replace(/^#{1,6}\s+/gm, "");
  text = text.replace(/^\s*>\s?/gm, "");
  text = text.replace(/^\s*[-*+]\s+/gm, "");
  text = text.replace(/^\s*(\d+)[.)]\s+/gm, "$1, ");
  text = text.replace(/[*_~]+/g, "");
  text = text.replace(/[ \t]+\n/g, "\n");
  text = text.replace(/\n{2,}/g, ". ");
  text = text.replace(/\n/g, " ");
  text = text.replace(/\s{2,}/g, " ").trim();
  if (text.length > MAX_SPOKEN_CHARS) {
    return text.slice(0, MAX_SPOKEN_CHARS).trim();
  }
  return text;
}

export function speakableSegments(source: string): string[] {
  const spoken = spokenText(source);
  if (spoken.length === 0) {
    return [];
  }
  const parts: string[] = [];
  let start = 0;
  for (let index = 0; index < spoken.length; index += 1) {
    const mark = spoken[index];
    if ((mark === "." || mark === "!" || mark === "?") && boundary(spoken, index)) {
      while (index + 1 < spoken.length && spoken[index + 1] === ".") {
        index += 1;
      }
      const piece = spoken.slice(start, index + 1).trim();
      if (piece.length > 0) {
        parts.push(piece);
      }
      start = index + 1;
    }
  }
  const tail = spoken.slice(start).trim();
  if (tail.length > 0) {
    parts.push(tail);
  }
  return boundSegments(mergeShort(parts.flatMap(splitLong)));
}

function boundary(text: string, index: number): boolean {
  const mark = text[index];
  if (mark === "." && digit(text[index - 1]) && digit(text[index + 1])) {
    return false;
  }
  const next = text[index + 1];
  if (next !== undefined && !/\s/u.test(next) && next !== "." && next !== "\"" && next !== "'") {
    return false;
  }
  if (mark === "." && abbreviation(text, index)) {
    return false;
  }
  return true;
}

function abbreviation(text: string, dotIndex: number): boolean {
  let start = dotIndex - 1;
  while (start >= 0 && /[A-Za-z.]/u.test(text[start] ?? "")) {
    start -= 1;
  }
  return ABBREVIATIONS.has(text.slice(start + 1, dotIndex).toLowerCase());
}

function digit(value: string | undefined): boolean {
  return value !== undefined && value >= "0" && value <= "9";
}

function splitLong(part: string): string[] {
  if (part.length <= MAX_SEGMENT_CHARS) {
    return [part];
  }
  const pieces: string[] = [];
  let rest = part;
  while (rest.length > MAX_SEGMENT_CHARS) {
    const window = rest.slice(0, MAX_SEGMENT_CHARS);
    const comma = window.lastIndexOf(", ");
    const space = window.lastIndexOf(" ");
    const cut = comma > 80 ? comma + 1 : space > 80 ? space : MAX_SEGMENT_CHARS;
    pieces.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest.length > 0) {
    pieces.push(rest);
  }
  return pieces;
}

function mergeShort(parts: string[]): string[] {
  const merged: string[] = [];
  for (const part of parts) {
    const last = merged.at(-1);
    if (last && (last.length < 40 || part.length < 40) && last.length + 1 + part.length <= MAX_SEGMENT_CHARS) {
      merged[merged.length - 1] = `${last} ${part}`;
      continue;
    }
    merged.push(part);
  }
  return merged;
}

function boundSegments(parts: string[]): string[] {
  const bounded = parts.filter((part) => part.length > 0);
  while (bounded.length > MAX_SPEECH_SEGMENTS) {
    const last = bounded.at(-1) ?? "";
    const previous = bounded.at(-2) ?? "";
    if (previous.length + 1 + last.length > MAX_SEGMENT_CHARS) {
      break;
    }
    bounded.pop();
    bounded.pop();
    bounded.push(`${previous} ${last}`.trim());
  }
  return bounded
    .slice(0, MAX_SPEECH_SEGMENTS)
    .map((part) => (part.length > MAX_SEGMENT_CHARS ? part.slice(0, MAX_SEGMENT_CHARS).trim() : part))
    .filter((part) => part.length > 0);
}
