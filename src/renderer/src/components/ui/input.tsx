import * as React from "react"

import { formatEditableNumberWithCommas, sanitizeEditableNumberDraft } from "@/lib/formatting/format"
import { cn } from "@/lib/utils"

type InputProps = React.ComponentProps<"input"> & {
  formatNumber?: boolean
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, formatNumber = true, type, ...props }, ref) => {
    if (type === "number") {
      const mode = props.step === "1" ? "integer" : "decimal"
      const displayValue =
        formatNumber && props.value != null ? formatEditableNumberWithCommas(String(props.value)) : props.value

      return (
        <input
          ref={ref}
          type="text"
          inputMode={mode === "integer" ? "numeric" : "decimal"}
          data-slot="input"
          className={cn(
            "h-9 w-full min-w-0 rounded-4xl border border-input bg-input/30 px-3 py-1 text-base transition-colors outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 md:text-sm dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
            "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
            className
          )}
          {...props}
          value={displayValue}
          onChange={(event) => {
            if (formatNumber) {
              event.currentTarget.value = sanitizeEditableNumberDraft(event.currentTarget.value, mode)
            }
            props.onChange?.(event)
          }}
        />
      )
    }

    return (
      <input
        ref={ref}
        type={type}
        data-slot="input"
        className={cn(
          "h-9 w-full min-w-0 rounded-4xl border border-input bg-input/30 px-3 py-1 text-base transition-colors outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 md:text-sm dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
          "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
          className
        )}
        {...props}
      />
    )
  }
)

Input.displayName = "Input"

export { Input }
