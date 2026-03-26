import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

export function ShellCard({
  children,
  className = '',
  ...props
}: {
  children: ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLElement>) {
  const classes = ['shell-card', className].filter(Boolean).join(' ');
  return (
    <section {...props} className={classes}>
      {children}
    </section>
  );
}

export function SectionTitle({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-title-row">
      <h2 className="section-title">{title}</h2>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  backTo,
  actions,
}: {
  title: string;
  backTo?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div className="page-header-main">
        {backTo ? (
          <Link aria-label="Back" className="icon-pill" to={backTo}>
            <span aria-hidden="true">←</span>
          </Link>
        ) : null}
        <h1 className="page-title">{title}</h1>
      </div>
      {actions ? <div className="page-header-actions">{actions}</div> : null}
    </div>
  );
}

export function SaveChangeHeader({
  title,
  onBack,
  onCancel,
  onSave,
  hasChanges,
  isSaving,
  saveLabel,
  cancelLabel,
}: {
  title: string;
  onBack: () => void;
  onCancel: () => void;
  onSave: () => void;
  hasChanges: boolean;
  isSaving: boolean;
  saveLabel: string;
  cancelLabel: string;
}) {
  return (
    <div className="save-change-header">
      <div className="page-header-main">
        <button aria-label="Back" className="icon-pill" onClick={onBack} type="button">
          <span aria-hidden="true">←</span>
        </button>
        <div>
          <p className="save-change-caption">
            {hasChanges ? 'Unsaved changes' : 'Saved'}
          </p>
          <h1 className="page-title">{title}</h1>
        </div>
      </div>
      <div className="page-header-actions">
        <button className="secondary-pill-button" onClick={onCancel} type="button">
          {cancelLabel}
        </button>
        <button className="primary-pill-button" disabled={!hasChanges || isSaving} onClick={onSave} type="button">
          {saveLabel}
        </button>
      </div>
    </div>
  );
}

export function PillButton({
  active = false,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      {...props}
      className={active ? 'filter-pill filter-pill-active' : 'filter-pill'}
      type={props.type ?? 'button'}
    >
      {children}
    </button>
  );
}

export function FloatingAction({
  label,
  to,
}: {
  label: string;
  to: string;
}) {
  return (
    <Link aria-label={label} className="floating-action-button" to={to}>
      <span aria-hidden="true">＋</span>
    </Link>
  );
}

export function IconLabel({
  icon,
  children,
}: {
  icon: string;
  children: ReactNode;
}) {
  return (
    <span className="icon-label">
      <span aria-hidden="true" className="icon-label-mark">
        {icon}
      </span>
      <span>{children}</span>
    </span>
  );
}
