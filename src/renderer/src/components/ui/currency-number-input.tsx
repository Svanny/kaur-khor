import * as React from "react"
import type { AppCurrency } from "@shared/inventory"

import { Input } from "@/components/ui/input"
import { currencyInputSymbol, moneyInputStep } from "@/lib/format"
import { cn } from "@/lib/utils"

type CurrencyNumberInputProps = Omit<React.ComponentProps<typeof Input>, "step" | "type"> & {
  currency: AppCurrency
}

const CurrencyNumberInput = React.forwardRef<HTMLInputElement, CurrencyNumberInputProps>(
  ({ className, currency, ...props }, ref) => (
    <span className="relative block">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-3 z-10 flex items-center text-sm font-medium text-muted-foreground"
      >
        {currencyInputSymbol(currency)}
      </span>
      <Input
        ref={ref}
        className={cn(className, "pl-8")}
        step={moneyInputStep(currency)}
        type="number"
        {...props}
      />
    </span>
  )
)

CurrencyNumberInput.displayName = "CurrencyNumberInput"

export { CurrencyNumberInput }
