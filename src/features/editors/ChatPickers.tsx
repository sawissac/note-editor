import {
  IconCheck,
  IconChevronDown,
  IconCpu,
  IconKey,
  IconSettings,
  IconSparkles,
} from "@tabler/icons-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { type ChatProvider, PROVIDERS } from "@/lib/chat-doc";
import { cn } from "@/lib/cn";

type TriggerProps = React.ComponentProps<"button"> & {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: string;
  /** Width class of the value: `wide` for keys and models. */
  wide?: boolean;
  mono?: boolean;
};

/** File-bar button that opens a picker: icon, small label, current value. */
const PickerTrigger = React.forwardRef<HTMLButtonElement, TriggerProps>(
  function PickerTrigger(
    { icon: Icon, label, value, wide, mono, className, ...props },
    ref,
  ) {
    return (
      <Button
        ref={ref}
        type="button"
        variant="outline"
        size="xs"
        className={cn("chat-picker", wide && "chat-picker--wide", className)}
        {...props}
      >
        <Icon aria-hidden className="chat-picker__icon" />
        <span className="chat-picker__label">{label}</span>
        <span
          className={cn(
            "chat-picker__value",
            mono && "chat-picker__value--mono",
          )}
        >
          {value}
        </span>
        <IconChevronDown aria-hidden className="chat-picker__chevron" />
      </Button>
    );
  },
);

export function ProviderPicker({
  value,
  disabled,
  onChange,
}: {
  value: ChatProvider;
  disabled: boolean;
  onChange: (provider: ChatProvider) => void;
}) {
  const current = PROVIDERS.find((p) => p.value === value) ?? PROVIDERS[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <PickerTrigger
          icon={IconSparkles}
          label="Provider"
          value={current.label}
          aria-label={`Provider: ${current.label}`}
          data-testid="chat-pane-provider-trigger"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="chat-picker__menu">
        {PROVIDERS.map((p) => (
          <DropdownMenuItem
            key={p.value}
            className="chat-picker__option"
            data-testid={`chat-pane-provider-${p.value}-item`}
            onSelect={() => onChange(p.value)}
          >
            <span className="chat-picker__option-text">
              <span className="chat-picker__option-title">{p.label}</span>
              <span className="chat-picker__option-sub">
                .{p.extension}
              </span>
            </span>
            {p.value === value ? (
              <IconCheck aria-hidden className="chat-picker__check" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export type KeyChoice = { fileId: string; name: string; path: string };

export function KeyPicker({
  options,
  value,
  disabled,
  onChange,
  onManage,
}: {
  options: KeyChoice[];
  value: { fileId: string; name: string } | undefined;
  disabled: boolean;
  onChange: (choice: KeyChoice) => void;
  /** Opens the key file to add or edit keys. */
  onManage: () => void;
}) {
  const current = options.find(
    (o) => o.fileId === value?.fileId && o.name === value?.name,
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <PickerTrigger
          icon={IconKey}
          label="Key"
          value={current ? current.name : "None"}
          wide
          aria-label={`API key: ${current ? current.name : "none"}`}
          title={current ? `${current.name} · ${current.path}` : undefined}
          data-testid="chat-pane-key-trigger"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="chat-picker__menu">
        {options.map((o) => {
          const selected = o === current;
          return (
            <DropdownMenuItem
              key={`${o.fileId}/${o.name}`}
              className="chat-picker__option"
              data-testid={`chat-pane-key-${o.fileId}-${o.name}-item`}
              onSelect={() => onChange(o)}
            >
              <span className="chat-picker__option-text">
                <span className="chat-picker__option-title">{o.name}</span>
                <span className="chat-picker__option-sub">{o.path}</span>
              </span>
              {selected ? (
                <IconCheck aria-hidden className="chat-picker__check" />
              ) : null}
            </DropdownMenuItem>
          );
        })}
        {options.length ? <div className="chat-picker__divider" /> : null}
        <DropdownMenuItem
          className="chat-picker__option"
          data-testid="chat-pane-key-manage-item"
          onSelect={onManage}
        >
          <IconSettings aria-hidden className="chat-picker__option-icon" />
          <span className="chat-picker__option-title">Manage keys…</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Searchable model list; any typed id can be used even if it is not listed. */
export function ModelPicker({
  value,
  models,
  loading,
  onChange,
}: {
  value: string;
  models: string[];
  loading: boolean;
  onChange: (model: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const typed = query.trim();
  const pick = (model: string) => {
    onChange(model);
    setOpen(false);
    setQuery("");
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <PickerTrigger
          icon={IconCpu}
          label="Model"
          value={value || "Pick a model"}
          wide
          mono
          aria-label={`Model: ${value || "none"}`}
          title={value}
          data-testid="chat-pane-model-trigger"
        />
      </PopoverTrigger>
      <PopoverContent align="end" className="chat-picker__popover">
        <Command>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search or type a model id…"
            data-testid="chat-pane-model-search-input"
          />
          <CommandList
            className="chat-picker__list"
            data-testid="chat-pane-model-list"
          >
            <CommandEmpty className="chat-picker__empty">
              {loading ? "Loading models…" : "No listed model matches."}
            </CommandEmpty>
            {models.length ? (
              <CommandGroup className="chat-picker__group">
                {models.map((model) => (
                  <CommandItem
                    key={model}
                    value={model}
                    className="chat-picker__option"
                    onSelect={() => pick(model)}
                  >
                    <span className="chat-picker__option-mono">{model}</span>
                    {model === value ? (
                      <IconCheck aria-hidden className="chat-picker__check" />
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {typed && !models.includes(typed) ? (
              <CommandGroup className="chat-picker__group">
                <CommandItem
                  value={`__custom__${typed}`}
                  className="chat-picker__option"
                  data-testid="chat-pane-model-custom-item"
                  onSelect={() => pick(typed)}
                >
                  <span className="chat-picker__option-title">
                    Use “{typed}”
                  </span>
                </CommandItem>
              </CommandGroup>
            ) : null}
          </CommandList>
          {models.length ? (
            <p className="chat-picker__footer">
              {models.length} models · type any id to use it
            </p>
          ) : null}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
