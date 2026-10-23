import type { Sentence, Reading, Mark } from "../types";
export type Toc = { id: string; label: string; href: string; depth: number };
export type SearchHit = { cfi?: string; page?: number; excerpt: string };
export interface ReaderHandle {
  next(): void | Promise<void>;
  previous(): void | Promise<void>;
  seek(progress: number): Promise<void>;
  navigate(target: {
    cfi?: string;
    href?: string;
    page?: number;
  }): Promise<void>;
  current(): Promise<Sentence | null>;
  sentences(spine: number): Promise<Sentence[]>;
  advance(sentence: Sentence, direction: number): Promise<Sentence | null>;
  follow(sentence: Sentence): Promise<void>;
  clearSpeech(): void;
  search(query: string, cancelled: () => boolean): Promise<SearchHit[]>;
}
export type ReaderProps = {
  bookId: string;
  bytes: Uint8Array;
  initial: Reading;
  appleCfi?: string;
  settings: import("../types").ReadSettings;
  marks: Mark[];
  onLocation(
    location: Reading & { label?: string },
    userInitiated?: boolean,
  ): void;
  onToc(items: Toc[]): void;
  onReady(): void;
  onError(error: string): void;
  onSelection(value: { cfi: string; text: string } | null): void;
  onArrow(direction: number): void;
  onShortcut?(key: "play" | "escape" | "find"): void;
};
