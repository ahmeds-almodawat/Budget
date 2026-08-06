import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-information-surface text-information",
        secondary: "border-transparent bg-surface-muted text-text-secondary",
        outline: "border-border text-muted-foreground",
        accent: "border-transparent bg-warning-surface text-warning",
        success: "border-transparent bg-success-surface text-success",
        danger: "border-transparent bg-danger-surface text-danger",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
