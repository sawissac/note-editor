import "@/styles/pdf-editor.css"
import * as React from "react"
import type { PluginRegistry } from "@embedpdf/core"
import type { DocumentPermissions } from "@embedpdf/core/react"
import type {
  PdfAnnotationObject,
  PdfDocumentObject,
  Rect,
  Size,
} from "@embedpdf/models"
import { PdfAnnotationSubtype } from "@embedpdf/models"
import type { CaptureAreaEvent } from "@embedpdf/plugin-capture/react"
import { InteractionManagerPlugin } from "@embedpdf/plugin-interaction-manager"
import { useInteractionManagerCapability } from "@embedpdf/plugin-interaction-manager/react"
import { ZoomGestureWrapper } from "@embedpdf/plugin-zoom/react"
import { ScrollArea as ScrollAreaPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { isCoarsePointer, useCoarsePointer } from "@/lib/use-media-query"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import {
  ScrollArea as InlineScrollArea,
  ScrollBar,
} from "@/components/ui/scroll-area"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { IconLayoutSidebar, IconLayoutSidebarRight, IconArrowBackUp, IconArrowForwardUp, IconCircleMinus, IconCirclePlus, IconRotateClockwise, IconSearch, IconDots, IconDownload, IconUpload, IconPrinter, IconMaximize, IconMinimize, IconHandStop, IconPointer, IconCamera, IconZoomInArea, IconBook, IconFile, IconArrowsHorizontal, IconArrowsVertical, IconHighlight, IconUnderline, IconStrikethrough, IconWaveSine, IconPencil, IconBrush, IconTypography, IconMessage2, IconNote, IconSquare, IconCircle, IconLine, IconArrowUpRight, IconVectorSpline, IconPolygon, IconPhoto, IconRubberStamp, IconLink, IconCursorText, IconReplace, IconTrash, IconLayersUnion, IconLayersSubtract, IconLock, IconLockOpen, IconMessageCircle, IconMessages, IconCheck, IconX, IconPlus, IconMinus, IconCopy, IconEyeOff, IconEye, IconSquareDashed, IconSignature, IconForms, IconSquareCheck, IconCircleDot, IconSelect, IconList, IconListTree, IconPaperclip, IconLayoutGrid, IconAdjustmentsHorizontal, IconInfoCircle, IconShieldLock, IconFileText, IconChevronDown, IconChevronUp, IconChevronLeft, IconChevronRight, IconStack2, IconFilePlus, IconScissors, IconArrowMerge, IconRefresh, IconDeviceFloppy, IconKeyboard, IconPalette, IconBold, IconItalic, IconAlignLeft, IconAlignCenter, IconAlignRight, IconAlignBoxTopCenter, IconAlignBoxCenterMiddle, IconAlignBoxBottomCenter, IconFlag, IconClipboard, IconKey, IconExternalLink, IconArrowsMove, IconAlertTriangle, IconArrowUp, IconArrowDown, IconEdit, IconSparkles } from "@tabler/icons-react"

/* -------------------------------------------------------------------------- */
/* Touch                                                                      */
/* -------------------------------------------------------------------------- */
/**
 * EmbedPDF's default "pointerMode" claims raw touch, which puts
 * `touch-action: none` on every page and on the scroller content, so a finger
 * (or Apple Pencil) drag selects text instead of scrolling the document. On
 * touch-first devices re-register the mode without raw touch: one-finger drags
 * scroll natively, taps still select annotations / follow links, and the
 * annotation tools (ink, shapes, markup…) keep their own raw-touch modes so
 * drawing still works. Call from `<EmbedPDF onInitialized>` (before the
 * pointer providers mount). Desktop is untouched.
 */
export async function allowTouchScrollInPointerMode(
  registry: PluginRegistry
): Promise<void> {
  if (!isCoarsePointer()) return
  registry
    .getPlugin<InteractionManagerPlugin>(InteractionManagerPlugin.id)
    ?.provides()
    .registerMode({
      id: "pointerMode",
      scope: "page",
      exclusive: false,
      cursor: "auto",
      wantsRawTouch: false,
    })
}

/** Hold this long without moving to start a text selection by touch. */
const TOUCH_SELECT_HOLD_MS = 450
/** Movement (px) that turns a press into a scroll instead of a hold. */
const TOUCH_SELECT_SLOP_PX = 8

/**
 * Touch gestures for the document surface, mounted only for a coarse primary
 * pointer so the desktop layout and ctrl/⌘+wheel behaviour stay as they were:
 *
 * - Pinch-to-zoom — EmbedPDF's own gesture wrapper (live CSS scale while
 *   pinching, committed to the zoom plugin on release).
 * - Scroll vs. select in the default pointer mode — with
 *   {@link allowTouchScrollInPointerMode} a drag scrolls natively, but the
 *   pointer moves still reach the selection plugin before the browser takes
 *   over, leaving a stray text selection behind. Touch/pen moves are held back
 *   from the plugin unless the finger first rests in place
 *   ({@link TOUCH_SELECT_HOLD_MS}); after such a hold the drag selects text
 *   and the page does not scroll — the iPadOS "press and hold, then drag"
 *   gesture. Taps pass through untouched (select an annotation, follow a
 *   link, focus a form field), and so do drags that start on a
 *   `touch-action: none` element (a selected annotation's move/resize box).
 */
export function PdfTouchGestures({
  documentId,
  children,
}: {
  documentId: string
  children: React.ReactNode
}) {
  const coarse = useCoarsePointer()
  if (!coarse) return <>{children}</>
  return (
    <ZoomGestureWrapper
      documentId={documentId}
      enableWheel={false}
      data-slot="pdf-touch-zoom"
    >
      <PdfTouchSelectGuard documentId={documentId}>{children}</PdfTouchSelectGuard>
    </ZoomGestureWrapper>
  )
}

function PdfTouchSelectGuard({
  documentId,
  children,
}: {
  documentId: string
  children: React.ReactNode
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const { provides: interaction } = useInteractionManagerCapability()
  React.useEffect(() => {
    const element = ref.current
    if (!element || !interaction) return
    const scope = interaction.forDocument(documentId)
    type Press = {
      x: number
      y: number
      held: boolean
      passthrough: boolean
      timer: number
    }
    const presses = new Map<number, Press>()
    const release = (pointerId: number) => {
      const press = presses.get(pointerId)
      if (!press) return
      window.clearTimeout(press.timer)
      presses.delete(pointerId)
    }
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse") return
      if (scope.getActiveMode() !== "pointerMode") return
      const target = event.target as Element | null
      const press: Press = {
        x: event.clientX,
        y: event.clientY,
        held: false,
        passthrough: Boolean(
          target?.closest?.('[style*="touch-action: none"]')
        ),
        timer: 0,
      }
      if (!press.passthrough) {
        press.timer = window.setTimeout(() => {
          press.held = presses.size === 1
        }, TOUCH_SELECT_HOLD_MS)
      }
      presses.set(event.pointerId, press)
      // A second finger means pinch/scroll — never a selection.
      if (presses.size > 1) {
        presses.forEach((other) => {
          window.clearTimeout(other.timer)
          other.held = false
        })
      }
    }
    const onPointerMove = (event: PointerEvent) => {
      const press = presses.get(event.pointerId)
      if (!press || press.passthrough) return
      if (press.held && presses.size === 1) return
      if (
        Math.hypot(event.clientX - press.x, event.clientY - press.y) >
        TOUCH_SELECT_SLOP_PX
      ) {
        window.clearTimeout(press.timer)
      }
      event.stopPropagation()
    }
    const onPointerEnd = (event: PointerEvent) => release(event.pointerId)
    // After a hold the drag selects: keep the browser from scrolling.
    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 1 || !event.cancelable) return
      for (const press of presses.values()) {
        if (press.held) {
          event.preventDefault()
          return
        }
      }
    }
    element.addEventListener("pointerdown", onPointerDown, true)
    element.addEventListener("pointermove", onPointerMove, true)
    element.addEventListener("pointerup", onPointerEnd, true)
    element.addEventListener("pointercancel", onPointerEnd, true)
    element.addEventListener("touchmove", onTouchMove, { passive: false })
    return () => {
      element.removeEventListener("pointerdown", onPointerDown, true)
      element.removeEventListener("pointermove", onPointerMove, true)
      element.removeEventListener("pointerup", onPointerEnd, true)
      element.removeEventListener("pointercancel", onPointerEnd, true)
      element.removeEventListener("touchmove", onTouchMove)
      presses.forEach((press) => window.clearTimeout(press.timer))
      presses.clear()
    }
  }, [documentId, interaction])
  return (
    <div ref={ref} data-slot="pdf-touch-surface">
      {children}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */
export type PdfEditorMode = "view" | "annotate" | "sign" | "forms" | "redact"
export type PdfEditorLeftPanel =
  | "thumbnails"
  | "outline"
  | "attachments"
  | "pages"
export type PdfEditorRightPanel =
  | "properties"
  | "comments"
  | "redactions"
  | "stamps"
  | "signatures"
  | "forms"
export type PdfEditorFeatureFlags = {
  /** Text markup, drawing, shapes, text boxes, notes, links, and image stamps. */
  annotate?: boolean
  /** Mark text or areas for redaction and permanently apply them. */
  redact?: boolean
  /** Fill AcroForm fields and design new form widgets. */
  forms?: boolean
  /** Draw, type, or upload signatures and initials, then place them. */
  sign?: boolean
  /** Rubber stamp libraries and custom stamps. */
  stamps?: boolean
  /** Rotate, reorder, delete, insert, extract, and merge pages. */
  pages?: boolean
  /** Password protection and permission restrictions. */
  security?: boolean
  print?: boolean
  /** Area screenshot capture. */
  capture?: boolean
  /** Bookmark outline sidebar. */
  outline?: boolean
  /** Embedded file attachments sidebar. */
  attachments?: boolean
  /** Comment threads sidebar. */
  comments?: boolean
  fullscreen?: boolean
}
export type PdfEditorResolvedFeatures = Required<PdfEditorFeatureFlags>
export const PDF_EDITOR_DEFAULT_FEATURES: PdfEditorResolvedFeatures = {
  annotate: true,
  redact: true,
  forms: true,
  sign: true,
  stamps: true,
  pages: true,
  security: true,
  print: true,
  capture: true,
  outline: true,
  attachments: true,
  comments: true,
  fullscreen: true,
}
/** A rectangle expressed as percentages (0-100) of the page size. */
export type PdfEditorNormalizedRect = {
  top: number
  left: number
  width: number
  height: number
}
export type PdfEditorSelectionPage = {
  pageIndex: number
  pageNumber: number
  pageSize: Size
  /** Bounding box in PDF points (origin top-left). */
  rect: Rect
  /** Per-line rectangles in PDF points. */
  rects: Rect[]
  normalizedRect: PdfEditorNormalizedRect
  normalizedRects: PdfEditorNormalizedRect[]
}
/** Emitted for custom text-selection actions. Coordinates are page-relative. */
export type PdfEditorSelectionPayload = PdfEditorSelectionPage & {
  documentId: string
  /** The selected text across all pages, joined with newlines. */
  text: string
  /** Every page that the selection spans (usually one). */
  pages: PdfEditorSelectionPage[]
}
export type PdfEditorSelectionAction = {
  id: string
  label: string
  icon?: React.ReactNode
  /** Called with page coordinates and the selected text. */
  onSelect?: (payload: PdfEditorSelectionPayload) => void
  /** Keep the text selected after the action runs. Defaults to false. */
  keepSelection?: boolean
}
export type PdfEditorDialogRequest =
  | {
      type: "print"
    }
  | {
      type: "security"
    }
  | {
      type: "properties"
    }
  | {
      type: "shortcuts"
    }
  | {
      type: "signature"
    }
  | {
      type: "link"
      source: "annotation" | "selection"
    }
  | {
      type: "confirm"
      title: string
      description?: string
      confirmLabel?: string
      destructive?: boolean
      onConfirm: () => void
    }
export type PdfEditorNoticeTone = "info" | "success" | "error"
export type PdfEditorContextValue = {
  documentId: string
  document: PdfDocumentObject | null
  fileName: string
  mode: PdfEditorMode
  setMode: (mode: PdfEditorMode) => void
  leftPanel: PdfEditorLeftPanel | null
  setLeftPanel: (panel: PdfEditorLeftPanel | null) => void
  toggleLeftPanel: (panel: PdfEditorLeftPanel) => void
  rightPanel: PdfEditorRightPanel | null
  setRightPanel: (panel: PdfEditorRightPanel | null) => void
  toggleRightPanel: (panel: PdfEditorRightPanel) => void
  openDialog: (request: PdfEditorDialogRequest) => void
  notify: (message: string, tone?: PdfEditorNoticeTone) => void
  features: PdfEditorResolvedFeatures
  permissions: DocumentPermissions
  annotationAuthor: string
  selectionActions: PdfEditorSelectionAction[]
  formDesignMode: boolean
  setFormDesignMode: React.Dispatch<React.SetStateAction<boolean>>
  /** Replaces the open document with new PDF bytes (page operations, flattening). */
  replaceDocument: (buffer: ArrayBuffer, fileName?: string) => void
  /** Downloads the current document, including pending edits. */
  downloadDocument: (fileName?: string) => Promise<void>
  /** Returns the current document bytes, including pending edits. */
  getDocumentBuffer: () => Promise<ArrayBuffer>
  scrollToPage: (
    pageNumber: number,
    options?: {
      smooth?: boolean
    }
  ) => void
  scrollToAnnotation: (annotation: PdfAnnotationObject) => void
  onCapture?: (event: CaptureAreaEvent) => void
  onSelectionAction?: (
    actionId: string,
    payload: PdfEditorSelectionPayload
  ) => void
  signatureFontsStylesheetUrl: string | null
}
const PdfEditorContext = React.createContext<PdfEditorContextValue | null>(null)
export const PdfEditorContextProvider = PdfEditorContext.Provider
export function usePdfEditor() {
  const context = React.useContext(PdfEditorContext)
  if (!context) {
    throw new Error("usePdfEditor must be used inside a PDFEditor.")
  }
  return context
}
/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */
export const PDF_EDITOR_DEFAULT_COLOR_PRESETS = [
  "#111827",
  "#e11d48",
  "#f97316",
  "#facc15",
  "#22c55e",
  "#0ea5e9",
  "#2563eb",
  "#8b5cf6",
  "#ec4899",
  "#64748b",
  "#ffffff",
]
export const PDF_EDITOR_SELECTION_COLOR = "#2563eb"
export const PDF_EDITOR_DEFAULT_STAMP_MANIFEST_URL =
  "https://cdn.jsdelivr.net/npm/@embedpdf/default-stamps/{locale}/manifest.json"
export const PDF_EDITOR_DEFAULT_SIGNATURE_FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Caveat&family=Dancing+Script&family=Great+Vibes&family=Pacifico&display=swap"
export const PDF_EDITOR_SIGNATURE_FONTS: ReadonlyArray<{
  name: string
  family: string
}> = [
  { name: "Dancing Script", family: "'Dancing Script', cursive" },
  { name: "Great Vibes", family: "'Great Vibes', cursive" },
  { name: "Pacifico", family: "'Pacifico', cursive" },
  { name: "Caveat", family: "'Caveat', cursive" },
]
/* -------------------------------------------------------------------------- */
/* Icons                                                                      */
/*                                                                            */
/* Icons that end up in value position (tool catalogs, switch statements) are */
/* wrapped in small `*Glyph` components so the shadcn CLI can still swap the  */
/* placeholder for the consumer's icon library at install time.               */
/* -------------------------------------------------------------------------- */
export type PdfEditorGlyphProps = {
  className?: string
  style?: React.CSSProperties
}
export type PdfEditorGlyph = React.ComponentType<PdfEditorGlyphProps>
export function PanelLeftGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconLayoutSidebar className={className} style={style} />
  )
}
export function PanelRightGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconLayoutSidebarRight className={className} style={style} />
  )
}
export function UndoGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconArrowBackUp className={className} style={style} />
  )
}
export function RedoGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconArrowForwardUp className={className} style={style} />
  )
}
export function ZoomOutGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconCircleMinus className={className} style={style} />
  )
}
export function ZoomInGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconCirclePlus className={className} style={style} />
  )
}
export function RotateGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconRotateClockwise className={className} style={style} />
  )
}
export function SearchGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconSearch className={className} style={style} />
  )
}
export function MoreGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconDots className={className} style={style} />
  )
}
export function DownloadGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconDownload className={className} style={style} />
  )
}
export function UploadGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconUpload className={className} style={style} />
  )
}
export function PrintGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconPrinter className={className} style={style} />
  )
}
export function FullscreenGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconMaximize className={className} style={style} />
  )
}
export function ExitFullscreenGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconMinimize className={className} style={style} />
  )
}
export function HandGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconHandStop className={className} style={style} />
  )
}
export function CursorGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconPointer className={className} style={style} />
  )
}
export function CameraGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconCamera className={className} style={style} />
  )
}
export function MarqueeZoomGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconZoomInArea className={className} style={style} />
  )
}
export function BookOpenGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconBook className={className} style={style} />
  )
}
export function FileGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconFile className={className} style={style} />
  )
}
export function ArrowsHorizontalGlyph({
  className,
  style,
}: PdfEditorGlyphProps) {
  return (
    <IconArrowsHorizontal className={className} style={style} />
  )
}
export function ArrowsVerticalGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconArrowsVertical className={className} style={style} />
  )
}
export function HighlighterGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconHighlight className={className} style={style} />
  )
}
export function UnderlineGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconUnderline className={className} style={style} />
  )
}
export function StrikethroughGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconStrikethrough className={className} style={style} />
  )
}
export function SquigglyGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconWaveSine className={className} style={style} />
  )
}
export function PenGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconPencil className={className} style={style} />
  )
}
export function BrushGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconBrush className={className} style={style} />
  )
}
export function TextGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconTypography className={className} style={style} />
  )
}
export function TextFontGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconTypography className={className} style={style} />
  )
}
export function CalloutGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconMessage2 className={className} style={style} />
  )
}
export function StickyNoteGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconNote className={className} style={style} />
  )
}
export function SquareGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconSquare className={className} style={style} />
  )
}
export function CircleGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconCircle className={className} style={style} />
  )
}
export function LineGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconLine className={className} style={style} />
  )
}
export function ArrowGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconArrowUpRight className={className} style={style} />
  )
}
export function PolylineGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconVectorSpline className={className} style={style} />
  )
}
export function PolygonGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconPolygon className={className} style={style} />
  )
}
export function ImageGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconPhoto className={className} style={style} />
  )
}
export function StampGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconRubberStamp className={className} style={style} />
  )
}
export function LinkGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconLink className={className} style={style} />
  )
}
export function InsertTextGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconCursorText className={className} style={style} />
  )
}
export function ReplaceTextGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconReplace className={className} style={style} />
  )
}
export function TrashGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconTrash className={className} style={style} />
  )
}
export function GroupGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconLayersUnion className={className} style={style} />
  )
}
export function UngroupGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconLayersSubtract className={className} style={style} />
  )
}
export function LockGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconLock className={className} style={style} />
  )
}
export function UnlockGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconLockOpen className={className} style={style} />
  )
}
export function CommentGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconMessageCircle className={className} style={style} />
  )
}
export function CommentsGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconMessages className={className} style={style} />
  )
}
export function CheckGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconCheck className={className} style={style} />
  )
}
export function CloseGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconX className={className} style={style} />
  )
}
export function PlusGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconPlus className={className} style={style} />
  )
}
export function MinusGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconMinus className={className} style={style} />
  )
}
export function CopyGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconCopy className={className} style={style} />
  )
}
export function EyeOffGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconEyeOff className={className} style={style} />
  )
}
export function EyeGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconEye className={className} style={style} />
  )
}
export function RedactAreaGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconSquareDashed className={className} style={style} />
  )
}
export function SignatureGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconSignature className={className} style={style} />
  )
}
export function TextFieldGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconForms className={className} style={style} />
  )
}
export function CheckboxGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconSquareCheck className={className} style={style} />
  )
}
export function RadioGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconCircleDot className={className} style={style} />
  )
}
export function ComboboxGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconSelect className={className} style={style} />
  )
}
export function ListboxGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconList className={className} style={style} />
  )
}
export function ListTreeGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconListTree className={className} style={style} />
  )
}
export function PaperclipGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconPaperclip className={className} style={style} />
  )
}
export function GridGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconLayoutGrid className={className} style={style} />
  )
}
export function SlidersGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconAdjustmentsHorizontal className={className} style={style} />
  )
}
export function InfoGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconInfoCircle className={className} style={style} />
  )
}
export function ShieldGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconShieldLock className={className} style={style} />
  )
}
export function FileTextGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconFileText className={className} style={style} />
  )
}
export function ChevronDownGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconChevronDown className={className} style={style} />
  )
}
export function ChevronUpGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconChevronUp className={className} style={style} />
  )
}
export function ChevronLeftGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconChevronLeft className={className} style={style} />
  )
}
export function ChevronRightGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconChevronRight className={className} style={style} />
  )
}
export function LayersGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconStack2 className={className} style={style} />
  )
}
export function FilePlusGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconFilePlus className={className} style={style} />
  )
}
export function ScissorsGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconScissors className={className} style={style} />
  )
}
export function MergeGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconArrowMerge className={className} style={style} />
  )
}
export function RefreshGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconRefresh className={className} style={style} />
  )
}
export function SaveGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconDeviceFloppy className={className} style={style} />
  )
}
export function KeyboardGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconKeyboard className={className} style={style} />
  )
}
export function PaletteGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconPalette className={className} style={style} />
  )
}
export function BoldGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconBold className={className} style={style} />
  )
}
export function ItalicGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconItalic className={className} style={style} />
  )
}
export function AlignLeftGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconAlignLeft className={className} style={style} />
  )
}
export function AlignCenterGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconAlignCenter className={className} style={style} />
  )
}
export function AlignRightGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconAlignRight className={className} style={style} />
  )
}
export function AlignTopGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconAlignBoxTopCenter className={className} style={style} />
  )
}
export function AlignMiddleGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconAlignBoxCenterMiddle className={className} style={style} />
  )
}
export function AlignBottomGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconAlignBoxBottomCenter className={className} style={style} />
  )
}
export function FlagGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconFlag className={className} style={style} />
  )
}
export function ClipboardGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconClipboard className={className} style={style} />
  )
}
export function KeyGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconKey className={className} style={style} />
  )
}
export function ExternalLinkGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconExternalLink className={className} style={style} />
  )
}
export function MoveGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconArrowsMove className={className} style={style} />
  )
}
export function AlertGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconAlertTriangle className={className} style={style} />
  )
}
export function ArrowUpGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconArrowUp className={className} style={style} />
  )
}
export function ArrowDownGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconArrowDown className={className} style={style} />
  )
}
export function EditGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconEdit className={className} style={style} />
  )
}
export function SparklesGlyph({ className, style }: PdfEditorGlyphProps) {
  return (
    <IconSparkles className={className} style={style} />
  )
}
/* -------------------------------------------------------------------------- */
/* Tool catalogs                                                              */
/* -------------------------------------------------------------------------- */
export type PdfEditorToolDefinition = {
  /** EmbedPDF annotation tool id. */
  id: string
  label: string
  glyph: PdfEditorGlyph
  /** Short hint shown in the tooltip. */
  hint?: string
}
export type PdfEditorToolGroup = {
  id: string
  label: string
  tools: PdfEditorToolDefinition[]
}
export const PDF_EDITOR_ANNOTATION_TOOL_GROUPS: PdfEditorToolGroup[] = [
  {
    id: "markup",
    label: "Text markup",
    tools: [
      {
        id: "highlight",
        label: "Highlight",
        glyph: HighlighterGlyph,
        hint: "Select text to highlight",
      },
      {
        id: "underline",
        label: "Underline",
        glyph: UnderlineGlyph,
        hint: "Select text to underline",
      },
      {
        id: "strikeout",
        label: "Strikethrough",
        glyph: StrikethroughGlyph,
        hint: "Select text to strike through",
      },
      {
        id: "squiggly",
        label: "Squiggly",
        glyph: SquigglyGlyph,
        hint: "Select text for a squiggly underline",
      },
    ],
  },
  {
    id: "draw",
    label: "Draw",
    tools: [
      {
        id: "ink",
        label: "Pen",
        glyph: PenGlyph,
        hint: "Draw freehand",
      },
      {
        id: "inkHighlighter",
        label: "Highlighter pen",
        glyph: BrushGlyph,
        hint: "Draw a translucent highlighter stroke",
      },
    ],
  },
  {
    id: "text",
    label: "Text",
    tools: [
      {
        id: "freeText",
        label: "Text box",
        glyph: TextGlyph,
        hint: "Click or drag to add text",
      },
      {
        id: "freeTextCallout",
        label: "Callout",
        glyph: CalloutGlyph,
        hint: "Drag to add a callout with a leader line",
      },
      {
        id: "textComment",
        label: "Sticky note",
        glyph: StickyNoteGlyph,
        hint: "Click to add a note",
      },
    ],
  },
  {
    id: "shapes",
    label: "Shapes",
    tools: [
      { id: "square", label: "Rectangle", glyph: SquareGlyph },
      { id: "circle", label: "Ellipse", glyph: CircleGlyph },
      { id: "line", label: "Line", glyph: LineGlyph },
      { id: "lineArrow", label: "Arrow", glyph: ArrowGlyph },
      {
        id: "polyline",
        label: "Polyline",
        glyph: PolylineGlyph,
        hint: "Click to add points, double-click to finish",
      },
      {
        id: "polygon",
        label: "Polygon",
        glyph: PolygonGlyph,
        hint: "Click to add points, double-click to finish",
      },
    ],
  },
  {
    id: "insert",
    label: "Insert",
    tools: [
      {
        id: "stamp",
        label: "Image",
        glyph: ImageGlyph,
        hint: "Click the page to place an image",
      },
      {
        id: "link",
        label: "Link area",
        glyph: LinkGlyph,
        hint: "Drag to add a link rectangle",
      },
      {
        id: "insertText",
        label: "Insert text mark",
        glyph: InsertTextGlyph,
        hint: "Select text to mark an insertion point",
      },
      {
        id: "replaceText",
        label: "Replace text mark",
        glyph: ReplaceTextGlyph,
        hint: "Select text to mark it for replacement",
      },
    ],
  },
]
export const PDF_EDITOR_ANNOTATION_TOOLS: PdfEditorToolDefinition[] =
  PDF_EDITOR_ANNOTATION_TOOL_GROUPS.flatMap((group) => group.tools)
