"use client"

import * as React from "react"
import { FileBarSlot } from "@/features/editors/file-bar-slot"
import { ToolbarGroups } from "@/components/ui/toolbar-group"
import {
  useRegisterDocumentBytes,
  useReportDocumentChange,
} from "@/features/editors/save-bridge"
import {
  DocxEditorViewer,
  paragraphLetterheadFloatSideAtNodeIndex,
  useDocxBorders,
  useDocxComments,
  useDocxDocumentTheme,
  useDocxEditor,
  useDocxLineSpacing,
  useDocxPageLayout,
  useDocxParagraphStyles,
  useDocxTrackChanges,
  useDocxViewerThumbnails,
  type DocxBorderContext,
  type DocxBorderPreset,
  type DocxContextMenuRenderProps,
  type DocxDocumentTheme,
  type DocxEditorController,
  type ParagraphStyleDefinition,
} from "@extend-ai/react-docx"
import { ScrollArea as ScrollAreaPrimitive } from "radix-ui"
import { createPortal } from "react-dom"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
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
} from "@/components/ui/context-menu"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  ScrollArea as InlineScrollArea,
  ScrollBar,
} from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ColorPicker } from "@/components/extend/document-color-picker"
import {
  PreviewCard,
  PreviewCardContent,
  PreviewCardTrigger,
} from "@/components/extend/document-preview-card"
import {
  DocumentViewerThumbnailSidebar,
  useElementWidth,
  useInlineThumbnailSidebar,
} from "@/components/extend/document-viewer-sidebar"
import {
  createDocxCommentCardRenderer,
  createDocxTrackedChangeCardRenderer,
} from "@/components/extend/docx-annotation-card"
import { FileThumbnail } from "@/components/extend/file-thumbnail"
import {
  dispatchSyntheticPointer,
  useTouchSelectionGuard,
} from "@/components/extend/document-touch"
import { BREAKPOINT, useMediaQuery } from "@/lib/use-media-query"
import "@/styles/office-touch.css"
import { IconArrowDownRight, IconArrowUpRight, IconBorderAll, IconBorderBottom, IconBorderHorizontal, IconBorderInner, IconBorderLeft, IconBorderNone, IconBorderRight, IconBorderTop, IconBorderVertical, IconMinus, IconMoon, IconSun, IconTextColor, IconLayoutSidebar, IconFileDiff, IconMessage, IconPencilOff, IconUpload, IconDownload, IconArrowBackUp, IconArrowForwardUp, IconBold, IconItalic, IconUnderline, IconStrikethrough, IconSuperscript, IconSubscript, IconHighlight, IconLink, IconAlignLeft, IconAlignCenter, IconAlignRight, IconAlignJustified, IconList, IconListNumbers, IconPencil, IconPhotoPlus, IconTable, IconColumns3, IconCircleMinus, IconCirclePlus, IconLoader2 } from "@tabler/icons-react"

function DocxContextMenuItems({
  actions,
  runAction,
}: Pick<DocxContextMenuRenderProps, "actions" | "runAction">) {
  return actions.map((action, index) => {
    const content = (
      <>
        {action.label}
        {action.shortcut ? (
          <ContextMenuShortcut>{action.shortcut}</ContextMenuShortcut>
        ) : null}
      </>
    )
    const children = action.children
    return (
      <React.Fragment key={action.id}>
        {action.separatorBefore && index > 0 ? <ContextMenuSeparator /> : null}
        {children?.length ? (
          <ContextMenuSub>
            <ContextMenuSubTrigger disabled={action.disabled}>
              {content}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent data-docx-context-menu="true">
              <DocxContextMenuItems actions={children} runAction={runAction} />
            </ContextMenuSubContent>
          </ContextMenuSub>
        ) : typeof action.checked === "boolean" ? (
          <ContextMenuCheckboxItem
            checked={action.checked}
            disabled={action.disabled}
            onClick={() => runAction(action.id)}
          >
            {content}
          </ContextMenuCheckboxItem>
        ) : (
          <ContextMenuItem
            disabled={action.disabled}
            variant={action.destructive ? "destructive" : "default"}
            onClick={() => runAction(action.id)}
          >
            {content}
          </ContextMenuItem>
        )}
      </React.Fragment>
    )
  })
}
function DocxEditorContextMenu({
  actions,
  runAction,
  closeMenu,
  position,
}: DocxContextMenuRenderProps) {
  const triggerRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    triggerRef.current?.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX: position.x,
        clientY: position.y,
      })
    )
  }, [position.x, position.y])
  return createPortal(
    <ContextMenu onOpenChange={(open) => !open && closeMenu()}>
      <ContextMenuTrigger
        ref={triggerRef}
        aria-hidden="true"
        data-docx-context-menu="true"
        className="pointer-events-none fixed size-px opacity-0"
        style={{ left: position.x, top: position.y }}
      />
      <ContextMenuContent
        aria-label="Document actions"
        data-docx-context-menu="true"
        className="min-w-56"
      >
        <DocxContextMenuItems actions={actions} runAction={runAction} />
      </ContextMenuContent>
    </ContextMenu>,
    document.body
  )
}
// Layer ordering only acts on floating images and does nothing visible for
// inline ones, so the menu leaves it out.
const HIDDEN_CONTEXT_MENU_ACTIONS = new Set([
  "image-bring-to-front",
  "image-bring-forward",
  "image-send-to-back",
  "image-send-backward",
])
function renderDocxContextMenu(props: DocxContextMenuRenderProps) {
  const actions = props.actions.filter(
    (action) => !HIDDEN_CONTEXT_MENU_ACTIONS.has(action.id)
  )
  return <DocxEditorContextMenu {...props} actions={actions} />
}
function ArrowExpandDiagonal01Glyph(props: InlineRegistryIconProps) {
  return (
    <IconArrowDownRight {...props} />
  )
}
function ArrowExpandDiagonal02Glyph(props: InlineRegistryIconProps) {
  return (
    <IconArrowUpRight {...props} />
  )
}
function BorderAll01Glyph(props: InlineRegistryIconProps) {
  return (
    <IconBorderAll {...props} />
  )
}
function BorderBottom01Glyph(props: InlineRegistryIconProps) {
  return (
    <IconBorderBottom {...props} />
  )
}
function BorderHorizontalGlyph(props: InlineRegistryIconProps) {
  return (
    <IconBorderHorizontal {...props} />
  )
}
function BorderInnerGlyph(props: InlineRegistryIconProps) {
  return (
    <IconBorderInner {...props} />
  )
}
function BorderLeft01Glyph(props: InlineRegistryIconProps) {
  return (
    <IconBorderLeft {...props} />
  )
}
function BorderNone01Glyph(props: InlineRegistryIconProps) {
  return (
    <IconBorderNone {...props} />
  )
}
function BorderRight01Glyph(props: InlineRegistryIconProps) {
  return (
    <IconBorderRight {...props} />
  )
}
function BorderTop01Glyph(props: InlineRegistryIconProps) {
  return (
    <IconBorderTop {...props} />
  )
}
function BorderVerticalGlyph(props: InlineRegistryIconProps) {
  return (
    <IconBorderVertical {...props} />
  )
}
function LineGlyph(props: InlineRegistryIconProps) {
  return (
    <IconMinus {...props} />
  )
}
function Moon02Glyph(props: InlineRegistryIconProps) {
  return (
    <IconMoon {...props} />
  )
}
function Sun03Glyph(props: InlineRegistryIconProps) {
  return (
    <IconSun {...props} />
  )
}
function TextColorGlyph(props: InlineRegistryIconProps) {
  return (
    <IconTextColor {...props} />
  )
}
const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
const DOCX_LOADING_INDICATOR_DELAY_MS = 300
const DOCX_THUMBNAIL_WIDTH = 92
const DOCX_EDITOR_DEFAULT_ZOOM_SCALE = 100

/**
 * The editor opens a typing session only when a paragraph line itself is
 * clicked. An empty document is a single 17px line, so clicks anywhere else
 * on the page did nothing. This replays the click on a paragraph instead —
 * at its start or the end of its last line — so the caret lands there.
 */
function placeCaretInParagraph(host: HTMLElement, at: "start" | "end") {
  host.scrollIntoView({ block: "nearest" })
  const rect = host.getBoundingClientRect()
  const lineHeight = Number(host.dataset.docxParagraphLineHeight) || 16
  const x = at === "end" ? rect.right - 2 : rect.left + 1
  const y =
    at === "end" ? rect.bottom - lineHeight / 2 : rect.top + lineHeight / 2
  const hit = document.elementFromPoint(x, y)
  const target = hit && host.contains(hit) ? hit : host
  const init = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX: x,
    clientY: y,
    button: 0,
    detail: 1,
  }
  const pointer = { ...init, pointerId: 1, pointerType: "mouse", isPrimary: true }
  // Safe dispatch: a touch-only device has no mouse pointer 1, so the
  // editor's setPointerCapture(1) would throw and abort the caret placement.
  dispatchSyntheticPointer(target, new PointerEvent("pointerdown", { ...pointer, buttons: 1 }))
  target.dispatchEvent(new MouseEvent("mousedown", { ...init, buttons: 1 }))
  dispatchSyntheticPointer(target, new PointerEvent("pointerup", { ...pointer, buttons: 0 }))
  target.dispatchEvent(new MouseEvent("mouseup", { ...init, buttons: 0 }))
  target.dispatchEvent(new MouseEvent("click", { ...init, buttons: 0 }))
}

const DOCX_PARAGRAPH_HOST = "[data-docx-paragraph-host]"

/** Top-level body paragraph hosts (not table cells), keyed by node index. */
function bodyParagraphHosts(root: ParentNode) {
  const byIndex = new Map<number, HTMLElement>()
  for (const host of root.querySelectorAll<HTMLElement>(DOCX_PARAGRAPH_HOST)) {
    if (host.closest("table")) continue
    const index = Number(host.dataset.docxParagraphNodeIndex)
    if (Number.isFinite(index) && !byIndex.has(index)) byIndex.set(index, host)
  }
  return byIndex
}

