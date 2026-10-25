export function translate(
  language: "zh" | "en",
  key: string,
  values?: readonly unknown[],
): string;
export function translateMessage(
  language: "zh" | "en",
  message: string,
  depth?: number,
): string;
