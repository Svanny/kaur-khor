import { ActionSearchIcon } from '@icons/actions';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group';

export function SearchInput({
  addonClassName,
  ariaLabel,
  autoComplete,
  className = 'h-12 min-w-0 rounded-full',
  inputClassName,
  inputRef,
  onFocus,
  onKeyDown,
  onPointerDown,
  placeholder,
  value,
  onChange,
}: {
  addonClassName?: string;
  ariaLabel: string;
  autoComplete?: string;
  className?: string;
  inputClassName?: string;
  inputRef?: React.Ref<HTMLInputElement>;
  onFocus?: React.FocusEventHandler<HTMLInputElement>;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  onPointerDown?: React.PointerEventHandler<HTMLInputElement>;
  placeholder: string;
  value: string;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
}) {
  return (
    <InputGroup className={className}>
      <InputGroupAddon className={addonClassName ?? 'pl-4 text-muted-foreground'} align="inline-start">
        <InputGroupText>
          <ActionSearchIcon />
        </InputGroupText>
      </InputGroupAddon>
      <InputGroupInput
        aria-label={ariaLabel}
        autoComplete={autoComplete}
        className={inputClassName}
        placeholder={placeholder}
        ref={inputRef}
        type="search"
        value={value}
        onChange={onChange}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
      />
    </InputGroup>
  );
}