export const PDF_EDITOR_FORM_TOOLS: PdfEditorToolDefinition[] = [
  {
    id: "formTextField",
    label: "Text field",
    glyph: TextFieldGlyph,
    hint: "Click or drag to add a text field",
  },
  {
    id: "formCheckbox",
    label: "Checkbox",
    glyph: CheckboxGlyph,
    hint: "Click to add a checkbox",
  },
  {
    id: "formRadioButton",
    label: "Radio button",
    glyph: RadioGlyph,
    hint: "Click to add a radio button",
  },
  {
    id: "formCombobox",
    label: "Dropdown",
    glyph: ComboboxGlyph,
    hint: "Click or drag to add a dropdown",
  },
  {
    id: "formListbox",
    label: "List box",
    glyph: ListboxGlyph,
    hint: "Click or drag to add a list box",
  },
]
export const PDF_EDITOR_MODE_OPTIONS: Array<{
  id: PdfEditorMode
  label: string
  glyph: PdfEditorGlyph
  feature: keyof PdfEditorFeatureFlags | null
}> = [
  { id: "view", label: "View", glyph: EyeGlyph, feature: null },
  { id: "annotate", label: "Annotate", glyph: PenGlyph, feature: "annotate" },
  { id: "sign", label: "Sign", glyph: SignatureGlyph, feature: "sign" },
  { id: "forms", label: "Forms", glyph: TextFieldGlyph, feature: "forms" },
  { id: "redact", label: "Redact", glyph: EyeOffGlyph, feature: "redact" },
]
export type PdfEditorAnnotationMeta = {
  label: string
  glyph: PdfEditorGlyph
  /** The most representative color of the annotation, if any. */
  color?: string
}
export function getAnnotationColor(
  annotation: PdfAnnotationObject
): string | undefined {
  const record = annotation as unknown as Record<string, unknown>
  const candidates = [record.strokeColor, record.fontColor, record.color]
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate
  }
  return undefined
}
export function getAnnotationMeta(
  annotation: PdfAnnotationObject
): PdfEditorAnnotationMeta {
  const color = getAnnotationColor(annotation)
  const intent = annotation.intent ?? ""
  switch (annotation.type) {
    case PdfAnnotationSubtype.HIGHLIGHT:
      return { label: "Highlight", glyph: HighlighterGlyph, color }
    case PdfAnnotationSubtype.UNDERLINE:
      return { label: "Underline", glyph: UnderlineGlyph, color }
    case PdfAnnotationSubtype.STRIKEOUT:
      return intent === "StrikeOutTextReplace"
        ? { label: "Replace text", glyph: ReplaceTextGlyph, color }
        : { label: "Strikethrough", glyph: StrikethroughGlyph, color }
    case PdfAnnotationSubtype.SQUIGGLY:
      return { label: "Squiggly", glyph: SquigglyGlyph, color }
    case PdfAnnotationSubtype.INK:
      return intent === "InkHighlight"
        ? { label: "Highlighter pen", glyph: BrushGlyph, color }
        : { label: "Ink", glyph: PenGlyph, color }
    case PdfAnnotationSubtype.SQUARE:
      return { label: "Rectangle", glyph: SquareGlyph, color }
    case PdfAnnotationSubtype.CIRCLE:
      return { label: "Ellipse", glyph: CircleGlyph, color }
    case PdfAnnotationSubtype.LINE:
      return intent === "LineArrow"
        ? { label: "Arrow", glyph: ArrowGlyph, color }
        : { label: "Line", glyph: LineGlyph, color }
    case PdfAnnotationSubtype.POLYLINE:
      return { label: "Polyline", glyph: PolylineGlyph, color }
    case PdfAnnotationSubtype.POLYGON:
      return { label: "Polygon", glyph: PolygonGlyph, color }
    case PdfAnnotationSubtype.FREETEXT:
      return intent === "FreeTextCallout"
        ? { label: "Callout", glyph: CalloutGlyph, color }
        : { label: "Text box", glyph: TextGlyph, color }
    case PdfAnnotationSubtype.TEXT:
      return { label: "Note", glyph: StickyNoteGlyph, color }
    case PdfAnnotationSubtype.STAMP:
      return { label: "Stamp", glyph: StampGlyph, color }
    case PdfAnnotationSubtype.LINK:
      return { label: "Link", glyph: LinkGlyph, color }
    case PdfAnnotationSubtype.CARET:
      return { label: "Insert text", glyph: InsertTextGlyph, color }
    case PdfAnnotationSubtype.REDACT:
      return { label: "Redaction", glyph: EyeOffGlyph, color }
    case PdfAnnotationSubtype.WIDGET:
      return { label: "Form field", glyph: TextFieldGlyph, color }
    case PdfAnnotationSubtype.FILEATTACHMENT:
      return { label: "Attachment", glyph: PaperclipGlyph, color }
    default:
      return { label: "Annotation", glyph: FlagGlyph, color }
  }
}
/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */
export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
export function ensurePdfExtension(fileName: string) {
  return fileName.toLowerCase().endsWith(".pdf") ? fileName : `${fileName}.pdf`
}
export function getPdfFileName(fileName: string | undefined, src?: string) {
  if (fileName?.trim()) return ensurePdfExtension(fileName.trim())
  if (src && !/^(blob|data):/i.test(src)) {
    const pathname = src.split(/[?#]/)[0] ?? ""
    const rawName = pathname.split("/").pop() || ""
    if (rawName) {
      try {
        return ensurePdfExtension(decodeURIComponent(rawName))
      } catch {
        return ensurePdfExtension(rawName)
      }
    }
  }
  return "document.pdf"
}
export function withFileNameSuffix(fileName: string, suffix: string) {
  return ensurePdfExtension(fileName.replace(/\.pdf$/i, "") + suffix)
}
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = fileName
  anchor.rel = "noopener"
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
export function downloadArrayBuffer(
  buffer: ArrayBuffer | Uint8Array,
  fileName: string,
  type = "application/pdf"
) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  downloadBlob(new Blob([copy], { type }), fileName)
}
export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return copy
}
export function readFileAsArrayBuffer(file: Blob) {
  return file.arrayBuffer()
}
export function formatBytes(bytes: number | undefined) {
  if (bytes === undefined || Number.isNaN(bytes)) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
export function formatDateTime(date: Date | undefined | null) {
  if (!date) return "—"
  const value = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(value.getTime())) return "—"
  return value.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}