function adjacentParagraph(
  root: ParentNode,
  index: number,
  direction: 1 | -1
): HTMLElement | undefined {
  let best: [number, HTMLElement] | undefined
  for (const [i, host] of bodyParagraphHosts(root)) {
    const ahead = direction === 1 ? i > index : i < index
    const closer = !best || (direction === 1 ? i < best[0] : i > best[0])
    if (ahead && closer) best = [i, host]
  }
  return best?.[1]
}

/**
 * The editor types into a hidden per-paragraph textarea. In this version it
 * drops the caret after Enter (the new paragraph never gets focus) and never
 * moves between paragraphs with the arrow keys. Watch those keys and, when
 * the editor left the caret stranded, move it to the paragraph the user
 * expects.
 */
function handleParagraphNavKeyDown(event: React.KeyboardEvent<HTMLElement>) {
  if (event.nativeEvent.isComposing || event.altKey || event.metaKey || event.ctrlKey) {
    return
  }
  const key = event.key
  if (!["Enter", "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(key)) return
  if (key === "Enter" && event.shiftKey) return
  const textarea = event.target
  if (!(textarea instanceof HTMLTextAreaElement)) return
  const host = textarea.closest<HTMLElement>(DOCX_PARAGRAPH_HOST)
  if (!host || host.closest("table")) return
  const index = Number(host.dataset.docxParagraphNodeIndex)
  if (!Number.isFinite(index)) return
  const root = event.currentTarget
  const { selectionStart: start, selectionEnd: end, value } = textarea
  const collapsed = start === end
  if (key === "ArrowLeft" && !(collapsed && start === 0)) return
  if (key === "ArrowRight" && !(collapsed && end === value.length)) return
  if (event.shiftKey && key !== "Enter") return

  let frames = 0
  const check = () => {
    const active = document.activeElement
    const stillHere =
      active === textarea && textarea.selectionStart === start && textarea.selectionEnd === end
    if (key === "Enter") {
      if (active instanceof HTMLTextAreaElement && root.contains(active)) return
      const next = adjacentParagraph(root, index, 1)
      if (next) placeCaretInParagraph(next, "start")
      else if (frames++ < 10) requestAnimationFrame(check)
      return
    }
    if (!stillHere) return
    const forward = key === "ArrowDown" || key === "ArrowRight"
    const target = adjacentParagraph(root, index, forward ? 1 : -1)
    if (target) placeCaretInParagraph(target, forward ? "start" : "end")
  }
  // Two frames: let the editor apply its own handling first.
  requestAnimationFrame(() => requestAnimationFrame(check))
}

const DOCX_TOUCH_UNGUARDED =
  "a,button,input,textarea,select,[role='button'],[contenteditable='true'],[data-docx-image-location],[data-docx-drop-cap='true'],[data-docx-table-move-handle='true'],[data-image-resize-handle='true'],[data-docx-form-field='true'],[data-docx-context-menu]"

/** Presses on page text the editor would turn into a drag-selection. */
function isDocxTouchSelectionTarget(target: Element) {
  return Boolean(
    target.closest("[data-docx-page-wrapper]") &&
      !target.closest(DOCX_TOUCH_UNGUARDED)
  )
}

/**
 * Mouse-down on a page's blank area (margins, below the last line): put the
 * caret in the nearest paragraph above the click, or at the start of the
 * first one when the click is above all text.
 */
function handleBlankPageMouseDown(event: React.MouseEvent) {
  if (event.button !== 0) return
  const target = event.target as HTMLElement
  if (
    target.closest(
      `${DOCX_PARAGRAPH_HOST}, textarea, input, button, a, img, svg, table, [contenteditable="true"]`
    )
  ) {
    return
  }
  const page = target.closest<HTMLElement>("[data-docx-page-wrapper]")
  if (!page) return
  const hosts = Array.from(page.querySelectorAll<HTMLElement>(DOCX_PARAGRAPH_HOST))
  if (hosts.length === 0) return
  let pick: HTMLElement | null = null
  for (const host of hosts) {
    if (host.getBoundingClientRect().top <= event.clientY) pick = host
  }
  // Capture phase: keep the editor's own handlers from seeing this click
  // (they would clear the caret we are about to place).
  event.preventDefault()
  event.stopPropagation()
  const host = pick ?? hosts[0]
  requestAnimationFrame(() =>
    placeCaretInParagraph(host, pick ? "end" : "start")
  )
}
const ZOOM_OPTIONS = [50, 75, 90, 100, 110, 125, 150, 175, 200] as const
const FONT_FAMILIES = [
  "Calibri",
  "Arial",
  "Times New Roman",
  "Georgia",
  "Helvetica",
  "Courier New",
] as const
const FONT_SIZE_OPTIONS = [
  8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48,
] as const
const LINE_SPACING_OPTIONS = [1, 1.15, 1.2, 1.5, 2, 2.5, 3] as const
const FALLBACK_PARAGRAPH_STYLE_OPTIONS = [
  { id: "Normal", name: "Body" },
  { id: "Heading1", name: "Heading 1" },
  { id: "Heading2", name: "Heading 2" },
  { id: "Heading3", name: "Heading 3" },
] as const
const HIGHLIGHT_COLORS = [
  { label: "Yellow", value: "yellow", color: "#fff59d" },
  { label: "Green", value: "green", color: "#bbf7d0" },
  { label: "Cyan", value: "cyan", color: "#a5f3fc" },
  { label: "Magenta", value: "magenta", color: "#f5d0fe" },
  { label: "Red", value: "red", color: "#fecaca" },
  { label: "Blue", value: "blue", color: "#bfdbfe" },
] as const
const HIGHLIGHT_PREVIEW_COLORS: Record<string, string> = {
  black: "#111827",
  white: "#ffffff",
  ...Object.fromEntries(
    HIGHLIGHT_COLORS.map((option) => [option.value, option.color])
  ),
}
const DOCX_PADDING_WARNING_TEXT = "a style property during rerender"
const DEFAULT_HEADING_PREVIEW_RUN_STYLES: Record<
  1 | 2 | 3 | 4 | 5 | 6,
  NonNullable<ParagraphStyleDefinition["runStyle"]>
> = {
  1: {
    fontFamily: "Calibri Light",
    fontSizePt: 16,
    bold: true,
    color: "#2f5496",
  },
  2: {
    fontFamily: "Calibri Light",
    fontSizePt: 13,
    bold: true,
    color: "#2f5496",
  },
  3: {
    fontFamily: "Calibri",
    fontSizePt: 12,
    bold: true,
    color: "#1f3763",
  },
  4: {
    fontFamily: "Calibri",
    fontSizePt: 11,
    bold: true,
    color: "#1f3763",
  },
  5: {
    fontFamily: "Calibri",
    fontSizePt: 11,
    bold: true,
    color: "#1f3763",
  },
  6: {
    fontFamily: "Calibri",
    fontSizePt: 11,
    bold: true,
    color: "#1f3763",
  },
}
type UploadedDocxFile = {
  file: File
  identity: string
}
type BorderControlOption = {
  id: DocxBorderPreset
  label: string
  contexts?: DocxBorderContext[]
  separatorBefore?: boolean
}
type DocxFontToggleValue =
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "superscript"
  | "subscript"
const BORDER_CONTROL_OPTIONS: BorderControlOption[] = [
  { id: "bottom", label: "Bottom Border" },
  { id: "top", label: "Top Border" },
  { id: "left", label: "Left Border" },
  { id: "right", label: "Right Border" },
  { id: "none", label: "No Border", separatorBefore: true },
  { id: "all", label: "All Borders" },
  { id: "outside", label: "Outside Borders" },
  { id: "inside", label: "Inside Borders", contexts: ["table"] },
  {
    id: "inside-horizontal",
    label: "Inside Horizontal Border",
    contexts: ["table"],
  },
  {
    id: "inside-vertical",
    label: "Inside Vertical Border",
    contexts: ["table"],
  },
  {
    id: "diagonal-down",
    label: "Diagonal Down Border",
    contexts: ["table"],
    separatorBefore: true,
  },
  { id: "diagonal-up", label: "Diagonal Up Border", contexts: ["table"] },
  { id: "horizontal-line", label: "Horizontal Line", separatorBefore: true },
]
function borderControlOptionIcon(optionId: DocxBorderPreset) {
  switch (optionId) {
    case "bottom":
      return BorderBottom01Glyph
    case "top":
      return BorderTop01Glyph
    case "left":
      return BorderLeft01Glyph
    case "right":
      return BorderRight01Glyph
    case "none":
      return BorderNone01Glyph
    case "inside":
      return BorderInnerGlyph
    case "inside-horizontal":
      return BorderHorizontalGlyph
    case "inside-vertical":
      return BorderVerticalGlyph
    case "diagonal-down":
      return ArrowExpandDiagonal01Glyph
    case "diagonal-up":
      return ArrowExpandDiagonal02Glyph
    case "horizontal-line":
      return LineGlyph
    default:
      return BorderAll01Glyph
  }
}
async function loadDocxFile(
  url: string,
  displayFileName: string
): Promise<File> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch DOCX (${response.status})`)
  }
  const blob = await response.blob()
  return new File([blob], displayFileName, {
    type: blob.type || DOCX_MIME_TYPE,
  })
}
function formatDocumentName(fileName: string | undefined, url: string) {
  if (fileName?.trim()) return fileName
  const pathname = url.split("?")[0] ?? ""
  const rawName = pathname.split("/").pop() ?? "document.docx"
  try {
    return decodeURIComponent(rawName)
  } catch {
    return rawName
  }
}
function getNextZoomScale(currentZoomScale: number, direction: 1 | -1) {
  const currentIndex = ZOOM_OPTIONS.indexOf(
    currentZoomScale as (typeof ZOOM_OPTIONS)[number]
  )
  let fallbackIndex = -1
  if (direction > 0) {
    fallbackIndex = ZOOM_OPTIONS.findIndex((value) => value > currentZoomScale)
  } else {
    for (let index = ZOOM_OPTIONS.length - 1; index >= 0; index -= 1) {
      if (ZOOM_OPTIONS[index] < currentZoomScale) {
        fallbackIndex = index
        break
      }
    }
  }
  const resolvedIndex = currentIndex >= 0 ? currentIndex : fallbackIndex
  if (resolvedIndex < 0) return currentZoomScale
  const nextIndex = Math.min(
    Math.max(resolvedIndex + direction, 0),
    ZOOM_OPTIONS.length - 1
  )
  return ZOOM_OPTIONS[nextIndex] ?? currentZoomScale
}
function normalizeDocxZoomScale(value: number | undefined): number {
  return typeof value === "number" &&
    ZOOM_OPTIONS.includes(value as (typeof ZOOM_OPTIONS)[number])
    ? value
    : DOCX_EDITOR_DEFAULT_ZOOM_SCALE
}
function useDelayedLoadingIndicator(isLoading: boolean, delayMs: number) {
  const [showSpinner, setShowSpinner] = React.useState(false)
  const [previousIsLoading, setPreviousIsLoading] = React.useState(isLoading)
  if (previousIsLoading !== isLoading) {
    setPreviousIsLoading(isLoading)
    setShowSpinner(false)
  }
  React.useEffect(() => {
    if (!isLoading) return
    const timeoutId = window.setTimeout(() => {
      setShowSpinner(true)
    }, delayMs)
    return () => window.clearTimeout(timeoutId)
  }, [delayMs, isLoading])
  return isLoading && showSpinner
}
function isDocxPaddingWarning(args: unknown[]) {
  return (
    typeof args[0] === "string" &&
    args[0].includes(DOCX_PADDING_WARNING_TEXT) &&
    args.some((arg) => String(arg).includes("padding"))
  )
}
function useSuppressDocxPaddingWarning(enabled: boolean) {
  React.useEffect(() => {
    if (!enabled) return
    const originalConsoleError = console.error
    console.error = (...args: unknown[]) => {
      if (isDocxPaddingWarning(args)) return
      originalConsoleError(...args)
    }
    return () => {
      console.error = originalConsoleError
    }
  }, [enabled])
}
function normalizeHexColor(value?: string, fallback = "#111827") {
  if (!value) return fallback
  const trimmed = value.trim()
  const threeDigit = /^#([0-9a-f]{3})$/i.exec(trimmed)
  if (threeDigit?.[1]) {
    const [red, green, blue] = threeDigit[1].split("")
    return `#${red}${red}${green}${green}${blue}${blue}`.toLowerCase()
  }
  const sixDigit = /^#([0-9a-f]{6})$/i.exec(trimmed)
  if (sixDigit?.[1]) {
    return `#${sixDigit[1].toLowerCase()}`
  }
  return fallback
}
function inferParagraphStyleHeadingLevel(value?: string) {
  if (!value) return undefined
  const match = value.match(/(?:^|[\s_-])(?:heading|h)\s*([1-6])(?:$|[\s_-])/i)
  const level = match?.[1] ? Number(match[1]) : NaN
  return level >= 1 && level <= 6 ? (level as 1 | 2 | 3 | 4 | 5 | 6) : undefined
}
function resolveParagraphStyleHeadingLevel(option?: ParagraphStyleDefinition) {
  if (
    Number.isFinite(option?.headingLevel) &&
    option?.headingLevel &&
    option.headingLevel >= 1 &&
    option.headingLevel <= 6
  ) {
    return option.headingLevel as 1 | 2 | 3 | 4 | 5 | 6
  }
  return (
    inferParagraphStyleHeadingLevel(option?.id) ??
    inferParagraphStyleHeadingLevel(option?.name)
  )
}
function resolveParagraphStyleRunPreview(option?: ParagraphStyleDefinition) {
  if (!option) return undefined
  const headingLevel = resolveParagraphStyleHeadingLevel(option)
  const headingRunStyle = headingLevel
    ? DEFAULT_HEADING_PREVIEW_RUN_STYLES[headingLevel]
    : undefined
  return headingRunStyle
    ? {
        ...headingRunStyle,
        ...(option.runStyle ?? {}),
      }
    : option.runStyle
}
function resolveHighlightPreview(value?: string) {
  if (!value) return undefined
  const normalized = value.trim().toLowerCase()
  if (!normalized) return undefined
  const hex = normalizeHexColor(normalized, "")
  if (hex) return hex
  return HIGHLIGHT_PREVIEW_COLORS[normalized]
}
function themedPreviewColor(
  color: string | undefined,
  documentTheme: DocxDocumentTheme
) {
  if (documentTheme !== "dark") return color
  if (!color) return "#f3f4f6"
  const normalized = color.trim().toLowerCase()
  if (
    normalized === "#000" ||
    normalized === "#000000" ||
    normalized === "#111111" ||
    normalized === "#111827" ||
    normalized === "black" ||
    normalized === "rgb(0,0,0)" ||
    normalized === "rgb(0, 0, 0)"
  ) {
    return "#f3f4f6"
  }
  return color
}
function paragraphStylePreviewStyle(
  option: ParagraphStyleDefinition,
  documentTheme: DocxDocumentTheme
): React.CSSProperties {
  const runStyle = resolveParagraphStyleRunPreview(option)
  const textDecoration = [
    runStyle?.underline ? "underline" : "",
    runStyle?.strike ? "line-through" : "",
  ]
    .filter(Boolean)
    .join(" ")
  return {
    textAlign: option.align ?? "left",
    fontFamily: runStyle?.fontFamily,
    fontSize: runStyle?.fontSizePt ? `${runStyle.fontSizePt}pt` : "11pt",
    fontWeight:
      runStyle?.bold !== undefined ? (runStyle.bold ? 700 : 400) : undefined,
    fontStyle: runStyle?.italic ? "italic" : undefined,
    textDecoration: textDecoration || undefined,
    color:
      runStyle?.color !== undefined
        ? themedPreviewColor(normalizeHexColor(runStyle.color), documentTheme)
        : undefined,
    backgroundColor: resolveHighlightPreview(runStyle?.highlight),
    lineHeight: 1,
    whiteSpace: "pre-wrap",
  }
}
function parseToolbarSectionColumns(sectionPropertiesXml?: string):
  | {
      count: number
      gapPx: number
    }
  | undefined {
  if (!sectionPropertiesXml) return undefined
  const columnsTag = sectionPropertiesXml.match(/<w:cols\b[^>]*\/?>/i)?.[0]
  if (!columnsTag) return undefined
  const countRaw = columnsTag.match(/\bw:num="(\d+)"/i)?.[1]
  const count = countRaw ? Number(countRaw) : 1
  if (!Number.isFinite(count) || count <= 1) return undefined
  const gapRaw = columnsTag.match(/\bw:space="(\d+)"/i)?.[1]
  const gapTwips = gapRaw ? Number(gapRaw) : 720
  const gapPx = Math.max(0, Math.round((gapTwips * 96) / 1440))
  return {
    count: Math.max(2, Math.round(count)),
    gapPx,
  }
}
function ToolbarTooltip({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{children}</span>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}
function EditorLoadingSurface({
  showSpinner = true,
}: {
  showSpinner?: boolean
}) {
  return (
    <div className="grid h-full min-h-52 place-items-center bg-transparent">
      {showSpinner ? <InlineSpinner className="size-4" /> : null}
    </div>
  )
}
function ToolbarIconButton({
  active,
  children,
  label,
  ...props
}: React.ComponentProps<typeof Button> & {
  active?: boolean
  label: string
}) {
  return (
    <ToolbarTooltip label={label}>
      <Button
        type="button"
        variant={active ? "secondary" : "ghost"}
        size="icon-sm"
        aria-label={label}
        data-pressed={active ? "" : undefined}
        {...props}
      >
        {children}
      </Button>
    </ToolbarTooltip>
  )
}
function ToolbarSeparator() {
  return <Separator orientation="vertical" className="mx-1 h-4 self-center" />
}
function DocxSidebarThumbnail({
  canvasRef,
  displayFileName,
  hasError,
  isActive,
  isLoading,
  pageNumber,
  pixelHeightPx,
  pixelWidthPx,
  previewAspectRatio,
}: {
  canvasRef: React.RefCallback<HTMLCanvasElement>
  displayFileName: string
  hasError: boolean
  isActive: boolean
  isLoading: boolean
  pageNumber: number
  pixelHeightPx: number
  pixelWidthPx: number
  previewAspectRatio: number
}) {
  return (
    <FileThumbnail
      file={{
        name: `${displayFileName} page ${pageNumber}`,
        type: DOCX_MIME_TYPE,
      }}
      previewAspectRatio={previewAspectRatio}
      previewClassName="rounded-md bg-white"
      previewContent={
        <canvas
          ref={canvasRef}
          width={pixelWidthPx}
          height={pixelHeightPx}
          className="!size-full bg-white object-cover object-top"
        />
      }
      isLoading={isLoading}
      hasError={hasError}
      className={cn(
        "w-[92px] rounded-md border-0 shadow-xs ring-0 transition-shadow duration-150",
        isActive && "shadow-sm"
      )}
    />
  )
}
function ParagraphStylePreviewCard({
  documentTheme,
  option,
}: {
  documentTheme: DocxDocumentTheme
  option: ParagraphStyleDefinition
}) {
  const surfaceStyle: React.CSSProperties =
    documentTheme === "dark"
      ? {
          backgroundColor: "#111827",
          borderColor: "#374151",
          color: "#f3f4f6",
        }
      : {
          backgroundColor: "#ffffff",
          borderColor: "#d4d4d8",
          color: "#111827",
        }
  const secondaryTextColor = documentTheme === "dark" ? "#9ca3af" : "#6b7280"
  return (
    <div className="w-[260px] p-3">
      <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        Style Preview
      </p>
      <div className="mt-2 rounded-sm border p-2.5" style={surfaceStyle}>
        <p style={paragraphStylePreviewStyle(option, documentTheme)}>
          {option.name}
        </p>
        <p
          className="mt-1 text-[11px]"
          style={{
            color: secondaryTextColor,
            textAlign: option.align ?? "left",
          }}
        >
          The quick brown fox jumps over the lazy dog.
        </p>
      </div>
    </div>
  )
}
function DocxEditorToolbar({
  activePage,
  controlsDisabled,
  editor,
  isReadOnly,
  onImageUploadClick,
  onIsDarkChange,
  onIsReadOnlyChange,
  onOpenLinkEditor,
  onToggleSidebar,
  onUploadClick,
  pageCount,
  setZoomScale,
  showNightRenderToggle,
  zoomScale,
}: {
  activePage: number
  controlsDisabled: boolean
  editor: DocxEditorController
  isReadOnly: boolean
  onImageUploadClick: () => void
  onIsDarkChange: (checked: boolean) => void
  onIsReadOnlyChange: (checked: boolean) => void
  onOpenLinkEditor: () => void
  onToggleSidebar: () => void
  onUploadClick: () => void
  pageCount: number
  setZoomScale: React.Dispatch<React.SetStateAction<number>>
  showNightRenderToggle: boolean
  zoomScale: number
}) {
  const { documentTheme, setDocumentTheme } = useDocxDocumentTheme(editor)
  const { layout: pageLayout } = useDocxPageLayout(editor)
  const { paragraphStyles, selectedParagraphStyleId, setParagraphStyle } =
    useDocxParagraphStyles(editor)
  const { lineSpacing, setLineSpacing } = useDocxLineSpacing(editor)
  const { borderContext, activeBorderPresets, applyBorderPreset } =
    useDocxBorders(editor)
  const { showTrackedChanges, setShowTrackedChanges } =
    useDocxTrackChanges(editor)
  const { showComments, setShowComments } = useDocxComments(editor)
  const selectedRunStyle = editor.selectedRunStyle
  const selectedParagraph = editor.selectedParagraph
  const paragraphStyleOptions: ParagraphStyleDefinition[] =
    paragraphStyles.length > 0
      ? paragraphStyles
      : [...FALLBACK_PARAGRAPH_STYLE_OPTIONS]
  const selectedParagraphStyleValue =
    selectedParagraphStyleId ??
    paragraphStyleOptions.find((option) => "isDefault" in option)?.id ??
    paragraphStyleOptions[0]?.id ??
    "Normal"
  const [paragraphStylePreviewId, setParagraphStylePreviewId] = React.useState<
    string | null
  >(null)
  const selectedLineSpacingValue = React.useMemo(() => {
    const current = Number.isFinite(lineSpacing.multiple)
      ? lineSpacing.multiple
      : 1
    const nearest = LINE_SPACING_OPTIONS.reduce((closest, candidate) => {
      return Math.abs(candidate - current) < Math.abs(closest - current)
        ? candidate
        : closest
    }, LINE_SPACING_OPTIONS[0])
    return String(nearest)
  }, [lineSpacing.multiple])
  const textColorValue = normalizeHexColor(selectedRunStyle?.color)
  const highlightColor =
    HIGHLIGHT_COLORS.find(
      (option) => option.value === selectedRunStyle?.highlight
    )?.color ?? "#fff59d"
  const activeNodeIndex =
    editor.selection.kind === "paragraph"
      ? editor.selection.nodeIndex
      : editor.selection.tableIndex
  const letterheadColumns =
    editor.selection.kind === "paragraph" &&
    paragraphLetterheadFloatSideAtNodeIndex(
      editor.model.nodes,
      editor.selection.nodeIndex
    )
      ? { count: 2, gapPx: 28 }
      : undefined
  const sections = editor.model.metadata.sections ?? []
  const activeSection = sections
    .filter((section) => section.startNodeIndex <= activeNodeIndex)
    .at(-1)
  const activeColumns =
    letterheadColumns ??
    parseToolbarSectionColumns(activeSection?.sectionPropertiesXml) ??
    parseToolbarSectionColumns(editor.model.metadata.sectionPropertiesXml) ??
    pageLayout.columns
  const activeBorderControlOptions = BORDER_CONTROL_OPTIONS.filter(
    (option) => activeBorderPresets[option.id]
  )
  const borderTriggerLabel =
    activeBorderControlOptions.length === 1
      ? activeBorderControlOptions[0].label
      : "Borders"
  const borderTriggerIcon = React.createElement(
    borderControlOptionIcon(
      activeBorderControlOptions.length === 1
        ? activeBorderControlOptions[0].id
        : "all"
    ),
    { className: "size-4" }
  )
  const canEdit = !controlsDisabled && !isReadOnly
  const canZoomIn = zoomScale < ZOOM_OPTIONS[ZOOM_OPTIONS.length - 1]
  const canZoomOut = zoomScale > ZOOM_OPTIONS[0]
  const fontToggleValues = React.useMemo<DocxFontToggleValue[]>(() => {
    const values: DocxFontToggleValue[] = []
    if (selectedRunStyle?.bold) values.push("bold")
    if (selectedRunStyle?.italic) values.push("italic")
    if (selectedRunStyle?.underline) values.push("underline")
    if (selectedRunStyle?.strike) values.push("strike")
    if (selectedRunStyle?.verticalAlign === "superscript") {
      values.push("superscript")
    }
    if (selectedRunStyle?.verticalAlign === "subscript") {
      values.push("subscript")
    }
    return values
  }, [selectedRunStyle])
  const preserveTextSelection = React.useCallback(
    (event: React.MouseEvent<HTMLElement> | React.PointerEvent<HTMLElement>) =>
      event.preventDefault(),
    []
  )
  const applyFontToggleValues = React.useCallback(
    (nextValues: DocxFontToggleValue[]) => {
      const changedValue =
        nextValues.find((value) => !fontToggleValues.includes(value)) ??
        fontToggleValues.find((value) => !nextValues.includes(value))
      if (changedValue === "bold") {
        editor.toggleBold()
      } else if (changedValue === "italic") {
        editor.toggleItalic()
      } else if (changedValue === "underline") {
        editor.toggleUnderline()
      } else if (changedValue === "strike") {
        editor.toggleStrike()
      } else if (changedValue === "superscript") {
        editor.toggleSuperscript()
      } else if (changedValue === "subscript") {
        editor.toggleSubscript()
      }
    },
    [editor, fontToggleValues]
  )
  return (
    <div className="bg-background">
      <TooltipProvider>
        <FileBarSlot className="flex min-h-11 items-center gap-2 overflow-x-auto overflow-y-hidden border-b px-3">
          <ToolbarGroups separators={[ToolbarSeparator, Separator]}>
          <ToolbarIconButton
            label="Toggle pages"
            disabled={controlsDisabled}
            onClick={onToggleSidebar}
          >
            <IconLayoutSidebar className="size-4" />
          </ToolbarIconButton>
          <div className="flex items-center gap-1.5 px-2 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
            <span>Page</span>
            <span className="inline-flex h-6 min-w-7 items-center justify-center rounded-md border border-border bg-background px-1.5 font-medium text-foreground">
              {pageCount ? activePage : 1}
            </span>
            <span>of {pageCount || "–"}</span>
          </div>
          <div className="min-w-0 flex-1" />
          {showNightRenderToggle ? (
            <>
              <ToolbarIconButton
                label={
                  documentTheme === "dark"
                    ? "Use light document"
                    : "Use dark document"
                }
                disabled={controlsDisabled}
                onClick={() => {
                  const nextIsDark = documentTheme !== "dark"
                  setDocumentTheme(nextIsDark ? "dark" : "light")
                  onIsDarkChange(nextIsDark)
                }}
              >
                {documentTheme === "dark" ? (
                  <Sun03Glyph className="size-4" />
                ) : (
                  <Moon02Glyph className="size-4" />
                )}
              </ToolbarIconButton>
              <Separator
                orientation="vertical"
                className="mx-1 h-4 self-center"
              />
            </>
          ) : null}
          <ToolbarIconButton
            label="Show tracked changes"
            active={showTrackedChanges}
            disabled={controlsDisabled}
            onClick={() => setShowTrackedChanges(!showTrackedChanges)}
          >
            <IconFileDiff className="size-4" />
          </ToolbarIconButton>
          <ToolbarIconButton
            label="Show comments"
            active={showComments}
            disabled={controlsDisabled}
            onClick={() => setShowComments(!showComments)}
          >
            <IconMessage className="size-4" />
          </ToolbarIconButton>
          <ToolbarIconButton
            label={isReadOnly ? "Switch to edit mode" : "Switch to read-only"}
            active={isReadOnly}
            disabled={controlsDisabled}
            onClick={() => onIsReadOnlyChange(!isReadOnly)}
          >
            {isReadOnly ? (
              <IconPencil className="size-4" />
            ) : (
              <IconPencilOff className="size-4" />
            )}
          </ToolbarIconButton>
          <Separator orientation="vertical" className="mx-1 h-4 self-center" />
          <ToolbarTooltip label="Replace this document with a DOCX file">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={editor.isImporting}
              onClick={onUploadClick}
              className="font-title text-[11px] font-semibold tracking-[0.06em] uppercase"
              data-testid="docx-editor-import-button"
            >
              {editor.isImporting ? (
                <InlineSpinner className="size-4" />
              ) : (
                <IconUpload className="size-4" />
              )}
              Import
            </Button>
          </ToolbarTooltip>
          {/* Download lives in the app's file bar. */}
          </ToolbarGroups>
        </FileBarSlot>

        <div className="flex min-h-12 flex-wrap items-center gap-2 border-b px-3 py-2">
          <ToolbarGroups separators={[ToolbarSeparator, Separator]}>
          <div className="flex shrink-0 items-center gap-1">
            <ToolbarIconButton
              label="Undo"
              disabled={!editor.canUndo || isReadOnly}
              onClick={editor.undo}
            >
              <IconArrowBackUp className="size-4" />
            </ToolbarIconButton>
            <ToolbarIconButton
              label="Redo"
              disabled={!editor.canRedo || isReadOnly}
              onClick={editor.redo}
            >
              <IconArrowForwardUp className="size-4" />
            </ToolbarIconButton>
          </div>

          <ToolbarSeparator />

          <Select
            value={selectedParagraphStyleValue}
            onOpenChange={() => setParagraphStylePreviewId(null)}
            onValueChange={(value) => {
              if (value) {
                setParagraphStyle(value)
              }
            }}
            disabled={!canEdit}
          >
            <SelectTrigger
              size="sm"
              className="w-[112px] min-w-[112px]"
              aria-label="Paragraph style"
            >
              <SelectValue placeholder="Style" />
            </SelectTrigger>
            <SelectContent
              align="start"
              className="z-40 min-w-[210px]"
              position={false ? "item-aligned" : "popper"}
            >
              {paragraphStyleOptions.map((option) => (
                <PreviewCard
                  key={option.id}
                  open={paragraphStylePreviewId === option.id}
                  onOpenChange={(open) => {
                    setParagraphStylePreviewId((current) =>
                      open ? option.id : current === option.id ? null : current
                    )
                  }}
                  openDelay={0}
                  closeDelay={120}
                >
                  {/* The item itself anchors the card. Anchoring to the label
                      broke for the selected style: Radix Select also renders
                      the selected label inside the toolbar trigger, so the
                      card attached to that copy and covered the list. */}
                  <PreviewCardTrigger asChild>
                    <SelectItem
                      value={option.id}
                      className="relative min-w-[190px]"
                      onFocus={() => setParagraphStylePreviewId(option.id)}
                      onPointerEnter={() =>
                        setParagraphStylePreviewId(option.id)
                      }
                      textValue={option.name}
                    >
                      <span className="block w-full truncate">
                        {option.name}
                      </span>
                    </SelectItem>
                  </PreviewCardTrigger>
                  <PreviewCardContent
                    side="right"
                    align="start"
                    sideOffset={10}
                    alignOffset={-4}
                    data-slot="paragraph-style-preview-card"
                    collisionPadding={8}
                    className="z-50 origin-(--transform-origin) rounded-lg border bg-popover text-popover-foreground shadow-lg/5 transition-opacity duration-100 outline-none not-dark:bg-clip-padding before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-lg)-1px)] before:shadow-[0_1px_--theme(--color-black/4%)] data-ending-style:opacity-0 data-starting-style:opacity-0 dark:before:shadow-[0_-1px_--theme(--color-white/6%)]"
                  >
                    <ParagraphStylePreviewCard
                      documentTheme={documentTheme}
                      option={option}
                    />
                  </PreviewCardContent>
                </PreviewCard>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={selectedRunStyle?.fontFamily ?? "Calibri"}
            onValueChange={(value) => {
              if (value) {
                editor.setFontFamily(value)
              }
            }}
            disabled={!canEdit}
          >
            <SelectTrigger
              size="sm"
              className="w-[124px] min-w-[124px]"
              aria-label="Font family"
            >
              <SelectValue placeholder="Font" />
            </SelectTrigger>
            <SelectContent
              align="start"
              className="z-40"
              position={false ? "item-aligned" : "popper"}
            >
              {FONT_FAMILIES.map((fontFamily) => (
                <SelectItem key={fontFamily} value={fontFamily}>
                  <span style={{ fontFamily }}>{fontFamily}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={String(Math.round(selectedRunStyle?.fontSizePt ?? 12))}
            onValueChange={(value) => {
              const nextSize = Number(value)
              if (Number.isFinite(nextSize)) {
                editor.setFontSize(nextSize)
              }
            }}
            disabled={!canEdit}
          >
            <SelectTrigger
              size="sm"
              className="w-[74px] min-w-[74px]"
              aria-label="Font size"
            >
              <SelectValue placeholder="Size" />
            </SelectTrigger>
            <SelectContent
              align="start"
              className="z-40"
              position={false ? "item-aligned" : "popper"}
            >
              {FONT_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size} pt
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={selectedLineSpacingValue}
            onValueChange={(value) => {
              const nextSpacing = Number(value)
              if (Number.isFinite(nextSpacing)) {
                setLineSpacing(nextSpacing)
              }
            }}
            disabled={!canEdit}
          >
            <SelectTrigger
              size="sm"
              className="w-[64px] min-w-[64px]"
              aria-label="Line spacing"
            >
              <SelectValue placeholder="Spacing" />
            </SelectTrigger>
            <SelectContent
              align="start"
              className="z-40"
              position={false ? "item-aligned" : "popper"}
            >
              {LINE_SPACING_OPTIONS.map((spacing) => (
                <SelectItem key={spacing} value={String(spacing)}>
                  {spacing}x
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <ToolbarSeparator />

          <ToggleGroup
            className="shrink-0"
            disabled={!canEdit}
            value={fontToggleValues}
            onMouseDown={preserveTextSelection}
            onPointerDown={preserveTextSelection}
            onValueChange={(value) =>
              applyFontToggleValues(value as DocxFontToggleValue[])
            }
            spacing={1}
            type={"multiple"}
          >
            <ToolbarTooltip label="Bold">
              <ToggleGroupItem aria-label="Bold" size="sm" value="bold">
                <IconBold className="size-4" />
              </ToggleGroupItem>
            </ToolbarTooltip>
            <ToolbarTooltip label="Italic">
              <ToggleGroupItem aria-label="Italic" size="sm" value="italic">
                <IconItalic className="size-4" />
              </ToggleGroupItem>
            </ToolbarTooltip>
            <ToolbarTooltip label="Underline">
              <ToggleGroupItem
                aria-label="Underline"
                size="sm"
                value="underline"
              >
                <IconUnderline className="size-4" />
              </ToggleGroupItem>
            </ToolbarTooltip>
            <ToolbarTooltip label="Strikethrough">
              <ToggleGroupItem
                aria-label="Strikethrough"
                size="sm"
                value="strike"
              >
                <IconStrikethrough className="size-4" />
              </ToggleGroupItem>
            </ToolbarTooltip>
            <ToolbarTooltip label="Superscript">
              <ToggleGroupItem
                aria-label="Superscript"
                size="sm"
                value="superscript"
              >
                <IconSuperscript className="size-4" />
              </ToggleGroupItem>
            </ToolbarTooltip>
            <ToolbarTooltip label="Subscript">
              <ToggleGroupItem
                aria-label="Subscript"
                size="sm"
                value="subscript"
              >
                <IconSubscript className="size-4" />
              </ToggleGroupItem>
            </ToolbarTooltip>
          </ToggleGroup>

          <ToolbarSeparator />

          <div className="flex shrink-0 items-center gap-1">
            <ColorPicker
              label="Text color"
              icon={TextColorGlyph}
              color={textColorValue}
              disabled={!canEdit}
              onTriggerMouseDown={preserveTextSelection}
              onTriggerPointerDown={preserveTextSelection}
              onChange={(color) =>
                editor.setTextColor(normalizeHexColor(color))
              }
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={!canEdit}
                  aria-label="Highlight color"
                  className="relative"
                >
                  <IconHighlight className="size-4 -translate-y-[2px]" />
                  <span
                    className="absolute bottom-[4px] left-1/2 h-[3px] w-3.5 -translate-x-1/2 rounded-full"
                    style={{ backgroundColor: highlightColor }}
                  />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="z-40 w-44">
                {HIGHLIGHT_COLORS.map((option) => (
                  <DropdownMenuCheckboxItem
                    key={option.value}
                    checked={selectedRunStyle?.highlight === option.value}
                    onCheckedChange={() => editor.setHighlight(option.value)}
                  >
                    <span
                      className="size-3 rounded-full border"
                      style={{ backgroundColor: option.color }}
                    />
                    {option.label}
                  </DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={!selectedRunStyle?.highlight}
                  onCheckedChange={() => editor.setHighlight(undefined)}
                >
                  No highlight
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <ToolbarIconButton
              label="Link"
              disabled={!canEdit}
              onMouseDown={preserveTextSelection}
              onPointerDown={preserveTextSelection}
              onClick={onOpenLinkEditor}
            >
              <IconLink className="size-4" />
            </ToolbarIconButton>
          </div>

          <ToolbarSeparator />

          <div className="flex shrink-0 items-center gap-1">
            <ToolbarIconButton
              label="Align left"
              active={
                selectedParagraph?.style?.align === "left" ||
                !selectedParagraph?.style?.align
              }
              disabled={!canEdit}
              onMouseDown={preserveTextSelection}
              onPointerDown={preserveTextSelection}
              onClick={() => editor.setAlignment("left")}
            >
              <IconAlignLeft className="size-4" />
            </ToolbarIconButton>
            <ToolbarIconButton
              label="Align center"
              active={selectedParagraph?.style?.align === "center"}
              disabled={!canEdit}
              onMouseDown={preserveTextSelection}
              onPointerDown={preserveTextSelection}
              onClick={() => editor.setAlignment("center")}
            >
              <IconAlignCenter className="size-4" />
            </ToolbarIconButton>
            <ToolbarIconButton
              label="Align right"
              active={selectedParagraph?.style?.align === "right"}
              disabled={!canEdit}
              onMouseDown={preserveTextSelection}
              onPointerDown={preserveTextSelection}
              onClick={() => editor.setAlignment("right")}
            >
              <IconAlignRight className="size-4" />
            </ToolbarIconButton>
            <ToolbarIconButton
              label="Justify"
              active={selectedParagraph?.style?.align === "justify"}
              disabled={!canEdit}
              onMouseDown={preserveTextSelection}
              onPointerDown={preserveTextSelection}
              onClick={() => editor.setAlignment("justify")}
            >
              <IconAlignJustified className="size-4" />
            </ToolbarIconButton>
          </div>

          <ToolbarSeparator />

          <div className="flex shrink-0 items-center gap-1">
            <ToolbarIconButton
              label="Bulleted list"
              active={editor.hasUnorderedList}
              disabled={!canEdit}
              onMouseDown={preserveTextSelection}
              onPointerDown={preserveTextSelection}
              onClick={() => editor.toggleList("unordered")}
            >
              <IconList className="size-4" />
            </ToolbarIconButton>
            <ToolbarIconButton
              label="Numbered list"
              active={editor.hasOrderedList}
              disabled={!canEdit}
              onMouseDown={preserveTextSelection}
              onPointerDown={preserveTextSelection}
              onClick={() => editor.toggleList("ordered")}
            >
              <IconListNumbers className="size-4" />
            </ToolbarIconButton>
          </div>

          <ToolbarSeparator />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!canEdit}
                className="h-7 gap-1 px-2 shadow-none"
              >
                {borderTriggerIcon}
                {borderTriggerLabel}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="z-40 w-56">
              {BORDER_CONTROL_OPTIONS.map((option) => {
                const enabledForContext =
                  !option.contexts || option.contexts.includes(borderContext)
                const BorderOptionIcon = borderControlOptionIcon(option.id)
                return (
                  <React.Fragment key={option.id}>
                    {option.separatorBefore ? <DropdownMenuSeparator /> : null}
                    <DropdownMenuCheckboxItem
                      checked={activeBorderPresets[option.id]}
                      disabled={!enabledForContext}
                      onCheckedChange={() => {
                        if (enabledForContext) {
                          applyBorderPreset(option.id)
                        }
                      }}
                    >
                      <BorderOptionIcon className="size-4 text-muted-foreground" />
                      {option.label}
                    </DropdownMenuCheckboxItem>
                  </React.Fragment>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          <ToolbarSeparator />

          <div className="flex shrink-0 items-center gap-1">
            <ToolbarIconButton
              label="Insert image"
              disabled={!canEdit}
              onClick={onImageUploadClick}
            >
              <IconPhotoPlus className="size-4" />
            </ToolbarIconButton>
            <ToolbarIconButton
              label="Insert table"
              disabled={!canEdit}
              onClick={editor.insertTable}
            >
              <IconTable className="size-4" />
            </ToolbarIconButton>
            <ToolbarTooltip label="Section columns">
              <div className="flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground">
                <IconColumns3 className="size-4" />
                {activeColumns ? `${activeColumns.count} cols` : "1 col"}
              </div>
            </ToolbarTooltip>
          </div>

          <ToolbarSeparator />

          <div className="ml-auto flex flex-none items-center gap-1">
            <ToolbarIconButton
              label="Zoom out"
              disabled={controlsDisabled || !canZoomOut}
              onClick={() =>
                setZoomScale((currentZoomScale) =>
                  getNextZoomScale(currentZoomScale, -1)
                )
              }
            >
              <IconCircleMinus className="size-4" />
            </ToolbarIconButton>
            <Select
              value={zoomScale.toString()}
              onValueChange={(value) => setZoomScale(Number(value))}
              disabled={controlsDisabled}
            >
              <SelectTrigger
                size="sm"
                className="w-[74px] min-w-[74px]"
                aria-label="Zoom level"
              >
                <SelectValue>{Math.round(zoomScale)}%</SelectValue>
              </SelectTrigger>
              <SelectContent
                align="end"
                className="z-40"
                position={false ? "item-aligned" : "popper"}
              >
                {ZOOM_OPTIONS.map((value) => (
                  <SelectItem key={value} value={value.toString()}>
                    {value}%
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ToolbarIconButton
              label="Zoom in"
              disabled={controlsDisabled || !canZoomIn}
              onClick={() =>
                setZoomScale((currentZoomScale) =>
                  getNextZoomScale(currentZoomScale, 1)
                )
              }
            >
              <IconCirclePlus className="size-4" />
            </ToolbarIconButton>
          </div>
          </ToolbarGroups>
        </div>
      </TooltipProvider>
    </div>
  )
}
function DocxEditorThumbnails({
  editor,
  pageCount,
  activePage,
  displayFileName,
  scrollToPage,
}: {
  editor: DocxEditorController
  pageCount: number
  activePage: number
  displayFileName: string
  scrollToPage: (page: number) => void
}) {
  const thumbnailEditor = React.useMemo<DocxEditorController>(
    () => ({
      ...editor,
      totalPages: Math.max(editor.totalPages, pageCount),
    }),
    [editor, pageCount]
  )
  const thumbnailOptions = React.useMemo(
    () => ({
      pixelRatio: 2,
      resolution: {
        maxHeight: DOCX_THUMBNAIL_WIDTH * 1.35,
        maxWidth: DOCX_THUMBNAIL_WIDTH,
      },
    }),
    []
  )
  const { thumbnails } = useDocxViewerThumbnails(
    thumbnailEditor,
    thumbnailOptions
  )
  return (
    <div className="flex flex-col items-center gap-3">
      {thumbnails.slice(0, pageCount).map((thumbnail) => (
        <Button
          key={thumbnail.pageIndex}
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "!h-auto w-full flex-col items-center gap-2 p-2 text-xs shadow-none hover:bg-sidebar-accent",
            thumbnail.pageNumber === activePage &&
              "bg-sidebar-accent text-foreground",
            thumbnail.pageNumber !== activePage && "text-muted-foreground"
          )}
          onFocus={(event) => event.currentTarget.blur()}
          onClick={() => scrollToPage(thumbnail.pageNumber)}
        >
          <DocxSidebarThumbnail
            canvasRef={thumbnail.canvasRef}
            displayFileName={displayFileName}
            hasError={thumbnail.status === "error"}
            isActive={thumbnail.pageNumber === activePage}
            isLoading={
              !thumbnail.isMounted &&
              thumbnail.status !== "ready" &&
              thumbnail.status !== "error"
            }
            pageNumber={thumbnail.pageNumber}
            pixelHeightPx={thumbnail.pixelHeightPx}
            pixelWidthPx={thumbnail.pixelWidthPx}
            previewAspectRatio={thumbnail.aspectRatio}
          />
          {thumbnail.pageNumber}
        </Button>
      ))}
    </div>
  )
}
export function DocxEditorPreview({
  autoFocus = false,
  className,
  defaultZoomScale = DOCX_EDITOR_DEFAULT_ZOOM_SCALE,
  fileName,
  isDark,
  onIsDarkChange,
  src,
}: {
  /** Put the caret in the first paragraph once the document has loaded. */
  autoFocus?: boolean
  className?: string
  defaultZoomScale?: number
  fileName?: string
  isDark: boolean
  onIsDarkChange: (isDark: boolean) => void
  src?: string
}) {
  return (
    <DocxEditorContent
      key={src}
      autoFocus={autoFocus}
      className={className}
      defaultZoomScale={defaultZoomScale}
      effectiveIsDark={isDark}
      fileName={fileName}
      setIsDark={onIsDarkChange}
      shouldRenderNightMode
      url={src}
    />
  )
}
function DocxEditorContent({
  autoFocus,
  className,
  defaultZoomScale,
  effectiveIsDark,
  fileName,
  setIsDark,
  shouldRenderNightMode,
  url,
}: {
  autoFocus: boolean
  className?: string
  defaultZoomScale?: number
  effectiveIsDark: boolean
  fileName?: string
  setIsDark: (checked: boolean) => void
  shouldRenderNightMode: boolean
  url?: string
}) {
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const imageInputRef = React.useRef<HTMLInputElement>(null)
  const viewportRef = React.useRef<HTMLDivElement | null>(null)
  const [viewportElement, setViewportElement] =
    React.useState<HTMLDivElement | null>(null)
  const [viewerShellRef, viewerShellWidth] = useElementWidth<HTMLDivElement>()
  const [uploadedDocxFile, setUploadedDocxFile] =
    React.useState<UploadedDocxFile | null>(null)
  const [activePage, setActivePage] = React.useState(1)
  const [sidebarOpen, setSidebarOpen] = React.useState(false)
  const resolvedDefaultZoomScale = normalizeDocxZoomScale(defaultZoomScale)
  const [zoomScale, setZoomScale] = React.useState<number>(
    resolvedDefaultZoomScale
  )
  const [loadError, setLoadError] = React.useState<string>()
  const [isLoadingDocument, setIsLoadingDocument] = React.useState(Boolean(url))
  const [isReadOnly, setIsReadOnly] = React.useState(false)
  const pendingAutoFocus = React.useRef(autoFocus)
  const [linkEditorOpen, setLinkEditorOpen] = React.useState(false)
  const [linkDraft, setLinkDraft] = React.useState("")
  const viewerBackgroundColor =
    "color-mix(in oklab, var(--muted) 40%, transparent)"
  const displayFileName = React.useMemo(
    () =>
      uploadedDocxFile?.file.name ??
      (url ? formatDocumentName(fileName, url) : (fileName ?? "document.docx")),
    [fileName, uploadedDocxFile?.file.name, url]
  )
  const [initialDocumentTheme] = React.useState<DocxDocumentTheme>(() =>
    effectiveIsDark ? "dark" : "light"
  )
  const editorOptions = React.useMemo(
    () => ({
      initialDocumentTheme,
      initialFileName: displayFileName,
    }),
    [displayFileName, initialDocumentTheme]
  )
  const editor = useDocxEditor(editorOptions)
  useRegisterDocumentBytes(editor.getDocxBytes)
  // The model is replaced on every edit; a new load nonce is a fresh document.
  useReportDocumentChange(editor.model, editor.documentLoadNonce)
  const { layout: pageLayout } = useDocxPageLayout(editor)
  const { importDocxFile, setDocumentTheme, status } = editor
  const [reportedPageCount, setReportedPageCount] = React.useState(0)
  const shouldShowDocumentSpinner = useDelayedLoadingIndicator(
    isLoadingDocument,
    DOCX_LOADING_INDICATOR_DELAY_MS
  )
  const loadingState = (
    <EditorLoadingSurface showSpinner={shouldShowDocumentSpinner} />
  )
  const renderTrackedChangeCard = React.useMemo(
    () => createDocxTrackedChangeCardRenderer(editor.documentTheme),
    [editor.documentTheme]
  )
  const renderCommentCard = React.useMemo(
    () => createDocxCommentCardRenderer(editor.documentTheme),
    [editor.documentTheme]
  )
  const hasDocument = Boolean(url || uploadedDocxFile)
  const sidebarInline = useInlineThumbnailSidebar(viewerShellWidth)
  const pageCount =
    hasDocument && !isLoadingDocument && !loadError
      ? Math.max(1, reportedPageCount || editor.totalPages)
      : 0
  const controlsDisabled =
    !hasDocument || isLoadingDocument || Boolean(loadError)
  const thumbnailSidebarOpen = Boolean(
    sidebarOpen && (pageCount || isLoadingDocument)
  )
  const handlePageCountChange = React.useCallback((nextPageCount: number) => {
    setReportedPageCount(Math.max(1, Math.round(nextPageCount || 1)))
  }, [])
  const setViewportRef = React.useCallback((element: HTMLDivElement | null) => {
    viewportRef.current = element
    setViewportElement(element)
  }, [])
  const pageVirtualization = React.useMemo(
    () => ({
      enabled: true,
      overscan: 1,
      scrollElement: viewportElement,
      zoomScale: zoomScale / 100,
    }),
    [viewportElement, zoomScale]
  )
  useSuppressDocxPaddingWarning(!isLoadingDocument && !loadError)
  // Touch: swipes scroll, taps place the caret, hold-and-drag selects,
  // hold-and-lift opens the context menu (see document-touch.ts).
  const [pagesHost, setPagesHost] = React.useState<HTMLDivElement | null>(null)
  useTouchSelectionGuard(pagesHost, {
    shouldGuard: isDocxTouchSelectionTarget,
    disabled: isReadOnly,
  })
  // Narrow viewports (tablet portrait): open each document zoomed to fit the
  // page width instead of cutting off its right edge. Wide screens keep the
  // default zoom.
  const isCompact = useMediaQuery(BREAKPOINT.compact)
  const fittedDocumentRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!isCompact || isLoadingDocument || loadError || !viewportElement) return
    const identity = `${url ?? ""}|${uploadedDocxFile?.identity ?? ""}`
    if (fittedDocumentRef.current === identity) return
    const available = viewportElement.clientWidth - 32
    const pageWidth = pageLayout.pageWidthPx
    if (available <= 0 || !pageWidth) return
    fittedDocumentRef.current = identity
    if (pageWidth * (resolvedDefaultZoomScale / 100) <= available) return
    const fit = [...ZOOM_OPTIONS]
      .reverse()
      .find((value) => pageWidth * (value / 100) <= available)
    setZoomScale(fit ?? ZOOM_OPTIONS[0])
  }, [
    isCompact,
    isLoadingDocument,
    loadError,
    pageLayout.pageWidthPx,
    resolvedDefaultZoomScale,
    uploadedDocxFile?.identity,
    url,
    viewportElement,
  ])

  // New documents: caret in the first paragraph as soon as it is laid out.
  React.useEffect(() => {
    if (!pendingAutoFocus.current || isLoadingDocument || loadError) return
    if (!viewportElement) return
    let frame = 0
    let tries = 0
    const attempt = () => {
      const first = viewportElement.querySelector<HTMLElement>(DOCX_PARAGRAPH_HOST)
      if (first && first.getBoundingClientRect().height > 0) {
        pendingAutoFocus.current = false
        placeCaretInParagraph(first, "start")
      } else if (tries++ < 120) {
        frame = requestAnimationFrame(attempt)
      }
    }
    frame = requestAnimationFrame(attempt)
    return () => cancelAnimationFrame(frame)
  }, [isLoadingDocument, loadError, viewportElement])
  const [previousDefaultZoom, setPreviousDefaultZoom] = React.useState(
    resolvedDefaultZoomScale
  )
  if (previousDefaultZoom !== resolvedDefaultZoomScale) {
    setPreviousDefaultZoom(resolvedDefaultZoomScale)
    setZoomScale(resolvedDefaultZoomScale)
    setActivePage(1)
  }
  React.useEffect(() => {
    viewportRef.current?.scrollTo({ top: 0, left: 0 })
  }, [resolvedDefaultZoomScale, url])
  React.useEffect(() => {
    setDocumentTheme(effectiveIsDark ? "dark" : "light")
  }, [effectiveIsDark, setDocumentTheme])
  const [previousStatus, setPreviousStatus] = React.useState(status)
  if (previousStatus !== status) {
    setPreviousStatus(status)
    if (
      status.startsWith("Failed to load file") ||
      status === "Only .docx files are supported"
    ) {
      setLoadError(status)
      setIsLoadingDocument(false)
    }
  }
  React.useEffect(() => {
    let isCurrent = true
    async function load() {
      if (!uploadedDocxFile && !url) return
      try {
        const docxFile =
          uploadedDocxFile?.file ??
          (url ? await loadDocxFile(url, displayFileName) : null)
        if (!docxFile) return
        await importDocxFile(docxFile)
        if (isCurrent) {
          setIsLoadingDocument(false)
          setActivePage(1)
          viewportRef.current?.scrollTo({ top: 0, left: 0 })
        }
      } catch (error) {
        if (isCurrent) {
          setLoadError(
            error instanceof Error ? error.message : "Unknown DOCX load error"
          )
          setIsLoadingDocument(false)
        }
      }
    }
    void load()
    return () => {
      isCurrent = false
    }
  }, [displayFileName, importDocxFile, uploadedDocxFile, url])
  const updateActivePageFromViewport = React.useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport || !pageCount) return
    const viewportRect = viewport.getBoundingClientRect()
    const viewportCenter = viewportRect.top + viewportRect.height / 2
    let closestPage = 1
    let closestDistance = Number.POSITIVE_INFINITY
    viewport
      .querySelectorAll<HTMLElement>(
        '[data-docx-page-wrapper="true"][data-index]'
      )
      .forEach((page) => {
        const pageIndex = Number(page.dataset.index)
        if (!Number.isFinite(pageIndex)) return
        const pageRect = page.getBoundingClientRect()
        const pageCenter = pageRect.top + pageRect.height / 2
        const distance = Math.abs(pageCenter - viewportCenter)
        if (distance < closestDistance) {
          closestDistance = distance
          closestPage = pageIndex + 1
        }
      })
    setActivePage((currentPage) =>
      currentPage === closestPage ? currentPage : closestPage
    )
  }, [pageCount])
  React.useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || !pageCount) return
    let frameId = 0
    const handleScroll = () => {
      window.cancelAnimationFrame(frameId)
      frameId = window.requestAnimationFrame(updateActivePageFromViewport)
    }
    frameId = window.requestAnimationFrame(updateActivePageFromViewport)
    viewport.addEventListener("scroll", handleScroll, { passive: true })
    return () => {
      window.cancelAnimationFrame(frameId)
      viewport.removeEventListener("scroll", handleScroll)
    }
  }, [pageCount, updateActivePageFromViewport])
  const scrollToPage = React.useCallback(
    (pageNumber: number) => {
      const viewport = viewportRef.current
      const targetPageIndex = pageNumber - 1
      const page = viewport?.querySelector<HTMLElement>(
        `[data-docx-page-wrapper="true"][data-index="${targetPageIndex}"]`
      )
      setActivePage(pageNumber)
      if (!viewport) return
      if (!page) {
        const pageStridePx =
          (pageLayout.pageHeightPx + pageLayout.viewportDefaults.pageGapPx) *
          (zoomScale / 100)
        viewport.scrollTo({
          top: Math.max(0, targetPageIndex * pageStridePx - 24),
          behavior: "auto",
        })
        return
      }
      viewport.scrollTo({
        top:
          page.getBoundingClientRect().top -
          viewport.getBoundingClientRect().top +
          viewport.scrollTop -
          24,
        behavior: "auto",
      })
    },
    [pageLayout.pageHeightPx, pageLayout.viewportDefaults.pageGapPx, zoomScale]
  )
  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    setZoomScale(resolvedDefaultZoomScale)
    setActivePage(1)
    setReportedPageCount(0)
    setIsLoadingDocument(true)
    setLoadError(undefined)
    setUploadedDocxFile({
      file,
      identity: `${file.name}-${file.size}-${file.lastModified}`,
    })
  }
  async function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    await editor.insertImageFile(file)
  }
  function openLinkEditor() {
    setLinkDraft(editor.selectedLink ?? "")
    setLinkEditorOpen(true)
  }
  function applyLink() {
    editor.setLink(linkDraft.trim() || undefined)
    setLinkEditorOpen(false)
  }
  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden bg-background",
        className
      )}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={handleUpload}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageUpload}
      />
      <DocxEditorToolbar
        activePage={activePage}
        controlsDisabled={controlsDisabled}
        editor={editor}
        isReadOnly={isReadOnly}
        onImageUploadClick={() => imageInputRef.current?.click()}
        onIsDarkChange={setIsDark}
        onIsReadOnlyChange={setIsReadOnly}
        onOpenLinkEditor={openLinkEditor}
        onToggleSidebar={() => setSidebarOpen((open) => !open)}
        onUploadClick={() => fileInputRef.current?.click()}
        pageCount={pageCount}
        setZoomScale={setZoomScale}
        showNightRenderToggle={shouldRenderNightMode}
        zoomScale={zoomScale}
      />
      <div
        ref={viewerShellRef}
        className="relative flex min-h-0 flex-1 overflow-hidden bg-muted/30"
      >
        {linkEditorOpen ? (
          <div className="absolute top-3 left-1/2 z-50 flex w-[min(420px,calc(100%-2rem))] -translate-x-1/2 items-center gap-2 rounded-lg border bg-background p-2 shadow-lg">
            <Input
              value={linkDraft}
              onChange={(event) => setLinkDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  applyLink()
                }
                if (event.key === "Escape") {
                  setLinkEditorOpen(false)
                }
              }}
              placeholder="https://example.com"
              aria-label="Link URL"
            />
            <Button type="button" size="sm" onClick={applyLink}>
              Apply
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                editor.setLink(undefined)
                setLinkEditorOpen(false)
              }}
            >
              Clear
            </Button>
          </div>
        ) : null}
        <DocumentViewerThumbnailSidebar
          inline={sidebarInline}
          open={thumbnailSidebarOpen}
        >
          <InlineScrollArea2
            className="h-full"
            scrollFade
            viewportClassName="overscroll-contain"
          >
            <div className="p-4">
              {isLoadingDocument ? (
                <>
                  <div className="mx-auto h-28 w-20 overflow-hidden rounded-md bg-background shadow-xs">
                    <div className="h-full animate-pulse bg-muted" />
                  </div>
                  <div className="mx-auto mt-3 h-3 w-10 rounded-full bg-muted" />
                </>
              ) : (
                thumbnailSidebarOpen && (
                  <DocxEditorThumbnails
                    editor={editor}
                    pageCount={pageCount}
                    activePage={activePage}
                    displayFileName={displayFileName}
                    scrollToPage={scrollToPage}
                  />
                )
              )}
            </div>
          </InlineScrollArea2>
        </DocumentViewerThumbnailSidebar>
        <InlineScrollArea2
          className="min-h-0 flex-1"
          style={{ backgroundColor: viewerBackgroundColor }}
          viewportClassName="overscroll-contain p-4"
          viewportRef={setViewportRef}
        >
          {!url && !uploadedDocxFile ? (
            <div className="grid h-full min-h-96 place-items-center p-6 text-center">
              <div className="max-w-md rounded-lg border bg-background p-4 text-sm shadow-xs">
                <div className="font-medium">Upload a DOCX to edit</div>
                <div className="mt-1 text-muted-foreground">
                  Pass a DOCX URL with the <code>src</code> prop or upload a
                  file.
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <IconUpload className="size-4" />
                  Upload DOCX
                </Button>
              </div>
            </div>
          ) : loadError ? (
            <div className="grid h-full min-h-96 place-items-center p-6 text-center">
              <div className="max-w-md rounded-lg border bg-background p-4 text-sm text-destructive shadow-xs">
                <div className="font-medium">Unable to edit DOCX</div>
                <div className="mt-1 text-muted-foreground">{loadError}</div>
              </div>
            </div>
          ) : isLoadingDocument ? (
            loadingState
          ) : (
            <div
              ref={setPagesHost}
              className="docx-editor__pages"
              onMouseDownCapture={
                isReadOnly ? undefined : handleBlankPageMouseDown
              }
              onKeyDownCapture={
                isReadOnly ? undefined : handleParagraphNavKeyDown
              }
            >
              <div
                className={cn(
                  "origin-top",
                  editor.documentTheme === "dark" && "docx-night-reader-shell"
                )}
                style={{ zoom: zoomScale / 100 }}
              >
                <DocxEditorViewer
                  editor={editor}
                  mode={isReadOnly ? "read-only" : "edit"}
                  showTrackedChanges={editor.showTrackedChanges}
                  renderTrackedChangeCard={renderTrackedChangeCard}
                  showComments={editor.showComments}
                  renderCommentCard={renderCommentCard}
                  renderContextMenu={renderDocxContextMenu}
                  loadingState={loadingState}
                  pageBackgroundColor={
                    editor.documentTheme === "dark" ? "#0a0a0a" : undefined
                  }
                  pageGapBackgroundColor={viewerBackgroundColor}
                  pageVirtualization={pageVirtualization}
                  onPageCountChange={handlePageCountChange}
                />
              </div>
            </div>
          )}
        </InlineScrollArea2>
      </div>
    </div>
  )
}
type InlineRegistryIconProps = Omit<
  React.ComponentProps<"svg">,
  "children" | "strokeWidth"
