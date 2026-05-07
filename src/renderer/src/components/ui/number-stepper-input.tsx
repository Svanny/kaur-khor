import * as React from "react"
import { ActionZoomInIcon, ActionZoomOutIcon } from "@icons/actions"

import { Input } from "@/components/ui/input"
import { parseEditableNumberWithCommas } from "@/lib/format"
import { cn } from "@/lib/utils"

type NumberStepperInputProps = Omit<React.ComponentProps<typeof Input>, "type"> & {
  decrementLabel?: string
  incrementLabel?: string
  inputPrefix?: React.ReactNode
  inputSuffixClassName?: string
  inputSuffix?: React.ReactNode
  inputWrapperClassName?: string
  variant?: "stacked" | "side-buttons"
  wrapperClassName?: string
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

function decimalPlaces(value: string | number | undefined) {
  const normalized = String(value ?? "1")
  const exponentMatch = normalized.match(/e-(\d+)$/i)
  if (exponentMatch) {
    return Number(exponentMatch[1])
  }
  return normalized.includes(".") ? normalized.split(".")[1]?.length ?? 0 : 0
}

function formatSteppedValue(value: number, step: string | number | undefined) {
  const places = decimalPlaces(step)
  return places > 0 ? value.toFixed(places) : String(Math.round(value))
}

function parseNumericText(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null
  }
  if (String(value).trim() === "") {
    return null
  }
  const parsed = parseEditableNumberWithCommas(String(value))
  return Number.isFinite(parsed) ? parsed : null
}

function clampSteppedValue(value: number, min: unknown, max: unknown) {
  const parsedMin = parseNumericText(min)
  const parsedMax = parseNumericText(max)
  const lowerBounded = parsedMin == null ? value : Math.max(parsedMin, value)
  return parsedMax == null ? lowerBounded : Math.min(parsedMax, lowerBounded)
}

