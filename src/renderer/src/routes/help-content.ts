import Fuse from 'fuse.js';

export type HelpBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'unordered-list'; items: string[] }
  | { type: 'ordered-list'; items: string[] }
  | { type: 'heading'; depth: 3 | 4; id: string; text: string };

export type HelpSection = {
  id: string;
  searchText: string;
  title: string;
  blocks: HelpBlock[];
};

export type ParsedHelpContent = {
  intro: string[];
  sections: HelpSection[];
  search: Fuse<HelpSection>;
};

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeInlineMarkdown(value: string) {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

function parseHeadingText(value: string) {
  const match = value.match(/^(.*?)\s*\{#([\p{Letter}\p{Number}_-]+)\}\s*$/u);
  const text = normalizeInlineMarkdown(match?.[1] ?? value);
  return {
    id: match?.[2] ?? slugify(text),
    text,
  };
}

function isTableOfContentsHeading(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Mark}\p{Number}]+/gu, '');

  return [
    'tableofcontents',
    'contents',
    'មាតិកា',
    'តារាងមាតិកា',
    'បញ្ជីមាតិកា',
  ].includes(normalized);
}

function blockSearchText(block: HelpBlock) {
  if (block.type === 'paragraph' || block.type === 'heading') {
    return block.text;
  }
  return block.items.join(' ');
}

export function parseHelpContent(markdown: string): ParsedHelpContent {
  const lines = markdown.split(/\r?\n/);
  const intro: string[] = [];
  const sections: HelpSection[] = [];
  let currentSection: HelpSection | null = null;
  let index = 0;
  let collectingIntro = true;

  function readParagraph(startIndex: number) {
    const parts: string[] = [];
    let nextIndex = startIndex;

    while (nextIndex < lines.length) {
      const line = lines[nextIndex]?.trim() ?? '';
      if (line.length === 0 || line.startsWith('#') || line.startsWith('- ') || /^\d+\.\s/.test(line)) {
        break;
      }
      parts.push(normalizeInlineMarkdown(line));
      nextIndex += 1;
    }

    return { nextIndex, text: parts.join(' ') };
  }

  function readList(startIndex: number, ordered: boolean) {
    const items: string[] = [];
    let nextIndex = startIndex;

    while (nextIndex < lines.length) {
      const line = lines[nextIndex]?.trim() ?? '';
      const match = ordered ? line.match(/^\d+\.\s+(.*)$/) : line.match(/^-\s+(.*)$/);
      if (!match) {
        break;
      }
      items.push(normalizeInlineMarkdown(match[1] ?? ''));
      nextIndex += 1;
    }

    return { items, nextIndex };
  }

  while (index < lines.length) {
    const line = lines[index]?.trim() ?? '';

    if (line.length === 0 || line.startsWith('# ')) {
      index += 1;
      continue;
    }

    if (line.startsWith('## ')) {
      const { id, text: title } = parseHeadingText(line.slice(3));
      collectingIntro = false;
      if (!isTableOfContentsHeading(title)) {
        currentSection = { blocks: [], id, searchText: '', title };
        sections.push(currentSection);
      } else {
        currentSection = null;
      }
      index += 1;
      continue;
    }

    if (collectingIntro) {
      const { nextIndex, text } = readParagraph(index);
      if (text.length > 0) {
        intro.push(text);
      }
      index = nextIndex === index ? index + 1 : nextIndex;
      continue;
    }

    if (!currentSection) {
      index += 1;
      continue;
    }

    if (line.startsWith('### ')) {
      const { id, text } = parseHeadingText(line.slice(4));
      currentSection.blocks.push({ depth: 3, id, text, type: 'heading' });
      index += 1;
      continue;
    }

    if (line.startsWith('#### ')) {
      const { id, text } = parseHeadingText(line.slice(5));
      currentSection.blocks.push({ depth: 4, id, text, type: 'heading' });
      index += 1;
      continue;
    }

    if (line.startsWith('- ')) {
      const { items, nextIndex } = readList(index, false);
      currentSection.blocks.push({ items, type: 'unordered-list' });
      index = nextIndex;
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      const { items, nextIndex } = readList(index, true);
      currentSection.blocks.push({ items, type: 'ordered-list' });
      index = nextIndex;
      continue;
    }

    const { nextIndex, text } = readParagraph(index);
    if (text.length > 0) {
      currentSection.blocks.push({ text, type: 'paragraph' });
    }
    index = nextIndex === index ? index + 1 : nextIndex;
  }

  const hydratedSections = sections.map((section) => ({
    ...section,
    searchText: [section.title, ...section.blocks.map(blockSearchText)].join(' '),
  }));

  return {
    intro,
    sections: hydratedSections,
    search: new Fuse(hydratedSections, {
      ignoreLocation: true,
      includeScore: true,
      keys: [
        { name: 'title', weight: 2 },
        { name: 'searchText', weight: 1 },
      ],
      minMatchCharLength: 2,
      threshold: 0.4,
    }),
  };
}
