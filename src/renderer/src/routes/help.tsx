import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { IconComponent } from '@icons';
import { ActionContinueIcon, ActionCreatePackageIcon, ActionOpenExternalIcon, ActionSearchOffIcon } from '@icons/actions';
import { EntityComparisonIcon, EntityEvidenceIcon, EntitySkuIcon, EntityTagsIcon } from '@icons/entities';
import {
  NavigationAutomationIcon,
  NavigationCatalogIcon,
  NavigationDashboardIcon,
  NavigationFinancialsIcon,
  NavigationHistoryIcon,
  NavigationAnalysisIcon,
  NavigationPerformanceIcon,
  NavigationSettingsIcon,
  NavigationSidebarIcon,
  NavigationTaskListIcon,
  NavigationWorkIcon,
  NavigationWorkspacePanelsIcon,
} from '@icons/navigation';
import { StatusHelpBadgeIcon, StatusNarrativeIcon } from '@icons/status';
import { AttentionFlash } from '@/components/system/attention-flash';
import { SearchInput } from '@/components/system/search-input';
import { WorkspaceActionRow, WorkspacePage, WorkspacePanel, WorkspaceTitleCard } from '@/components/system/workspace';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { usePreferences } from '@/state/preferences';
import { parseHelpContent } from './help-content';
import type { HelpBlock } from './help-content';
import guideSourceEn from '../../../../docs/user-guide.md?raw';
import guideSourceKm from '../../../../docs/user-guide.km.md?raw';

const proseClassName = 'text-sm leading-7 text-muted-foreground sm:text-[0.96rem]';
const sectionIconClassName = 'size-4.5 shrink-0 text-primary';
const indexIconClassName = 'size-4 shrink-0 text-muted-foreground';
const helpSubsectionHighlightDurationMs = 1900;
const helpSubsectionScrollHighlightDelayMs = 500;

const helpSectionIcons: Array<{ pattern: RegExp; icon: IconComponent }> = [
  { pattern: /^(what-banji-is-for|បញ្ជី-សម្រាប់អ្វី)$/, icon: NavigationWorkspacePanelsIcon },
  { pattern: /^(daily-workflow|លំហូរការងារប្រចាំថ្ងៃ)$/, icon: NavigationTaskListIcon },
  { pattern: /^(navigation|ការរុករក)$/, icon: NavigationSidebarIcon },
  { pattern: /^home$/, icon: NavigationDashboardIcon },
  { pattern: /^work$/, icon: NavigationWorkIcon },
  { pattern: /^queue$/, icon: NavigationTaskListIcon },
  { pattern: /^capture$/, icon: ActionCreatePackageIcon },
  { pattern: /^intake$/, icon: NavigationAutomationIcon },
  { pattern: /^catalog$/, icon: NavigationCatalogIcon },
  { pattern: /^catalog-/, icon: EntitySkuIcon },
  { pattern: /^record-update|record-update-/, icon: EntityEvidenceIcon },
  { pattern: /^insights$/, icon: NavigationPerformanceIcon },
  { pattern: /^pressure$/, icon: EntityComparisonIcon },
  { pattern: /^pressure-/, icon: NavigationAnalysisIcon },
  { pattern: /^money$/, icon: NavigationFinancialsIcon },
  { pattern: /^money-|^financial|^sena/, icon: NavigationFinancialsIcon },
  { pattern: /^explain$/, icon: NavigationAnalysisIcon },
  { pattern: /^explain-/, icon: NavigationAnalysisIcon },
  { pattern: /^automations$/, icon: NavigationAutomationIcon },
  { pattern: /^automation-/, icon: NavigationAutomationIcon },
  { pattern: /^history$/, icon: NavigationHistoryIcon },
  { pattern: /^settings|^interface-|^planning-|^local-data|^benchmark|^preferences/, icon: NavigationSettingsIcon },
  { pattern: /^first-useful-workflow$/, icon: ActionContinueIcon },
  { pattern: /^glossary|^coverage$|^confidence$/, icon: EntityTagsIcon },
  { pattern: /^faq|សំណួរញឹកញាប់$/, icon: StatusHelpBadgeIcon },
];

function iconForHelpSection(sectionId: string) {
  return helpSectionIcons.find((entry) => entry.pattern.test(sectionId))?.icon ?? StatusNarrativeIcon;
}

function HelpSectionIcon({
  className,
  sectionId,
}: {
  className: string;
  sectionId: string;
}) {
  const SectionIcon = iconForHelpSection(sectionId);
  return <SectionIcon aria-hidden="true" data-icon="inline-start" className={className} />;
}

function groupHelpBlocks(blocks: HelpBlock[]) {
  const groups: Array<{ heading: Extract<HelpBlock, { type: 'heading' }> | null; blocks: HelpBlock[] }> = [];

  for (const block of blocks) {
    if (block.type === 'heading') {
      groups.push({ blocks: [], heading: block });
      continue;
    }

    if (groups.length === 0) {
      groups.push({ blocks: [], heading: null });
    }

    groups[groups.length - 1]?.blocks.push(block);
  }

  return groups;
}

