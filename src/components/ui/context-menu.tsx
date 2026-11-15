"use client";

import { Check, ChevronRight } from "lucide-react";
import { ContextMenu as ContextMenuPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/cn";

/**
 * Right-click menu in the compacto look — the same panel and rows as
 * `DropdownMenu`, anchored at the pointer instead of a trigger.
 *
 * Wrap the target in {@link ContextMenuTrigger} (`asChild` to keep its own
 * element) and put {@link ContextMenuItem}s in {@link ContextMenuContent}.
 *
 * @example
 * ```tsx
 * <ContextMenu>
 *   <ContextMenuTrigger asChild><div>Row</div></ContextMenuTrigger>
 *   <ContextMenuContent>
 *     <ContextMenuItem onSelect={rename}>Rename<ContextMenuShortcut>F2</ContextMenuShortcut></ContextMenuItem>
 *     <ContextMenuSeparator />
 *     <ContextMenuItem variant="destructive">Delete</ContextMenuItem>
 *   </ContextMenuContent>
 * </ContextMenu>
 * ```
 */
function ContextMenu(
  props: React.ComponentProps<typeof ContextMenuPrimitive.Root>,
) {
  return <ContextMenuPrimitive.Root data-slot="context-menu" {...props} />;
}

function ContextMenuTrigger(
  props: React.ComponentProps<typeof ContextMenuPrimitive.Trigger>,
) {
  return (
    <ContextMenuPrimitive.Trigger data-slot="context-menu-trigger" {...props} />
  );
}

function ContextMenuContent({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Content>) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content
        data-slot="context-menu-content"
        className={cn(
          "z-200 min-w-44 overflow-hidden rounded-lg border border-app-border-mid bg-app-panel p-1 text-app-text",
          "data-[state=open]:animate-[compacto-fade-up_0.15s_ease]",
          className,
        )}
        {...props}
      />
    </ContextMenuPrimitive.Portal>
  );
}

/** @param props.variant - `destructive` tints the row for delete-style actions. */
function ContextMenuItem({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Item> & {
  variant?: "default" | "destructive";
}) {
  return (
    <ContextMenuPrimitive.Item
      data-slot="context-menu-item"
      data-variant={variant}
      className={cn(
        "relative flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-[12px] transition-colors duration-(--motion-duration-fast) outline-none select-none",
        "focus:bg-app-selected focus:text-app-bright",
        "data-disabled:pointer-events-none data-disabled:opacity-50",
        "data-[variant=destructive]:text-app-error data-[variant=destructive]:focus:bg-app-error/10",
        "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

function ContextMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Separator>) {
  return (
    <ContextMenuPrimitive.Separator
      data-slot="context-menu-separator"
      className={cn("-mx-1 my-1 h-px bg-app-border", className)}
      {...props}
    />
  );
}

/** Right-aligned key hint inside an item. */
function ContextMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="context-menu-shortcut"
      className={cn("ml-auto pl-4 font-mono text-[10px] text-app-dim", className)}
      {...props}
    />
  );
}

/**
 * Toggleable row with a leading check. Stays open after a toggle, matching
 * `DropdownMenuCheckboxItem`.
 */
function ContextMenuCheckboxItem({
  className,
  children,
  onSelect,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.CheckboxItem>) {
  return (
    <ContextMenuPrimitive.CheckboxItem
      data-slot="context-menu-checkbox-item"
      onSelect={(e) => {
        e.preventDefault();
        onSelect?.(e);
      }}
      className={cn(
        "relative flex cursor-pointer items-center gap-2 rounded-sm py-1.5 pr-2 pl-7 text-[12px] transition-colors duration-(--motion-duration-fast) outline-none select-none",
        "focus:bg-app-selected focus:text-app-bright",
        "data-disabled:pointer-events-none data-disabled:opacity-50",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <span
        data-slot="context-menu-checkbox-item-indicator"
        className="absolute left-2 grid place-items-center"
      >
        <ContextMenuPrimitive.ItemIndicator>
          <Check className="size-3.5" />
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.CheckboxItem>
  );
}

/** Nested menu root; holds a {@link ContextMenuSubTrigger} and {@link ContextMenuSubContent}. */
function ContextMenuSub(
  props: React.ComponentProps<typeof ContextMenuPrimitive.Sub>,
) {
  return <ContextMenuPrimitive.Sub data-slot="context-menu-sub" {...props} />;
}

/** Row that opens a nested menu, with a trailing chevron. */
function ContextMenuSubTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubTrigger>) {
  return (
    <ContextMenuPrimitive.SubTrigger
      data-slot="context-menu-sub-trigger"
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-[12px] transition-colors duration-(--motion-duration-fast) outline-none select-none",
        "focus:bg-app-selected focus:text-app-bright data-[state=open]:bg-app-selected data-[state=open]:text-app-bright",
        "data-disabled:pointer-events-none data-disabled:opacity-50",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronRight className="ml-auto size-3.5 text-app-dim" />
    </ContextMenuPrimitive.SubTrigger>
  );
}

/** Surface of a nested menu — same panel as {@link ContextMenuContent}. */
function ContextMenuSubContent({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubContent>) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.SubContent
        data-slot="context-menu-sub-content"
        className={cn(
          "z-200 min-w-44 overflow-hidden rounded-lg border border-app-border-mid bg-app-panel p-1 text-app-text",
          "data-[state=open]:animate-[compacto-fade-up_0.15s_ease]",
          className,
        )}
        {...props}
      />
    </ContextMenuPrimitive.Portal>
  );
}

export {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
};
