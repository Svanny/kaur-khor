import type { ComponentProps, ReactNode } from 'react';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

type BaseFieldProps = {
  id: string;
  label: string;
  error?: string;
  description?: string;
};

export function TextInputField({
  id,
  label,
  error,
  description,
  inputRef,
  ...props
}: BaseFieldProps & ComponentProps<typeof Input> & { inputRef?: ComponentProps<typeof Input>['ref'] }) {
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <FieldContent>
        <Input aria-invalid={!!error} id={id} ref={inputRef} {...props} />
        {description ? <FieldDescription>{description}</FieldDescription> : null}
        <FieldError>{error}</FieldError>
      </FieldContent>
    </Field>
  );
}

export function TextAreaField({
  id,
  label,
  error,
  description,
  inputRef,
  ...props
}: BaseFieldProps & ComponentProps<typeof Textarea> & { inputRef?: ComponentProps<typeof Textarea>['ref'] }) {
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <FieldContent>
        <Textarea aria-invalid={!!error} id={id} ref={inputRef} {...props} />
        {description ? <FieldDescription>{description}</FieldDescription> : null}
        <FieldError>{error}</FieldError>
      </FieldContent>
    </Field>
  );
}

export function InlineCheckField({
  children,
  title,
  description,
}: {
  children: ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <Field className="rounded-3xl border border-border/80 bg-background/55 px-4 py-4" orientation="horizontal">
      {children}
      <FieldContent>
        <FieldLabel className="font-medium">{title}</FieldLabel>
        {description ? <FieldDescription>{description}</FieldDescription> : null}
      </FieldContent>
    </Field>
  );
}
