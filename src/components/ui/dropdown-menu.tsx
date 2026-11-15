"use client";

import { Check, ChevronRight, Circle } from "lucide-react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/cn";

/**
 * Menu root. Compose with {@link DropdownMenuTrigger},
 * {@link DropdownMenuContent} and {@link DropdownMenuItem} (or
 * {@link DropdownMenuCheckboxItem} for a multi-select).
 *
 * @example
 * ```tsx
 * <DropdownMenu>
 *   <DropdownMenuTrigger asChild>
 *     <Button variant="ghost" size="icon-sm" aria-label="More"><MoreVertical size={14} /></Button>
 *   </DropdownMenuTrigger>
 *   <DropdownMenuContent>
 *     <DropdownMenuItem onSelect={rename}>Rename</DropdownMenuItem>
 *     <DropdownMenuItem variant="destructive" onSelect={remove}>Delete</DropdownMenuItem>
 *   </DropdownMenuContent>
 * </DropdownMenu>
 * ```
 */
function DropdownMenu(
  props: React.ComponentProps<typeof DropdownMenuPrimitive.Root>,
) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

/**
 * The control that opens the menu. Pass `asChild` to keep your own element —
 * `Button` picks up the open state through `aria-expanded` and holds its hover
 * fill while the menu is showing.
 */
function DropdownMenuTrigger(
  props: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>,
) {
  return (
    <DropdownMenuPrimitive.Trigger
      data-slot="dropdown-menu-trigger"
      {...props}
    />
  );
}

/**
 * The floating menu surface.
 *
 * @param props.align - Alignment against the trigger. Defaults to `"end"`,
 *   since a menu button usually sits at the right edge of its row.
 * @param props.sideOffset - Gap between trigger and menu, in px. Default 4.
 * @param props.className - Extra classes merged onto the surface.
 */
function DropdownMenuContent({
  className,
  sideOffset = 4,
  align = "end",
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        align={align}
        className={cn(
          "z-200 min-w-32 overflow-hidden rounded-lg border border-app-border-mid bg-app-panel p-1 text-app-text",
          "data-[state=open]:animate-[compacto-fade-up_0.15s_ease]",
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

/**
 * One menu action.
 *
 * @param props.variant - `"destructive"` tints the row for delete-style
 *   actions. It is a tint, not a solid red block — a menu of ten rows with one
 *   filled red bar reads as an error state rather than an option.
 * @param props.inset - Indents the label to line up with checkbox/radio rows.
 * @param props.className - Extra classes merged onto the row.
 */
function DropdownMenuItem({
  className,
  variant = "default",
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  variant?: "default" | "destructive";
  inset?: boolean;
}) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-variant={variant}
      data-inset={inset}
      className={cn(
        "relative flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors duration-(--motion-duration-fast) outline-none select-none",
        "focus:bg-app-selected focus:text-app-bright",
        "data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50",
        "data-[variant=destructive]:text-app-error data-[variant=destructive]:focus:bg-app-error/10",
        "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Toggleable row with a leading check indicator, for multi-select menus.
 *
 * Deliberately stays open after a toggle: the whole reason to use checkbox
 * items is to pick several things in one pass, and a menu that closes on the
 * first click makes the caller reopen it for every option.
 *
 * @param props.checked - Controlled checked state.
 * @param props.onSelect - Runs after the default keep-open behaviour; the
 *   event is already `preventDefault`ed when it reaches you.
 * @param props.className - Extra classes merged onto the row.
 */
function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  onSelect,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      checked={checked}
      onSelect={(e) => {
        // Keep the menu open while toggling multiple targets.
        e.preventDefault();
        onSelect?.(e);
      }}
      className={cn(
        "relative flex cursor-pointer items-center gap-2 rounded-sm py-1.5 pr-2 pl-7 text-sm transition-colors duration-(--motion-duration-fast) outline-none select-none",
        "focus:bg-app-selected focus:text-app-bright",
        "data-disabled:pointer-events-none data-disabled:opacity-50",
        "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 grid place-items-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check className="size-3.5" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

/** Groups related items; pair with {@link DropdownMenuLabel} for a heading. */
function DropdownMenuGroup(
  props: React.ComponentProps<typeof DropdownMenuPrimitive.Group>,
) {
  return (
    <DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
  );
}

/**
 * Non-interactive section heading inside the menu, in the compacto section
 * label style (11px, uppercase, tracked, dim).
 *
 * @param props.inset - Indents to line up with checkbox/radio rows.
 */
function DropdownMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label> & {
  inset?: boolean;
}) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(
        "px-2 py-1.5 font-title text-[11px] font-semibold tracking-[0.08em] text-app-dim uppercase data-inset:pl-7",
        className,
      )}
      {...props}
    />
  );
}

/** Hairline rule between groups of items. */
function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("-mx-1 my-1 h-px bg-app-border", className)}
      {...props}
    />
  );
}

/** Right-aligned key hint inside an item. */
function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        "ml-auto pl-4 font-mono text-[10px] text-app-dim",
        className,
      )}
      {...props}
    />
  );
}

/** Single-choice set of {@link DropdownMenuRadioItem}s. */
function DropdownMenuRadioGroup(
  props: React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>,
) {
  return (
    <DropdownMenuPrimitive.RadioGroup
      data-slot="dropdown-menu-radio-group"
      {...props}
    />
  );
}

/**
 * One option of a {@link DropdownMenuRadioGroup}, with a leading dot on the
 * selected row. Closes the menu on select, like a plain item.
 */
function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
  return (
    <DropdownMenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      className={cn(
        "relative flex cursor-pointer items-center gap-2 rounded-sm py-1.5 pr-2 pl-7 text-sm transition-colors duration-(--motion-duration-fast) outline-none select-none",
        "focus:bg-app-selected focus:text-app-bright",
        "data-disabled:pointer-events-none data-disabled:opacity-50",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <span
        data-slot="dropdown-menu-radio-item-indicator"
        className="absolute left-2 grid place-items-center"
      >
        <DropdownMenuPrimitive.ItemIndicator>
          <Circle className="size-2 fill-current text-app-accent" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
}

/** Nested menu root; holds a {@link DropdownMenuSubTrigger} and {@link DropdownMenuSubContent}. */
function DropdownMenuSub(
  props: React.ComponentProps<typeof DropdownMenuPrimitive.Sub>,
) {
  return <DropdownMenuPrimitive.Sub data-slot="dropdown-menu-sub" {...props} />;
}

/**
 * Row that opens a nested menu, with a trailing chevron.
 *
 * @param props.inset - Indents to line up with checkbox/radio rows.
 */
function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger> & {
  inset?: boolean;
}) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors duration-(--motion-duration-fast) outline-none select-none",
        "focus:bg-app-selected focus:text-app-bright data-[state=open]:bg-app-selected data-[state=open]:text-app-bright",
        "data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronRight className="ml-auto size-3.5 text-app-dim" />
    </DropdownMenuPrimitive.SubTrigger>
  );
}

/** Surface of a nested menu — same panel as {@link DropdownMenuContent}. */
function DropdownMenuSubContent({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.SubContent
        data-slot="dropdown-menu-sub-content"
        className={cn(
          "z-200 min-w-32 overflow-hidden rounded-lg border border-app-border-mid bg-app-panel p-1 text-app-text",
          "data-[state=open]:animate-[compacto-fade-up_0.15s_ease]",
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
};
