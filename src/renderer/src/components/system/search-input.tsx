import { ActionSearchIcon } from '@icons/actions';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group';

export function SearchInput({
  addonClassName,
  ariaLabel,
  autoComplete,
  className = 'h-12 rounded-full',
  inputClassName,
  inputRef,
  onKeyDown,
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
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
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
        onKeyDown={onKeyDown}
      />
    </InputGroup>
  );
}