const NumberStepperInput = React.forwardRef<HTMLInputElement, NumberStepperInputProps>(
  (
    {
      "aria-label": ariaLabel,
      "aria-invalid": ariaInvalid,
      className,
      decrementLabel,
      disabled,
      incrementLabel,
      inputPrefix,
      inputSuffixClassName,
      inputSuffix,
      inputWrapperClassName,
      max,
      min,
      placeholder,
      readOnly,
      step = "1",
      value,
      variant = "stacked",
      wrapperClassName,
      ...props
    },
    ref,
  ) => {
    const inputRef = React.useRef<HTMLInputElement | null>(null)
    const resolvedStep = Number(step) || 1
    const controlsDisabled = disabled || readOnly
    const labelText = typeof ariaLabel === "string" ? ariaLabel : undefined

    const assignRef = React.useCallback(
      (node: HTMLInputElement | null) => {
        inputRef.current = node
        if (typeof ref === "function") {
          ref(node)
        } else if (ref) {
          ref.current = node
        }
      },
      [ref],
    )

    const changeBy = React.useCallback(
      (direction: -1 | 1) => {
        const input = inputRef.current
        if (!input || controlsDisabled) {
          return
        }

        const base =
          parseNumericText(input.value) ??
          parseNumericText(value) ??
          parseNumericText(placeholder) ??
          parseNumericText(min) ??
          0
        const nextValue = clampSteppedValue(base + resolvedStep * direction, min, max)
        setInputValue(input, formatSteppedValue(nextValue, step))
      },
      [controlsDisabled, max, min, placeholder, resolvedStep, step, value],
    )

    if (variant === "side-buttons") {
      return (
        <span className={cn("grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1.5", wrapperClassName)}>
          <button
            aria-label={decrementLabel ?? (labelText ? `Decrement ${labelText}` : "Decrement value")}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background text-foreground transition-colors hover:border-foreground/30 disabled:pointer-events-none disabled:opacity-50"
            disabled={controlsDisabled}
            type="button"
            onClick={() => changeBy(-1)}
          >
            <ActionZoomOutIcon aria-hidden="true" className="size-4" />
          </button>
          <span className={cn("relative block min-w-0", inputWrapperClassName)}>
            {inputPrefix ? (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-3 z-10 flex items-center text-sm font-medium text-muted-foreground"
              >
                {inputPrefix}
              </span>
            ) : null}
            {inputSuffix ? (
              <span
                aria-hidden="true"
                className={cn("pointer-events-none absolute inset-y-0 right-3 z-10 flex items-center text-sm font-medium leading-none text-muted-foreground", inputSuffixClassName)}
              >
                {inputSuffix}
              </span>
            ) : null}
            <Input
              ref={assignRef}
              aria-label={ariaLabel}
              className={cn(className, inputSuffix ? "pr-16" : undefined)}
              disabled={disabled}
              max={max}
              min={min}
              placeholder={placeholder}
              readOnly={readOnly}
              step={step}
              type="number"
              value={value}
              {...props}
            />
          </span>
          <button
            aria-label={incrementLabel ?? (labelText ? `Increment ${labelText}` : "Increment value")}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background text-foreground transition-colors hover:border-foreground/30 disabled:pointer-events-none disabled:opacity-50"
            disabled={controlsDisabled}
            type="button"
            onClick={() => changeBy(1)}
          >
            <ActionZoomInIcon aria-hidden="true" className="size-4" />
          </button>
        </span>
      )
    }

    return (
      <span className={cn("relative block w-full min-w-0", wrapperClassName)}>
        <span
          aria-invalid={ariaInvalid}
          className={cn(
            "relative flex h-9 w-full min-w-0 overflow-hidden rounded-4xl border border-input bg-input/30 p-0 transition-colors",
            className,
            "!p-0",
            "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
            "aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
          )}
        >
          {inputPrefix ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-3 z-10 flex items-center text-sm font-medium text-muted-foreground"
          >
            {inputPrefix}
          </span>
          ) : null}
          {inputSuffix ? (
          <span
            aria-hidden="true"
            className={cn("pointer-events-none absolute inset-y-0 right-14 z-10 flex items-center text-sm font-medium leading-none text-muted-foreground", inputSuffixClassName)}
          >
            {inputSuffix}
          </span>
          ) : null}
          <Input
            ref={assignRef}
            aria-invalid={ariaInvalid}
            aria-label={ariaLabel}
            className={cn(
              "min-w-0 flex-1 !rounded-none !border-0 !bg-transparent !shadow-none focus-visible:!border-transparent focus-visible:!ring-0 aria-invalid:!ring-0",
              inputPrefix ? "pl-8" : undefined,
              className,
              inputSuffix ? "pr-20" : undefined,
              inputSuffix ? "w-full max-w-none" : "w-full max-w-none pr-14",
            )}
            disabled={disabled}
            max={max}
            min={min}
            placeholder={placeholder}
            readOnly={readOnly}
            step={step}
            type="number"
            value={value}
            {...props}
          />
          <span className="absolute inset-y-0 right-0 w-11 border-l border-border/70 bg-transparent">
            <button
              aria-label={incrementLabel ?? (labelText ? `Increment ${labelText}` : "Increment value")}
              className="absolute inset-x-0 bottom-1/2 top-0 inline-flex items-center justify-center text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
              disabled={controlsDisabled}
              type="button"
              onClick={() => changeBy(1)}
            >
              <ActionZoomInIcon aria-hidden="true" className="size-3.5" />
            </button>
            <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-px bg-border/50" />
            <button
              aria-label={decrementLabel ?? (labelText ? `Decrement ${labelText}` : "Decrement value")}
              className="absolute inset-x-0 bottom-0 top-1/2 inline-flex items-center justify-center text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
              disabled={controlsDisabled}
              type="button"
              onClick={() => changeBy(-1)}
            >
              <ActionZoomOutIcon aria-hidden="true" className="size-3.5" />
            </button>
          </span>
        </span>
      </span>
    )
  },
)

NumberStepperInput.displayName = "NumberStepperInput"

export { NumberStepperInput }
