import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-[rgba(98,80,67,0.14)]", className)}
      {...props}
    />
  )
}

export { Skeleton }
