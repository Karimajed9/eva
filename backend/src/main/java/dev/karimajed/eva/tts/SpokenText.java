package dev.karimajed.eva.tts;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

public final class SpokenText {

    public static final int MAX_CHARS = 4_000;
    public static final int MAX_SEGMENTS = 16;
    public static final int MAX_SEGMENT = 500;
    private static final Set<String> ABBREVIATIONS = Set.of(
            "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "vs", "etc", "e.g", "i.e", "u.s", "u.k");
    private static final Pattern CODE = Pattern.compile("```[\\w-]*\\n?[\\s\\S]*?```");
    private static final Pattern INLINE = Pattern.compile("`([^`\\n]{1,80})`");
    private static final Pattern LONG_CODE = Pattern.compile("`[^`]*`");
    private static final Pattern LINK = Pattern.compile("\\[([^\\]]+)\\]\\((?:https?://|mailto:)[^)\\s]+\\)", Pattern.CASE_INSENSITIVE);
    private static final Pattern URL = Pattern.compile("https?://\\S+", Pattern.CASE_INSENSITIVE);
    private static final Pattern TABLE_RULE = Pattern.compile("(?m)^\\|?\\s*:?-{3,}:?\\s*(\\|\\s*:?-{3,}:?\\s*)+\\|?\\s*$");
    private static final Pattern HEADING = Pattern.compile("(?m)^#{1,6}\\s+");
    private static final Pattern QUOTE = Pattern.compile("(?m)^\\s*>\\s?");
    private static final Pattern BULLET = Pattern.compile("(?m)^\\s*[-*+]\\s+");
    private static final Pattern NUMBER = Pattern.compile("(?m)^\\s*(\\d+)[.)]\\s+");
    private static final Pattern MARKERS = Pattern.compile("[*_~]+");

    private SpokenText() {
    }

    public static String normalize(String source) {
        if (source == null) {
            return "";
        }
        String text = source.replace("\r\n", "\n");
        text = CODE.matcher(text).replaceAll(" code block omitted. ");
        text = INLINE.matcher(text).replaceAll(" $1 ");
        text = LONG_CODE.matcher(text).replaceAll(" code omitted. ");
        text = LINK.matcher(text).replaceAll(" $1 ");
        text = URL.matcher(text).replaceAll(" a link ");
        text = TABLE_RULE.matcher(text).replaceAll(" ");
        text = text.replace("|", ", ");
        text = HEADING.matcher(text).replaceAll("");
        text = QUOTE.matcher(text).replaceAll("");
        text = BULLET.matcher(text).replaceAll("");
        text = NUMBER.matcher(text).replaceAll("$1, ");
        text = MARKERS.matcher(text).replaceAll("");
        text = text.replaceAll("[ \\t]+\\n", "\n");
        text = text.replaceAll("\\n{2,}", ". ");
        text = text.replace('\n', ' ');
        text = text.replaceAll("\\s{2,}", " ").trim();
        if (text.length() > MAX_CHARS) {
            return text.substring(0, MAX_CHARS).trim();
        }
        return text;
    }

    public static List<String> segments(String source) {
        String spoken = normalize(source);
        if (spoken.isEmpty()) {
            return List.of();
        }
        List<String> parts = new ArrayList<>();
        int start = 0;
        for (int index = 0; index < spoken.length(); index += 1) {
            char mark = spoken.charAt(index);
            if ((mark == '.' || mark == '!' || mark == '?') && boundary(spoken, index)) {
                while (index + 1 < spoken.length() && spoken.charAt(index + 1) == '.') {
                    index += 1;
                }
                String piece = spoken.substring(start, index + 1).trim();
                if (!piece.isEmpty()) {
                    parts.add(piece);
                }
                start = index + 1;
            }
        }
        String tail = spoken.substring(start).trim();
        if (!tail.isEmpty()) {
            parts.add(tail);
        }
        List<String> split = new ArrayList<>();
        for (String part : parts) {
            split.addAll(splitLong(part));
        }
        return bound(mergeShort(split));
    }

    private static boolean boundary(String text, int index) {
        char mark = text.charAt(index);
        if (mark == '.' && digit(text, index - 1) && digit(text, index + 1)) {
            return false;
        }
        if (index + 1 < text.length()) {
            char next = text.charAt(index + 1);
            if (!Character.isWhitespace(next) && next != '.' && next != '"' && next != '\'') {
                return false;
            }
        }
        return mark != '.' || !abbreviation(text, index);
    }

    private static boolean abbreviation(String text, int dotIndex) {
        int start = dotIndex - 1;
        while (start >= 0) {
            char current = text.charAt(start);
            if (!Character.isLetter(current) && current != '.') {
                break;
            }
            start -= 1;
        }
        return ABBREVIATIONS.contains(text.substring(start + 1, dotIndex).toLowerCase(Locale.ROOT));
    }

    private static boolean digit(String text, int index) {
        return index >= 0 && index < text.length() && Character.isDigit(text.charAt(index));
    }

    private static List<String> splitLong(String part) {
        List<String> pieces = new ArrayList<>();
        String rest = part;
        while (rest.length() > MAX_SEGMENT) {
            String window = rest.substring(0, MAX_SEGMENT);
            int comma = window.lastIndexOf(", ");
            int space = window.lastIndexOf(' ');
            int cut = comma > 80 ? comma + 1 : space > 80 ? space : MAX_SEGMENT;
            pieces.add(rest.substring(0, cut).trim());
            rest = rest.substring(cut).trim();
        }
        if (!rest.isEmpty()) {
            pieces.add(rest);
        }
        return pieces;
    }

    private static List<String> mergeShort(List<String> parts) {
        List<String> merged = new ArrayList<>();
        for (String part : parts) {
            if (!merged.isEmpty()) {
                String last = merged.get(merged.size() - 1);
                if ((last.length() < 40 || part.length() < 40) && last.length() + 1 + part.length() <= MAX_SEGMENT) {
                    merged.set(merged.size() - 1, last + " " + part);
                    continue;
                }
            }
            merged.add(part);
        }
        return merged;
    }

    private static List<String> bound(List<String> parts) {
        List<String> bounded = new ArrayList<>();
        for (String part : parts) {
            if (!part.isEmpty()) {
                bounded.add(part);
            }
        }
        while (bounded.size() > MAX_SEGMENTS) {
            String last = bounded.remove(bounded.size() - 1);
            String previous = bounded.remove(bounded.size() - 1);
            bounded.add((previous + " " + last).trim());
        }
        return List.copyOf(bounded);
    }
}
