"use client";

import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { passwordFieldState } from "@/lib/auth-messages";

type PasswordInputProps = Omit<React.ComponentProps<"input">, "type"> & {
  /** Required: the toggle references it via aria-controls. */
  id: string;
};

/**
 * A password field with a reveal control.
 *
 * One component for all four password inputs so the behaviour, markup and
 * wording cannot drift between the signup, login and reset forms.
 *
 * Visibility is local state per instance, which is what makes "new password"
 * and "confirm new password" independently toggleable — they are two
 * components, not one shared flag.
 *
 * Toggling swaps the `type` attribute only. The value is a controlled prop
 * owned by the parent form and is never touched here, so revealing a password
 * mid-entry cannot clear or alter what was typed.
 *
 * `type` is excluded from the props deliberately: a caller passing
 * `type="text"` would defeat the point of the component.
 */
export function PasswordInput({ className, ...props }: PasswordInputProps) {
  // Always starts hidden. Nothing can pass an initial visible state.
  const [isVisible, setIsVisible] = useState(false);
  const { type, toggleLabel } = passwordFieldState(isVisible);

  return (
    <div className="relative">
      <Input
        {...props}
        type={type}
        /* Room for the control so a long password never runs underneath it. */
        className={`pr-10 ${className ?? ""}`.trim()}
      />

      <button
        type="button"
        onClick={() => setIsVisible((visible) => !visible)}
        /* Describes the action, not the state — a screen reader user hears
           what pressing it will do. aria-pressed carries the current state. */
        aria-label={toggleLabel}
        aria-pressed={isVisible}
        aria-controls={props.id}
        /* Disabled alongside the field it belongs to, so a submitting form
           cannot have a live control over a frozen input. */
        disabled={props.disabled}
        className="absolute inset-y-0 right-0 flex items-center rounded-lg px-2.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
      >
        {isVisible ? (
          <EyeOffIcon className="size-4" aria-hidden="true" />
        ) : (
          <EyeIcon className="size-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
