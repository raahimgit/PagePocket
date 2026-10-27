export const SCHEMA_VERSION = 1;

export type ItemType = "page" | "excerpt" | "code" | "heading" | "link" | "screenshot";

export interface SourceRef {
  url: string;
  canonicalUrl?: string;
  pageTitle: string;
}

export interface Item {
  id: string;
  type: ItemType;
  source: SourceRef;
  content: string;
  capturedAt: string;
  tags: string[];
  collectionIds: string[];
  language?: string;
  headingContext?: string;
  // Link destination for `link` items, deep-link anchor for `heading` items.
  targetUrl?: string;
}

export type NoteTarget =
  | { kind: "item"; id: string }
  | { kind: "collection"; id: string };

export interface Note {
  id: string;
  target: NoteTarget;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExportBundle {
  schemaVersion: number;
  exportedAt: string;
  items: Item[];
  notes: Note[];
  collections: Collection[];
}

export interface PageMetadata {
  canonicalUrl?: string;
  description?: string;
  author?: string;
  publishedAt?: string;
  siteName?: string;
  language?: string;
}

export interface HeadingRef {
  level: number;
  text: string;
  id?: string;
  url?: string;
}

export interface CodeBlock {
  content: string;
  language?: string;
  headingContext?: string;
  truncated?: boolean;
}

export interface LinkRef {
  url: string;
  text: string;
}

export interface SelectionCapture {
  text: string;
  headingContext?: string;
}

export interface PageCapture {
  source: SourceRef;
  metadata: PageMetadata;
  headings: HeadingRef[];
  links: LinkRef[];
  codeBlocks: CodeBlock[];
  selection: SelectionCapture | null;
  warnings: string[];
}

export interface ScreenshotCapture {
  source: SourceRef;
  dataUrl: string;
  /** Viewport-relative crop, when a browser-supported region capture is used. */
  bounds?: { x: number; y: number; width: number; height: number };
  warnings: string[];
}
