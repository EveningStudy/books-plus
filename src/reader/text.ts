import type Section from "epubjs/types/section";
import type { Sentence } from "../types";
export function splitText(
  text: string,
): { text: string; start: number; end: number }[] {
  const result = [];
  const segmenter = new Intl.Segmenter(undefined, { granularity: "sentence" });
  for (const paragraph of text.matchAll(/[^\r\n]+/g)) {
    for (const part of segmenter.segment(paragraph[0])) {
      const trimmed = part.segment.trim();
      if (!/[\p{L}\p{N}]/u.test(trimmed)) continue;
      const base =
        paragraph.index! + part.index + part.segment.indexOf(trimmed);
      // Keep original UTF-16 offsets for EPUB CFI and native word boundaries.
      for (let start = 0; start < trimmed.length;) {
        let end = Math.min(start + 180, trimmed.length);
        if (end < trimmed.length) {
          const separator = Math.max(
            trimmed.lastIndexOf(" ", end),
            trimmed.lastIndexOf("，", end),
            trimmed.lastIndexOf("、", end),
          );
          if (separator > start + 80)
            end = separator + (trimmed[separator] === " " ? 0 : 1);
          if (/[\uD800-\uDBFF]/.test(trimmed[end - 1])) end--;
        }
        const raw = trimmed.slice(start, end);
        const value = raw.trim();
        if (value) {
          const offset = base + start + raw.indexOf(value);
          result.push({
            text: value,
            start: offset,
            end: offset + value.length,
          });
        }
        start = end;
        while (trimmed[start] === " ") start++;
      }
    }
  }
  return result;
}
export function sectionSentences(section: Section): Sentence[] {
  const doc = section.document;
  if (!doc?.body) return [];
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const groups: {
    block: Element;
    nodes: { node: Text; offset: number }[];
    text: string;
  }[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (
      node.parentElement?.closest(
        'script,style,nav,rt,rp,[hidden],[aria-hidden="true"]',
      )
    )
      continue;
    const block =
      node.parentElement?.closest("p,h1,h2,h3,h4,h5,h6,li,blockquote,div") ||
      doc.body;
    let group = groups[groups.length - 1];
    if (!group || group.block !== block) {
      group = { block, nodes: [], text: "" };
      groups.push(group);
    }
    group.nodes.push({ node, offset: group.text.length });
    group.text += node.textContent || "";
  }
  const sentences: Sentence[] = [];
  for (const group of groups)
    for (const part of splitText(group.text)) {
      const start = [...group.nodes]
        .reverse()
        .find((n) => n.offset <= part.start);
      const end = group.nodes.find((n) => n.offset + n.node.length >= part.end);
      if (!start || !end) continue;
      const range = doc.createRange();
      range.setStart(start.node, part.start - start.offset);
      range.setEnd(end.node, part.end - end.offset);
      try {
        sentences.push({
          text: part.text,
          cfi: section.cfiFromRange(range),
          href: section.href,
          spine: section.index,
          index: sentences.length,
        });
      } catch {}
    }
  return sentences;
}