export function formatRelativeDate(date: Date | undefined | null) {
  if (!date) return ""
  const value = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(value.getTime())) return ""
  const diff = Date.now() - value.getTime()
  const minutes = Math.round(diff / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return value.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
}
export function toNormalizedRect(
  rect: Rect,
  pageSize: Size
): PdfEditorNormalizedRect {
  const width = pageSize.width || 1
  const height = pageSize.height || 1
  return {
    top: (rect.origin.y / height) * 100,
    left: (rect.origin.x / width) * 100,
    width: (rect.size.width / width) * 100,
    height: (rect.size.height / height) * 100,
  }
}
export function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return Boolean(
    target.closest(
      "input, textarea, select, [contenteditable='true'], [contenteditable='']"
    )
  )
}
export function isMacPlatform() {
  if (typeof navigator === "undefined") return false
  return /mac|iphone|ipad|ipod/i.test(navigator.platform)
}
export function formatShortcut(shortcut: string) {
  const mac = isMacPlatform()
  return shortcut
    .replace(/mod/gi, mac ? "⌘" : "Ctrl")
    .replace(/shift/gi, mac ? "⇧" : "Shift")
    .replace(/alt/gi, mac ? "⌥" : "Alt")
}
export function uniqueName(base: string, existing: Iterable<string>) {
  const taken = new Set(existing)
  if (!taken.has(base)) return base
  let index = 2
  while (taken.has(`${base} ${index}`)) index += 1
  return `${base} ${index}`
}
export function noop() {}
/* -------------------------------------------------------------------------- */
/* Small UI primitives shared by the editor files                             */
/* -------------------------------------------------------------------------- */
export function PdfEditorTooltip({
  label,
  shortcut,
  children,
}: {
  label: React.ReactNode
  shortcut?: string
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{children}</span>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <span className="inline-flex items-center gap-2">
          {label}
          {shortcut ? (
            <Kbd className="h-4 min-w-4 px-1 text-[10px]">
              {formatShortcut(shortcut)}
            </Kbd>
          ) : null}
        </span>
      </TooltipContent>
    </Tooltip>
  )
}
export function PdfEditorToolButton({
  label,
  shortcut,
  active = false,
  className,
  children,
  size = "icon-sm",
  variant = "ghost",
  ...props
}: Omit<ButtonProps, "variant" | "size" | "children"> & {
  label: string
  shortcut?: string
  active?: boolean
  size?: ButtonProps["size"]
  variant?: ButtonProps["variant"]
  children: React.ReactNode
}) {
  return (
    <PdfEditorTooltip label={label} shortcut={shortcut}>
      <Button
        type="button"
        variant={variant}
        size={size}
        aria-label={label}
        aria-pressed={active}
        data-active={active ? "" : undefined}
        className={cn(
          active &&
            "bg-accent text-accent-foreground ring-1 ring-ring/40 ring-inset",
          className
        )}
        {...props}
      >
        {children}
      </Button>
    </PdfEditorTooltip>
  )
}
export function PdfEditorToolbarSeparator({
  className,
}: {
  className?: string
}) {
  return (
    <div
      aria-hidden="true"
      className={cn("mx-1 h-4 w-px shrink-0 self-center bg-border", className)}
    />
  )
}
export function PdfEditorPanelHeader({
  title,
  description,
  actions,
  onClose,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  onClose?: () => void
}) {
  return (
    <div className="flex shrink-0 items-start justify-between gap-2 border-b px-3 py-2.5">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-foreground">
          {title}
        </div>
        {description ? (
          <div className="mt-0.5 text-xs text-muted-foreground">
            {description}
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {actions}
        {onClose ? (
          <PdfEditorToolButton
            label="Close panel"
            size="icon-xs"
            onClick={onClose}
          >
            <CloseGlyph className="size-3.5" />
          </PdfEditorToolButton>
        ) : null}
      </div>
    </div>
  )
}
export function PdfEditorEmptyState({
  glyph: Glyph,
  title,
  description,
  action,
  className,
}: {
  glyph?: PdfEditorGlyph
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 px-4 py-10 text-center",
        className
      )}
    >
      {Glyph ? (
        <div className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
          <Glyph className="size-5" />
        </div>
      ) : null}
      <div className="text-sm font-medium text-foreground">{title}</div>
      {description ? (
        <div className="max-w-56 text-xs text-muted-foreground">
          {description}
        </div>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}
export function PdfEditorSection({
  title,
  actions,
  children,
  className,
}: {
  title?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn("space-y-2", className)}>
      {title || actions ? (
        <div className="flex items-center justify-between gap-2">
          {title ? (
            <div className="text-xs font-medium text-muted-foreground">
              {title}
            </div>
          ) : (
            <span />
          )}
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  )
}
export function PdfEditorFieldLabel({
  children,
  htmlFor,
  className,
}: {
  children: React.ReactNode
  htmlFor?: string
  className?: string
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn("block text-xs font-medium text-foreground", className)}
    >
      {children}
    </label>
  )
}
export function PdfEditorCheckbox({
  checked,
  disabled,
  label,
  description,
  onCheckedChange,
  className,
}: {
  checked: boolean
  disabled?: boolean
  label: React.ReactNode
  description?: React.ReactNode
  onCheckedChange: (checked: boolean) => void
  className?: string
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn("pdf-check-row", className)}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pdf-check-row__box",
          checked && "pdf-check-row__box--checked"
        )}
      >
        {checked ? <CheckGlyph className="size-3" /> : null}
      </span>
      <span className="pdf-check-row__text">
        <span className="pdf-check-row__label">{label}</span>
        {description ? (
          <span className="pdf-check-row__description">{description}</span>
        ) : null}
      </span>
    </button>
  )
}
export function PdfEditorSwatch({
  color,
  active,
  label,
  onClick,
  size = "md",
}: {
  color: string
  active?: boolean
  label?: string
  onClick?: () => void
  size?: "sm" | "md"
}) {
  const isTransparent = color === "transparent"
  const accessibleLabel = label ?? (isTransparent ? "No fill" : color)
  const swatch = (
    <button
      type="button"
      aria-label={accessibleLabel}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "pdf-swatch",
        size === "sm" && "pdf-swatch--small",
        active && "pdf-swatch--active"
      )}
      style={
        isTransparent
          ? {
              backgroundImage:
                "linear-gradient(45deg, transparent 45%, #ef4444 45%, #ef4444 55%, transparent 55%)",
              backgroundColor: "#fff",
            }
          : { backgroundColor: color }
      }
    />
  )
  return label ? (
    <PdfEditorTooltip label={label}>{swatch}</PdfEditorTooltip>
  ) : (
    swatch
  )
}
/* -------------------------------------------------------------------------- */
/* Scroll area with a resolvable viewport (mirrors the PDF viewer)            */
/* -------------------------------------------------------------------------- */
export type PdfEditorScrollAreaViewportResolver = (
  container: HTMLDivElement
) => HTMLDivElement | null
const DEFAULT_SCROLL_AREA_VIEWPORT_SELECTOR =
  '[data-slot="scroll-area-viewport"]'
