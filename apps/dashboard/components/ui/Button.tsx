"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

/**
 * Visual variants. The `transition-all` + `active:scale-[0.97]` pair gives
 * every button a small tactile press-in (Material-UI style) and the wrapping
 * `mb-ripple-host` class is what allows the JS-injected ripple `<span>` to
 * stay clipped inside the rounded shape.
 */
const buttonVariants = cva(
  "mb-ripple-host inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-[transform,background-color,color,box-shadow] duration-150 ease-out hover:-translate-y-px active:translate-y-0 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 disabled:hover:translate-y-0 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:shadow-md",
        outline:
          "border border-border bg-background hover:bg-muted/60 hover:text-foreground hover:border-primary/30",
        ghost: "hover:bg-muted/60 hover:text-foreground",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 hover:shadow-md",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
      },
      size: {
        sm: "h-9 px-3",
        md: "h-10 px-4",
        lg: "h-11 px-5 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    /** Disable the click ripple (e.g. for icon-toggles where it feels noisy). */
    disableRipple?: boolean;
  };

/**
 * Append a single ripple span scaled to the host's diagonal so the wave
 * always reaches the corner regardless of where the user clicked. The span
 * cleans itself up on `animationend` to avoid leaking nodes on rapid clicks.
 */
function spawnRipple(
  host: HTMLElement,
  clientX: number,
  clientY: number,
): void {
  const rect = host.getBoundingClientRect();
  const size =
    Math.hypot(
      Math.max(clientX - rect.left, rect.right - clientX),
      Math.max(clientY - rect.top, rect.bottom - clientY),
    ) * 2;
  const span = document.createElement("span");
  span.className = "mb-ripple";
  span.style.setProperty("--ripple-size", `${size}px`);
  span.style.setProperty("--ripple-x", `${clientX - rect.left - size / 2}px`);
  span.style.setProperty("--ripple-y", `${clientY - rect.top - size / 2}px`);
  span.addEventListener("animationend", () => span.remove(), { once: true });
  host.appendChild(span);
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      type = "button",
      onPointerDown,
      onKeyDown,
      disableRipple,
      ...props
    },
    ref,
  ) => {
    const handlePointerDown = React.useCallback(
      (event: React.PointerEvent<HTMLButtonElement>) => {
        if (!disableRipple && !event.currentTarget.disabled) {
          spawnRipple(event.currentTarget, event.clientX, event.clientY);
        }
        onPointerDown?.(event);
      },
      [disableRipple, onPointerDown],
    );

    const handleKeyDown = React.useCallback(
      (event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (
          !disableRipple &&
          !event.currentTarget.disabled &&
          (event.key === "Enter" || event.key === " ")
        ) {
          const rect = event.currentTarget.getBoundingClientRect();
          spawnRipple(
            event.currentTarget,
            rect.left + rect.width / 2,
            rect.top + rect.height / 2,
          );
        }
        onKeyDown?.(event);
      },
      [disableRipple, onKeyDown],
    );

    return (
      <button
        ref={ref}
        type={type}
        className={cn(buttonVariants({ variant, size }), className)}
        onPointerDown={handlePointerDown}
        onKeyDown={handleKeyDown}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
