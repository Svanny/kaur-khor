import { Search } from 'lucide-react';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group';

export function SearchInput({
  ariaLabel,
  className = 'h-12 rounded-full',
  placeholder,
  value,
  onChange,
}: {
  ariaLabel: string;
  className?: string;
  placeholder: string;
  value: string;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
}) {
  return (
    <InputGroup className={className}>
      <InputGroupAddon className="pl-4 text-muted-foreground" align="inline-start">
        <InputGroupText>
          <Search />
        </InputGroupText>
      </InputGroupAddon>
      <InputGroupInput
        aria-label={ariaLabel}
        placeholder={placeholder}
        type="search"
        value={value}
        onChange={onChange}
      />
    </InputGroup>
  );
}