> & { strokeWidth?: number }
function InlineScrollArea2({
  className,
  children,
  orientation = "both",
  scrollFade = false,
  scrollbarGutter = false,
  scrollbarOverflowOnly = false,
  viewportClassName,
  viewportProps,
  viewportRef,
  ...props
}: InlineScrollAreaProps) {
  const localViewportRef = React.useRef<HTMLDivElement>(null)
  const {
    className: viewportPropsClassName,
    ref: viewportPropsRef,
    style: viewportStyle,
    ...resolvedViewportProps
  } = viewportProps ?? {}
  const resolvedViewportStyle = { ...viewportStyle }
  delete resolvedViewportStyle.overflow
  const composedViewportRef = React.useMemo(
    () => InlineComposeRefs(localViewportRef, viewportPropsRef, viewportRef),
    [viewportPropsRef, viewportRef]
  )

  React.useEffect(() => {
    const viewport = localViewportRef.current
    if (!viewport || !scrollFade) return
    const updateOverflow = () => {
      const x = Math.abs(viewport.scrollLeft)
      const y = Math.max(0, viewport.scrollTop)
      const overflow = {
        "x-start": x,
        "x-end": Math.max(0, viewport.scrollWidth - viewport.clientWidth - x),
        "y-start": y,
        "y-end": Math.max(0, viewport.scrollHeight - viewport.clientHeight - y),
      }
      for (const [edge, value] of Object.entries(overflow)) {
        viewport.style.setProperty(
          `--scroll-area-overflow-${edge}`,
          `${value}px`
        )
      }
    }
    const observer = new ResizeObserver(updateOverflow)
    observer.observe(viewport)
    if (viewport.firstElementChild) observer.observe(viewport.firstElementChild)
    viewport.addEventListener("scroll", updateOverflow, { passive: true })
    updateOverflow()
    return () => {
      observer.disconnect()
      viewport.removeEventListener("scroll", updateOverflow)
    }
  }, [scrollFade])

  if (
    !viewportProps &&
    !viewportRef &&
    !viewportClassName &&
    !scrollFade &&
    !scrollbarGutter &&
    !scrollbarOverflowOnly
  ) {
    return (
      <InlineScrollArea
        {...props}
        className={cn(
          "size-full min-h-0",
          orientation === "horizontal" &&
            "[&>[data-orientation=vertical]]:hidden",
          className
        )}
      >
        {children}
        {orientation !== "vertical" ? (
          <ScrollBar orientation="horizontal" />
        ) : null}
      </InlineScrollArea>
    )
  }

  return (
    <ScrollAreaPrimitive.Root
      type={scrollbarOverflowOnly ? "auto" : "hover"}
      data-slot="scroll-area"
      className={cn("size-full min-h-0 overflow-hidden", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        {...resolvedViewportProps}
        style={resolvedViewportStyle}
        ref={composedViewportRef}
        data-slot="scroll-area-viewport"
        className={cn(
          "h-full w-full rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-ring",
          scrollFade &&
            "mask-t-from-[calc(100%-min(var(--fade-size),var(--scroll-area-overflow-y-start)))] mask-r-from-[calc(100%-min(var(--fade-size),var(--scroll-area-overflow-x-end)))] mask-b-from-[calc(100%-min(var(--fade-size),var(--scroll-area-overflow-y-end)))] mask-l-from-[calc(100%-min(var(--fade-size),var(--scroll-area-overflow-x-start)))] [--fade-size:1.5rem]",
          scrollbarGutter && orientation !== "vertical" && "pb-3.5",
          scrollbarGutter && orientation !== "horizontal" && "pe-3.5",
          viewportPropsClassName,
          viewportClassName
        )}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      {orientation !== "horizontal" ? (
        <ScrollBar orientation="vertical" />
      ) : null}
      {orientation !== "vertical" ? (
        <ScrollBar orientation="horizontal" />
      ) : null}
      {orientation === "both" ? <ScrollAreaPrimitive.Corner /> : null}
    </ScrollAreaPrimitive.Root>
  )
}
type InlineScrollAreaProps = React.ComponentProps<
  typeof ScrollAreaPrimitive.Root
> & {
  orientation?: "vertical" | "horizontal" | "both"
  scrollFade?: boolean
  scrollbarGutter?: boolean
  scrollbarOverflowOnly?: boolean
  viewportClassName?: string
  viewportProps?: React.ComponentProps<typeof ScrollAreaPrimitive.Viewport>
  viewportRef?: React.Ref<HTMLDivElement>
}
function InlineComposeRefs<T>(...refs: Array<React.Ref<T> | undefined>) {
  return (node: T | null) => {
    for (const ref of refs) {
      if (!ref) continue
      if (typeof ref === "function") ref(node)
      else ref.current = node
    }
  }
}
function InlineSpinner({ className, ...props }: InlineRegistryIconProps) {
  return (
    <IconLoader2 role="status" aria-label="Loading" className={cn("size-4 animate-spin", className)} {...props} />
  )
}
