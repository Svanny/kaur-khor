import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  NavigationAutomationIcon,
  NavigationTaskListIcon,
} from '@icons/navigation';
import { ActionCreatePackageIcon } from '@icons/actions';
import type { IconComponent } from '@icons';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { compactActionSurfaceClassName } from '@/components/system/compact-controls';
import { CenteredTileGrid } from '@/components/system/centered-tile-grid';
import { LiquidGridCard } from '@/components/system/liquid-grid-card';
import { WorkspacePage, WorkspaceTitleCard } from '@/components/system/workspace';
import { gridCardSurfaceClassName, type GridCardColorKey } from '@/lib/grid-card-colors';
import { buildRememberedInboxHref, usePageStateMemoryVersion } from '@/lib/page-state-memory';
import { getTranslation, translateUiLiteral } from '@/lib/translations';
import { usePreferences } from '@/state/preferences';
import { AutomationsRoute } from './automations';
import { DashboardRoute } from './dashboard';
import { RecordUpdateHubRoute } from './record-update-hub';

function WorkSubPageTitleCard() {
  const { language, showAutomationsPage, t } = usePreferences();
  const location = useLocation();
  const navigate = useNavigate();
  usePageStateMemoryVersion();
  const queueHref = buildRememberedInboxHref();
  const tabs = [
    {
      href: queueHref,
      icon: <NavigationTaskListIcon className="size-4" />,
      label: 'Queue',
      match: '/work/queue',
      value: '/work/queue',
    },
    ...(showAutomationsPage
      ? [{
          href: '/work/intake',
          icon: <NavigationAutomationIcon className="size-4" />,
          label: 'Intake',
          match: '/work/intake',
          value: '/work/intake',
        }]
      : []),
    {
      href: '/work/capture',
      icon: <ActionCreatePackageIcon className="size-4" />,
      label: 'Capture',
      match: '/work/capture',
      value: '/work/capture',
    },
  ];
  const activeHref = tabs.find((tab) => location.pathname.startsWith(tab.match))?.value ?? '/work/queue';

  return (
    <WorkspaceTitleCard
      eyebrow={t('navWork')}
      title={translateUiLiteral(language, 'Daily operator work')}
      descriptor={translateUiLiteral(language, 'Queue, capture, and intake stay in one operator workspace.')}
      actions={
        <ToggleGroup
          className={compactActionSurfaceClassName}
          type="single"
          value={activeHref}
          onValueChange={(value) => {
            if (value) {
              navigate(tabs.find((tab) => tab.value === value)?.href ?? value);
            }
          }}
        >
          {tabs.map((tab) => (
            <ToggleGroupItem key={tab.value} aria-label={translateUiLiteral(language, tab.label)} value={tab.value}>
              {tab.icon}
              <span>{translateUiLiteral(language, tab.label)}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      }
      className="rounded-xl"
    />
  );
}

const WORK_MODES: Array<{
  id: string;
  icon: IconComponent;
  label: string;
  tone: GridCardColorKey;
  summary: string;
  href: string;
}> = [
  {
    id: 'queue',
    icon: NavigationTaskListIcon,
    label: 'Queue',
    tone: 'queue',
    summary: 'Review customer and supplier work that needs attention next.',
    href: '/work/queue',
  },
  {
    id: 'intake',
    icon: NavigationAutomationIcon,
    label: 'Intake',
    tone: 'intake',
    summary: 'Expose approved sellables to Telegram, turn messages into tickets, and keep banji as source.',
    href: '/work/intake',
  },
  {
    id: 'capture',
    icon: ActionCreatePackageIcon,
    label: 'Capture',
    tone: 'capture',
    summary: 'Choose the physical, customer, or supplier ticket flow that matches the work you are recording.',
    href: '/work/capture',
  },
];

export function WorkRoute() {
  const { language, showAutomationsPage, t } = usePreferences();
  const params = useParams();
  const activePath = params['*']?.replace(/\/+$/, '') ?? '';
  usePageStateMemoryVersion();
  const visibleWorkModes = showAutomationsPage
    ? WORK_MODES
    : WORK_MODES.filter((mode) => mode.id !== 'intake');
  const rememberedQueueHref = buildRememberedInboxHref();

  if (!activePath) {
    return (
      <WorkspacePage fitViewport className="gap-5">
        <WorkspaceTitleCard
          eyebrow={t?.('navWork') ?? getTranslation(language, 'navWork')}
          title={translateUiLiteral(language, 'Daily operator work')}
          descriptor={translateUiLiteral(language, 'Queue, capture, and intake stay in one operator workspace.')}
          className="rounded-xl"
        />

        <CenteredTileGrid columns={Math.min(3, visibleWorkModes.length)}>
          {visibleWorkModes.map((mode) => {
            const Icon = mode.icon;
            return (
              <Link
                key={mode.id}
                className="block min-w-0 focus-visible:outline-none"
                to={mode.id === 'queue' ? rememberedQueueHref : mode.href}
              >
                <LiquidGridCard
                  className={gridCardSurfaceClassName(mode.tone)}
                  contentClassName="min-w-[14rem] px-5 py-6 text-center md:px-7 md:py-7"
                >
                  <span className="flex h-full flex-col items-center justify-center">
                    <span className="flex flex-col items-center gap-5">
                      <span className="flex h-20 items-end justify-center md:h-24">
                        <Icon className="size-16 shrink-0 text-foreground md:size-20" aria-hidden="true" />
                      </span>
                      <span className="flex flex-col items-center gap-3">
                        <span className="khmer-safe-display block min-h-8 text-2xl font-semibold text-foreground">
                          {translateUiLiteral(language, mode.label)}
                        </span>
                        <span className="mx-auto block h-[4.5rem] max-w-[15rem] text-sm leading-6 text-muted-foreground line-clamp-3">
                          {translateUiLiteral(language, mode.summary)}
                        </span>
                      </span>
                    </span>
                  </span>
                </LiquidGridCard>
              </Link>
            );
          })}
        </CenteredTileGrid>
      </WorkspacePage>
    );
  }

  if (activePath === 'queue') {
    return <DashboardRoute />;
  }

  if (activePath === 'capture') {
    return (
      <>
        <WorkSubPageTitleCard />
        <RecordUpdateHubRoute embedded />
      </>
    );
  }

  if (activePath === 'intake') {
    if (!showAutomationsPage) {
      return <Navigate replace to={rememberedQueueHref} />;
    }
    return <AutomationsRoute forcedSection="intake" />;
  }

  return <Navigate replace to={rememberedQueueHref} />;
}
