import Fuse from 'fuse.js';
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ActionOpenExternalIcon } from '@icons/actions';
import { NavigationDashboardIcon, NavigationTaskListIcon } from '@icons/navigation';
import { SearchInput } from '@/components/system/search-input';
import { WorkspaceActionRow, WorkspacePage, WorkspacePanel, WorkspaceTitleCard } from '@/components/system/workspace';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import guideSource from '../../../../docs/user-guide.md?raw';

type HelpBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'unordered-list'; items: string[] }
  | { type: 'ordered-list'; items: string[] }
  | { type: 'heading'; depth: 3 | 4; text: string };

type HelpSection = {
  id: string;
  searchText: string;
  title: string;
  blocks: HelpBlock[];
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeInlineMarkdown(value: string) {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

function parseHelpContent(markdown: string) {
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

    if (line.length === 0 || line === '# Banji User Guide') {
      index += 1;
      continue;
    }

    if (line.startsWith('## ')) {
      const title = normalizeInlineMarkdown(line.slice(3));
      collectingIntro = false;
      if (title !== 'Table of Contents') {
        currentSection = { blocks: [], id: slugify(title), searchText: '', title };
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
      currentSection.blocks.push({ depth: 3, text: normalizeInlineMarkdown(line.slice(4)), type: 'heading' });
      index += 1;
      continue;
    }

    if (line.startsWith('#### ')) {
      currentSection.blocks.push({ depth: 4, text: normalizeInlineMarkdown(line.slice(5)), type: 'heading' });
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

  return { intro, sections };
}

const helpContent = parseHelpContent(guideSource);
const proseClassName = 'text-sm leading-7 text-muted-foreground sm:text-[0.96rem]';
const helpSections = helpContent.sections.map((section) => ({
  ...section,
  searchText: [section.title, ...section.blocks.map(blockSearchText)].join(' '),
}));
const helpSearch = new Fuse(helpSections, {
  ignoreLocation: true,
  includeScore: true,
  keys: [
    { name: 'title', weight: 2 },
    { name: 'searchText', weight: 1 },
  ],
  minMatchCharLength: 2,
  threshold: 0.4,
});

function blockSearchText(block: HelpBlock) {
  if (block.type === 'paragraph' || block.type === 'heading') {
    return block.text;
  }
  return block.items.join(' ');
}

export function HelpRoute() {
  const [query, setQuery] = useState('');
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const normalizedQuery = query.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!normalizedQuery) {
      return helpSections.map((section) => ({ item: section, score: Number.POSITIVE_INFINITY }));
    }

    return helpSearch.search(normalizedQuery);
  }, [normalizedQuery]);
  const visibleSections = searchResults.map((result) => result.item);
  const bestMatchSectionId = normalizedQuery ? visibleSections[0]?.id ?? null : null;

  function jumpToSection(sectionId: string) {
    const target = sectionRefs.current[sectionId];
    if (!target) {
      return;
    }

    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.history.replaceState(null, '', `#${sectionId}`);
  }

  return (
    <WorkspacePage>
      <WorkspaceTitleCard
        eyebrow="Help"
        title="User guide"
        descriptor="Browse Banji's workflows, screen-by-screen explanations, glossary terms, and FAQ from one in-app help surface."
        actions={
          <WorkspaceActionRow>
            <Button asChild>
              <Link to="/">
                <NavigationDashboardIcon data-icon="inline-start" />
                Open overview
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/record-update">
                <NavigationTaskListIcon data-icon="inline-start" />
                Start update
              </Link>
            </Button>
          </WorkspaceActionRow>
        }
      >
        <div className="grid gap-4">
          {helpContent.intro.map((paragraph) => (
            <p key={paragraph} className={proseClassName}>
              {paragraph}
            </p>
          ))}
          <div className="w-full max-w-2xl">
            <SearchInput
              ariaLabel="Search help"
              placeholder="Search features, workflows, buttons, or FAQ…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
              }}
            />
          </div>
        </div>
      </WorkspaceTitleCard>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="grid gap-6">
          {visibleSections.length === 0 ? (
            <WorkspacePanel
              title="No matching help sections"
              descriptor="Try a broader search term or clear the current help filter."
            >
              <div className="grid gap-3">
                <p className={proseClassName}>
                  Banji could not find a help section matching your search.
                </p>
                <WorkspaceActionRow>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setQuery('');
                    }}
                  >
                    Clear search
                  </Button>
                </WorkspaceActionRow>
              </div>
            </WorkspacePanel>
          ) : null}
          {visibleSections.map((section) => (
            <div
              key={section.id}
              ref={(node) => {
                sectionRefs.current[section.id] = node;
              }}
              id={section.id}
              className="scroll-mt-24"
            >
              <WorkspacePanel
                className={cn(
                  bestMatchSectionId === section.id && 'border-primary/45 bg-primary/[0.045] ring-1 ring-primary/20',
                )}
                title={
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{section.title}</span>
                    {bestMatchSectionId === section.id ? (
                      <span
                        className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-primary"
                        data-testid="help-best-match-badge"
                      >
                        Best match
                      </span>
                    ) : null}
                  </div>
                }
              >
                <div className="grid gap-4">
                  {section.blocks.map((block, index) => {
                    if (block.type === 'paragraph') {
                      return (
                        <p key={`${section.id}-paragraph-${index}`} className={proseClassName}>
                          {block.text}
                        </p>
                      );
                    }

                    if (block.type === 'heading') {
                      const Tag = block.depth === 3 ? 'h3' : 'h4';
                      return (
                        <Tag
                          key={`${section.id}-heading-${index}`}
                          className={cn(
                            'font-heading text-foreground',
                            block.depth === 3 ? 'pt-2 text-xl font-semibold tracking-[-0.02em]' : 'pt-1 text-base font-semibold',
                          )}
                        >
                          {block.text}
                        </Tag>
                      );
                    }

                    if (block.type === 'unordered-list') {
                      return (
                        <ul key={`${section.id}-unordered-${index}`} className="grid gap-2 pl-5 text-sm leading-7 text-muted-foreground sm:text-[0.96rem]">
                          {block.items.map((item) => (
                            <li key={item} className="list-disc">
                              {item}
                            </li>
                          ))}
                        </ul>
                      );
                    }

                    return (
                      <ol key={`${section.id}-ordered-${index}`} className="grid gap-2 pl-5 text-sm leading-7 text-muted-foreground sm:text-[0.96rem]">
                        {block.items.map((item) => (
                          <li key={item} className="list-decimal">
                            {item}
                          </li>
                        ))}
                      </ol>
                    );
                  })}
                </div>
              </WorkspacePanel>
            </div>
          ))}
        </div>

        <div className="grid gap-6 self-start xl:sticky xl:top-5">
          <WorkspacePanel
            title="Index"
            descriptor="Jump straight to the part of the guide you need."
          >
            <nav
              aria-label="Help sections"
              className="grid"
            >
              {visibleSections.map((section) => (
                <button
                  key={section.id}
                  className={cn(
                    'flex items-center justify-between gap-3 px-4 py-3 text-sm text-foreground transition-colors hover:bg-accent/60 hover:text-accent-foreground',
                    'border-t border-border/60 first:border-t-0',
                    'w-full text-left',
                    bestMatchSectionId === section.id
                      ? 'bg-primary/[0.07] font-medium text-primary'
                      : '',
                  )}
                  type="button"
                  onClick={() => {
                    jumpToSection(section.id);
                  }}
                >
                  <span>{section.title}</span>
                  {bestMatchSectionId === section.id ? (
                    <span className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-primary/80">
                      Best
                    </span>
                  ) : null}
                </button>
              ))}
            </nav>
          </WorkspacePanel>

          <WorkspacePanel
            title="More help"
            descriptor="The repository guide stays in sync with this in-app page."
          >
            <a
              className="inline-flex items-center gap-2 text-sm font-medium text-foreground underline-offset-4 hover:underline"
              href="https://github.com/Svanny/banji/blob/main/docs/user-guide.md"
              rel="noreferrer"
              target="_blank"
            >
              Open repository copy
              <ActionOpenExternalIcon className="size-4" />
            </a>
          </WorkspacePanel>
        </div>
      </div>
    </WorkspacePage>
  );
}