export function HelpRoute() {
  const location = useLocation();
  const { language, t } = usePreferences();
  const [query, setQuery] = useState('');
  const [highlightedSubsectionId, setHighlightedSubsectionId] = useState<string | null>(null);
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
  const visibleSections = useMemo(() => searchResults.map((result) => result.item), [searchResults]);
  const bestMatchSectionId = normalizedQuery ? visibleSections[0]?.id ?? null : null;

  function jumpToSection(sectionId: string) {
    const target = sectionRefs.current[sectionId];
    if (!target) {
      return;
    }

    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${sectionId}`);
  }

  useEffect(() => {
    if (!location.hash) {
      setHighlightedSubsectionId(null);
      return;
    }
    const targetId = decodeURIComponent(location.hash.slice(1));
    const target = document.getElementById(targetId);
    if (!target) {
      return;
    }

    setHighlightedSubsectionId(null);
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setHighlightedSubsectionId(targetId);
          observer.disconnect();
        }
      }, { threshold: 0.2 });

      observer.observe(target);
      return () => {
        observer.disconnect();
      };
    }

    const delayId = window.setTimeout(() => {
      setHighlightedSubsectionId(targetId);
    }, helpSubsectionScrollHighlightDelayMs);

    return () => {
      window.clearTimeout(delayId);
    };
  }, [location.hash, visibleSections]);

  useEffect(() => {
    if (!highlightedSubsectionId) {
      return;
    }

    const highlightedId = highlightedSubsectionId;
    const timeoutId = window.setTimeout(() => {
      setHighlightedSubsectionId((current) => (current === highlightedId ? null : current));
    }, helpSubsectionHighlightDurationMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [highlightedSubsectionId]);

  return (
    <WorkspacePage className="pb-24 md:pb-36">
      <WorkspaceTitleCard
        helperExemptReason="Help page title explains itself through the guide intro"
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
              <Link to="/work/capture">
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
              helperExemptReason="Empty search state, not an information-bearing section"
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
                    <ActionSearchOffIcon data-icon="inline-start" />
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
                helperExemptReason="Rendered guide section title from docs content"
                className={cn(
                  bestMatchSectionId === section.id && 'border-primary/45 bg-primary/[0.045] ring-1 ring-primary/20',
                )}
                title={
                  <div className="flex flex-wrap items-center gap-2">
                    <HelpSectionIcon className={sectionIconClassName} sectionId={section.id} />
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
                  {groupHelpBlocks(section.blocks).map((group, groupIndex) => {
                    const activeGroup = group.heading?.id === highlightedSubsectionId;

                    return (
                      <AttentionFlash
                        active={activeGroup}
                        key={`${section.id}-group-${group.heading?.id ?? groupIndex}`}
                        className="grid gap-4"
                        data-active-help-subsection={activeGroup ? 'true' : undefined}
                        overlayTestId="help-subsection-highlight"
                      >
                        {group.heading ? (() => {
                          const Tag = group.heading.depth === 3 ? 'h3' : 'h4';
                          return (
                            <Tag
                              id={group.heading.id}
                              className={cn(
                                'scroll-mt-24 font-heading text-foreground transition-colors',
                                group.heading.depth === 3 ? 'pt-2 text-xl font-semibold tracking-[-0.02em]' : 'pt-1 text-base font-semibold',
                              )}
                            >
                              {group.heading.text}
                            </Tag>
                          );
                        })() : null}
                        {group.blocks.map((block, index) => {
                    if (block.type === 'paragraph') {
                      return (
                        <p key={`${section.id}-paragraph-${groupIndex}-${index}`} className={proseClassName}>
                          {block.text}
                        </p>
                      );
                    }

                    if (block.type === 'unordered-list') {
                      return (
                        <ul key={`${section.id}-unordered-${groupIndex}-${index}`} className="grid gap-2 pl-5 text-sm leading-7 text-muted-foreground sm:text-[0.96rem]">
                          {block.items.map((item) => (
                            <li key={item} className="list-disc">
                              {item}
                            </li>
                          ))}
                        </ul>
                      );
                    }

                    return (
                      <ol key={`${section.id}-ordered-${groupIndex}-${index}`} className="grid gap-2 pl-5 text-sm leading-7 text-muted-foreground sm:text-[0.96rem]">
                        {block.items.map((item) => (
                          <li key={item} className="list-decimal">
                            {item}
                          </li>
                        ))}
                      </ol>
                    );
                        })}
                      </AttentionFlash>
                    );
                  })}
                </div>
              </WorkspacePanel>
            </div>
          ))}
        </div>

        <div className="grid gap-6 self-start xl:sticky xl:top-5">
          <WorkspacePanel
            helperExemptReason="Help index navigation title, not business concept copy"
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
                  <span className="flex min-w-0 items-center gap-2">
                    <HelpSectionIcon className={indexIconClassName} sectionId={section.id} />
                    <span className="truncate">{section.title}</span>
                  </span>
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
            helperExemptReason="Repository-link support panel, not business concept copy"
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
