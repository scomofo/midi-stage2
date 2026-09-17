import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-[transform,background-color,opacity] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent disabled:opacity-40 disabled:pointer-events-none active:not-disabled:scale-[0.96]",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-fg hover:brightness-110",
        secondary: "bg-elevated text-fg shadow-[0_0_0_1px_rgba(239,232,220,0.12)] hover:bg-surface",
        ghost: "bg-transparent text-muted hover:text-fg hover:bg-fg/5",
      },
      size: {
        default: "h-11 rounded-xl px-5 text-sm",
        sm: "h-9 rounded-lg px-3.5 text-xs tracking-wide",
        icon: "size-11 rounded-xl",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

export function Button({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
