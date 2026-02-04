"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  fullWidth?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", fullWidth, children, ...props }, ref) => {
    const base =
      "h-12 rounded-lg font-medium transition-colors active:scale-[0.98] disabled:opacity-50";
    const variants: Record<ButtonVariant, string> = {
      primary:
        "bg-primary text-primary-foreground hover:bg-primary-hover border border-border",
      secondary:
        "bg-transparent border border-primary text-primary hover:bg-primary/5",
      ghost: "bg-transparent text-primary underline hover:bg-primary/5",
    };
    return (
      <button
        ref={ref}
        className={cn(
          base,
          variants[variant],
          fullWidth && "w-full",
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