export function resolveDefaultScrollAreaViewport(container: HTMLDivElement) {
  return container.querySelector<HTMLDivElement>(
    DEFAULT_SCROLL_AREA_VIEWPORT_SELECTOR
  )
}
export const PdfEditorScrollAreaResolverContext =
  React.createContext<PdfEditorScrollAreaViewportResolver>(
    resolveDefaultScrollAreaViewport
  )
function setRefValue<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (!ref) return
  if (typeof ref === "function") {
    ref(value)
  } else {
    ref.current = value
  }
}
export function PdfEditorScrollArea({
  children,
  className,
  orientation = "vertical",
  scrollbarGutter = true,
  viewportClassName,
  viewportProps,
  viewportRef,
}: {
  children: React.ReactNode
  className?: string
  orientation?: "vertical" | "horizontal" | "both"
  scrollbarGutter?: boolean
  viewportClassName?: string
  viewportProps?: React.HTMLAttributes<HTMLDivElement>
  viewportRef?: React.Ref<HTMLDivElement>
}) {
  const resolveViewport = React.useContext(PdfEditorScrollAreaResolverContext)
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const { className: viewportPropsClassName, ...resolvedViewportProps } =
    viewportProps ?? {}
  const setViewportRef = React.useCallback(
    (viewport: HTMLDivElement | null) => {
      setRefValue(viewportRef, viewport)
    },
    [viewportRef]
  )
  React.useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const viewport = resolveViewport(container)
    if (!viewport) {
      console.error(
        `PDFEditor could not resolve the scroll viewport. Add ${DEFAULT_SCROLL_AREA_VIEWPORT_SELECTOR} to your ScrollArea viewport or pass resolveScrollAreaViewport.`
      )
      return
    }
    setViewportRef(viewport)
    return () => setViewportRef(null)
  }, [resolveViewport, setViewportRef])
  return (
    <div
      ref={containerRef}
      data-slot="pdf-editor-scroll-area"
      className={cn("size-full min-h-0", className)}
    >
      <InlineScrollArea2
        className="size-full min-h-0"
        orientation={orientation}
        scrollbarGutter={scrollbarGutter}
      >
        <div
          {...resolvedViewportProps}
          data-slot="pdf-editor-scroll-content"
          className={cn(
            "min-h-full",
            viewportPropsClassName,
            viewportClassName
          )}
        >
          {children}
        </div>
      </InlineScrollArea2>
    </div>
  )
}

type ButtonProps = React.ComponentProps<typeof Button>
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
