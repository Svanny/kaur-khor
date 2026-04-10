import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ActionOpenExternalIcon } from '@icons/actions';
import { NavigationDashboardIcon, NavigationTaskListIcon } from '@icons/navigation';
import { SearchInput } from '@/components/system/search-input';
import { WorkspaceActionRow, WorkspacePage, WorkspacePanel, WorkspaceTitleCard } from '@/components/system/workspace';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { usePreferences } from '@/state/preferences';
import { parseHelpContent } from './help-content';
import guideSourceEn from '../../../../docs/user-guide.md?raw';
import guideSourceKm from '../../../../docs/user-guide.km.md?raw';

const proseClassName = 'text-sm leading-7 text-muted-foreground sm:text-[0.96rem]';

export function HelpRoute() {
  const { language, t } = usePreferences();
  const [query, setQuery] = useState('');
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const repositoryGuideHref =
    language === 'km'
      ? 'https://github.com/Svanny/banji/blob/main/docs/user-guide.km.md'
      : 'https://github.com/Svanny/banji/blob/main/docs/user-guide.md';
  const helpContent = useMemo(
    () => parseHelpContent(language === 'km' ? guideSourceKm : guideSourceEn),
    [language],
  );
  const normalizedQuery = query.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!normalizedQuery) {
      return helpContent.sections.map((section) => ({ item: section, score: Number.POSITIVE_INFINITY }));
    }

    return helpContent.search.search(normalizedQuery);
  }, [helpContent, normalizedQuery]);
  const visibleSections = searchResults.map((result) => result.item);
  const bestMatchSectionId = normalizedQuery ? visibleSections[0]?.id ?? null : null;

  function jumpToSection(sectionId: string) {
    const target = sectionRefs.current[sectionId];
    if (!target) {
      return;
    }

    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/help#${sectionId}`);
  }

  return (
    <WorkspacePage>
      <WorkspaceTitleCard
        eyebrow={t('navHelp')}
        title={t('helpPageTitle')}
        descriptor={t('helpPageDescriptor')}
        actions={
          <WorkspaceActionRow>
            <Button asChild>
              <Link to="/">
                <NavigationDashboardIcon data-icon="inline-start" />
                {t('helpOpenOverviewAction')}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/record-update">
                <NavigationTaskListIcon data-icon="inline-start" />
                {t('helpStartUpdateAction')}
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
              ariaLabel={t('helpSearchAriaLabel')}
              placeholder={t('helpSearchPlaceholder')}
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
              title={t('helpNoMatchesTitle')}
              descriptor={t('helpNoMatchesDescriptor')}
            >
              <div className="grid gap-3">
                <p className={proseClassName}>
                  {t('helpNoMatchesBody')}
                </p>
                <WorkspaceActionRow>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setQuery('');
                    }}
                  >
                    {t('helpClearSearchAction')}
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
                        {t('helpBestMatchBadge')}
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
            title={t('helpIndexTitle')}
            descriptor={t('helpIndexDescriptor')}
          >
            <nav
              aria-label={t('helpIndexAriaLabel')}
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
                      {t('helpIndexBestBadge')}
                    </span>
                  ) : null}
                </button>
              ))}
            </nav>
          </WorkspacePanel>

          <WorkspacePanel
            title={t('helpMoreTitle')}
            descriptor={t('helpMoreDescriptor')}
          >
            <a
              className="inline-flex items-center gap-2 text-sm font-medium text-foreground underline-offset-4 hover:underline"
              href={repositoryGuideHref}
              rel="noreferrer"
              target="_blank"
            >
              {t('helpOpenRepositoryCopy')}
              <ActionOpenExternalIcon className="size-4" />
            </a>
          </WorkspacePanel>
        </div>
      </div>
    </WorkspacePage>
  );
}
