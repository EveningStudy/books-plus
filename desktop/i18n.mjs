import english from "./locales/en.json" with { type: "json" };

export function translate(language, key, values = []) {
  const text = language === "en" ? (english[key] ?? key) : key;
  return text.replace(/\{(\d+)\}/g, (token, index) =>
    index < values.length ? String(values[index] ?? "") : token,
  );
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function pattern(text) {
  const slots = [];
  let expression = "",
    end = 0;
  for (const match of text.matchAll(/\{(\d+)\}/g)) {
    expression += escape(text.slice(end, match.index)) + "([\\s\\S]*?)";
    slots.push(Number(match[1]));
    end = match.index + match[0].length;
  }
  expression += escape(text.slice(end));
  return { regex: new RegExp("^" + expression + "$"), slots };
}
// Service messages remain canonical in storage. Translate them at the UI boundary,
// including messages created before the language was switched. Never use on books.
const messages = Object.entries(english)
  .filter(
    ([key]) =>
      key.includes("{0}") && key.replace(/\{\d+\}/g, "").trim().length >= 4,
  )
  .sort(([a], [b]) => b.length - a.length)
  .map(([key, value]) => ({
    key,
    value,
    zh: pattern(key),
    en: pattern(value),
  }));
const reverse = new Map(
  Object.entries(english).map(([key, value]) => [value, key]),
);
export function translateMessage(language, message, depth = 0) {
  if (typeof message !== "string" || !message || depth > 4)
    return message ?? "";
  // Electron wraps rejected IPC calls. Present the underlying user-facing error.
  const failure =
    /^(?:Error: )?Error invoking remote method '[^']+': (?:Error: )?([\s\S]+)$/.exec(
      message,
    );
  if (failure) return translateMessage(language, failure[1], depth + 1);
  if (message.startsWith("Error: "))
    return translateMessage(language, message.slice(7), depth + 1);
  if (Object.hasOwn(english, message)) return translate(language, message);
  if (reverse.has(message)) return translate(language, reverse.get(message));
  for (const entry of messages) {
    for (const candidate of [entry.zh, entry.en]) {
      const match = candidate.regex.exec(message);
      if (!match) continue;
      const values = [];
      candidate.slots.forEach((index, i) => {
        values[index] = translateMessage(language, match[i + 1], depth + 1);
      });
      return translate(language, entry.key, values);
    }
  }
  return message;
}
