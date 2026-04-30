import * as React from "react"
import type { AppCurrency } from "@shared/inventory"

import { NumberStepperInput } from "@/components/ui/number-stepper-input"
import { currencyInputSymbol, moneyInputStep } from "@/lib/format"
import { cn } from "@/lib/utils"

type CurrencyNumberInputProps = Omit<React.ComponentProps<typeof NumberStepperInput>, "inputPrefix" | "step" | "type"> & {
  currency: AppCurrency
}

const CurrencyNumberInput = React.forwardRef<HTMLInputElement, CurrencyNumberInputProps>(
  ({ className, currency, ...props }, ref) => (
    <NumberStepperInput
      ref={ref}
      className={cn(className, "pl-8")}
      inputPrefix={currencyInputSymbol(currency)}
      step={moneyInputStep(currency)}
      {...props}
    />
  )
)

CurrencyNumberInput.displayName = "CurrencyNumberInput"

export { CurrencyNumberInput }
