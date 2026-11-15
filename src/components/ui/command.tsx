"use client";

import { Command as CommandPrimitive } from "cmdk";
import { SearchIcon } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Filterable command list over `cmdk`. Compose with {@link CommandInput},
 * {@link CommandList}, {@link CommandGroup} and {@link CommandItem}; wrap the
 * lot in {@link CommandDialog} for a command-palette overlay.
 *
 * `cmdk` is an optional peer dependency — installing it is only required if you
 * import this module.
 *
 * @param props.className - Extra classes merged onto the root.
 */
function Command({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        "bg-app-panel text-app-text flex h-full w-full flex-col overflow-hidden rounded-md",
        className,
      )}
      {...props}
    />
  );
}

/**
 * A {@link Command} in a dialog — the ⌘K palette shape.
 *
 * The title and description exist for screen readers and are visually hidden:
 * a palette is self-evident to anyone who can see it and needs a name for
 * anyone who cannot. Both are props with English defaults, since a published
 * library cannot reach an app's translation function.
 *
 * @param props.title - Accessible name for the dialog.
 * @param props.description - Accessible description for the dialog.
 * @param props.className - Extra classes merged onto the dialog panel; the
 *   usual reason is a different width than the default 560px.
 * @param props.contentProps - Passed to the dialog panel, e.g.
 *   `onCloseAutoFocus` to decide where focus goes once it closes.
 * @param props.density - `comfortable` (default) for roomy 48px rows;
 *   `compact` for dense ~28px rows that fit about twice as many results.
 * @param props.commandProps - Passed to the inner {@link Command}, e.g.
 *   `shouldFilter={false}` to filter and rank items yourself.
 *
 * @example
 * ```tsx
 * <CommandDialog open={open} onOpenChange={setOpen} title="Commands">
 *   <CommandInput placeholder="Type a command…" />
 *   <CommandList>
 *     <CommandEmpty>No results.</CommandEmpty>
 *     <CommandGroup heading="Actions">
 *       <CommandItem onSelect={run}>Run request</CommandItem>
 *     </CommandGroup>
 *   </CommandList>
 * </CommandDialog>
 * ```
 */
const DIALOG_DENSITY = {
  comfortable:
    "[&_[cmdk-group-heading]]:text-app-dim **:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5",
  compact:
    "[&_[cmdk-group-heading]]:text-app-dim **:data-[slot=command-input-wrapper]:h-10 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-1.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group]]:px-1 [&_[cmdk-group]]:py-0.5 [&_[cmdk-input-wrapper]_svg]:size-4 [&_[cmdk-input]]:h-10 [&_[cmdk-input]]:text-[13px] [&_[cmdk-item]]:h-7 [&_[cmdk-item]]:gap-1.5 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-0 [&_[cmdk-item]]:text-[12px] [&_[cmdk-item]_svg]:size-3.5 [&_[cmdk-list]]:max-h-[min(440px,60vh)]",
} as const;

function CommandDialog({
  title = "Command Palette",
  description = "Search for a command to run...",
  children,
  className,
  contentProps,
  commandProps,
  density = "comfortable",
  ...props
}: React.ComponentProps<typeof Dialog> & {
  title?: string;
  density?: keyof typeof DIALOG_DENSITY;
  description?: string;
  className?: string;
  contentProps?: Omit<
    React.ComponentProps<typeof DialogContent>,
    "className" | "children"
  > & {
    "data-testid"?: string;
  };
  commandProps?: Omit<
    React.ComponentProps<typeof Command>,
    "className" | "children"
  >;
}) {
  return (
    <Dialog {...props}>
      <DialogHeader className="sr-only" showCloseButton={false}>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogContent
        className={cn("w-[min(560px,92vw)]", className)}
        {...contentProps}
      >
        <Command {...commandProps} className={DIALOG_DENSITY[density]}>
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The search field. Renders its own wrapper with a leading magnifier and a
 * hairline rule beneath.
 *
 * @param props.placeholder - Prompt shown while the field is empty.
 * @param props.className - Extra classes merged onto the `<input>`.
 */
function CommandInput({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div
      data-slot="command-input-wrapper"
      className="border-app-border flex h-9 items-center gap-2 border-b px-3"
    >
      <SearchIcon className="size-4 shrink-0 opacity-50" />
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          "placeholder:text-app-dim flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    </div>
  );
}

/** Scrollable results region. Caps at 300px and scrolls rather than growing. */
function CommandList({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn(
        "max-h-[300px] scroll-py-1 overflow-x-hidden overflow-y-auto",
        className,
      )}
      {...props}
    />
  );
}

/** Shown when the filter matches nothing. Provide your own copy as children. */
function CommandEmpty({
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className="py-6 text-center text-sm"
      {...props}
    />
  );
}

/**
 * A titled section of items.
 *
 * @param props.heading - Section label. Hidden automatically when the filter
 *   empties the group.
 */
function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        "text-app-text [&_[cmdk-group-heading]]:text-app-dim overflow-hidden p-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium",
        className,
      )}
      {...props}
    />
  );
}

/** Divider between groups. */
function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn("bg-app-border -mx-1 h-px", className)}
      {...props}
    />
  );
}

/**
 * One result row.
 *
 * @param props.value - The string `cmdk` filters against; defaults to the
 *   row's text content.
 * @param props.onSelect - Runs on click or Enter.
 * @param props.className - Extra classes merged onto the row.
 */
function CommandItem({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        "data-[selected=true]:bg-app-selected data-[selected=true]:text-app-bright [&_svg:not([class*='text-'])]:text-app-dim relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

/** Right-aligned keyboard hint inside a {@link CommandItem}. */
function CommandShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn("text-app-dim ml-auto text-xs tracking-widest", className)}
      {...props}
    />
  );
}

export {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
};
