import { ActionSearchOffIcon } from '@icons/actions';

export function AutomationEmptyState({
  body,
  title,
}: {
  body: string;
  title: string;
}) {
  return (
    <div className="grid place-items-center px-5 py-16">
      <div className="max-w-md text-center">
        <ActionSearchOffIcon className="mx-auto size-9 text-muted-foreground/70" />
        <h3 className="mt-4 text-lg font-semibold tracking-[-0.02em] text-foreground">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
