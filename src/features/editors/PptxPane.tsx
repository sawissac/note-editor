import "@/styles/pptx-pane.css";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  IconAlertTriangle,
  IconAlignBoxCenterBottom,
  IconAlignBoxCenterMiddle,
  IconAlignBoxCenterTop,
  IconAlignCenter,
  IconAlignLeft,
  IconAlignRight,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconArrowNarrowRight,
  IconBold,
  IconCircle,
  IconCopyPlus,
  IconDiamond,
  IconItalic,
  IconLetterT,
  IconMinus,
  IconPhotoPlus,
  IconPlayerPlay,
  IconPlus,
  IconShape,
  IconSquare,
  IconSquareRounded,
  IconStackBack,
  IconStackFront,
  IconStackPop,
  IconStackPush,
  IconStar,
  IconTrash,
  IconTriangle,
  IconUnderline,
  IconX,
  type Icon,
} from "@tabler/icons-react";
import Konva from "konva";
import * as React from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  ResizableGroup,
  ResizableHandle,
  ResizablePanel,
} from "@/components/ui/resizable";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/cn";
import {
  cloneElement,
  cloneSlide,
  contentSlide,
  FONT_FAMILIES,
  isHexColor,
  isLineShape,
  MAX_FONT_SIZE,
  MAX_STROKE_WIDTH,
  MIN_ELEMENT_SIZE,
  MIN_FONT_SIZE,
  newImage,
  newShape,
  newText,
  parseElements,
  parsePptx,
  type PptxDoc,
  serializePptx,
  SHAPE_KINDS,
  type ShapeElement,
  type ShapeKind,
  type Slide,
  type SlideElement,
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  starterDeck,
  SWATCHES,
  type TextAlign,
  type TextElement,
  TEXT_LINE_HEIGHT,
  TEXT_PADDING,
  type TextValign,
} from "@/lib/pptx-doc";
import {
  type DrawOptions,
  type ImageStore,
  importPicture,
  loadDeckImages,
  renderSlideCanvas,
  slideNodes,
  syncElementNode,
  textHeight,
} from "@/lib/pptx-render";
import { BREAKPOINT, useMediaQuery } from "@/lib/use-media-query";
import * as ui from "@/lib/ui-styles";
import { saveContent } from "@/store/actions";
import { useAppDispatch } from "@/store";
import { FileBarSlot } from "@/features/editors/file-bar-slot";
import { PaneSplit } from "@/features/editors/pane-split";
import {
  type PaneProps,
  useSaveHandler,
} from "@/features/editors/pane-context";
import { useDebouncedSave } from "@/features/editors/use-file-content";

/** Room around the slide inside the stage, so handles on its edge show. */
const STAGE_MARGIN = 36;
/** Steps kept for undo. */
const HISTORY_LIMIT = 100;
/** Edits with the same tag inside this window undo as one step. */
const COALESCE_MS = 800;
/** Clipboard type carrying copied slide elements. */
const CLIP_TYPE = "application/x-bento-slide-elements";

const ALL_ANCHORS = [
  "top-left",
  "top-center",
  "top-right",
  "middle-right",
  "middle-left",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];
const LINE_ANCHORS = ["middle-left", "middle-right"];
const ROTATION_SNAPS = [0, 45, 90, 135, 180, 225, 270, 315];

const SHAPE_ICON: Record<ShapeKind, Icon> = {
  rect: IconSquare,
  rounded: IconSquareRounded,
  ellipse: IconCircle,
  triangle: IconTriangle,
  diamond: IconDiamond,
  star: IconStar,
  line: IconMinus,
  arrow: IconArrowNarrowRight,
};

type ArrangeMode = "front" | "forward" | "backward" | "back";
/** Position, size and rotation — what dragging and resizing change. */
type BoxPatch = Partial<
  Pick<SlideElement, "x" | "y" | "width" | "height" | "rotation">
>;

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  Boolean(target.closest("input, textarea, select, [contenteditable=true]"));

/** Moves the elements in `ids` up or down the stack, keeping their order. */
function arrange(elements: SlideElement[], ids: string[], mode: ArrangeMode) {
  const picked = (el: SlideElement) => ids.includes(el.id);
  if (mode === "front") {
    return [
      ...elements.filter((el) => !picked(el)),
      ...elements.filter(picked),
    ];
  }
  if (mode === "back") {
    return [
      ...elements.filter(picked),
      ...elements.filter((el) => !picked(el)),
    ];
  }
  const next = [...elements];
  if (mode === "forward") {
    for (let i = next.length - 2; i >= 0; i--) {
      if (picked(next[i]) && !picked(next[i + 1])) {
        [next[i], next[i + 1]] = [next[i + 1], next[i]];
      }
    }
  } else {
    for (let i = 1; i < next.length; i++) {
      if (picked(next[i]) && !picked(next[i - 1])) {
        [next[i], next[i - 1]] = [next[i - 1], next[i]];
      }
    }
  }
  return next;
}

/**
 * `.pptx` files: a slide editor. The left column lists the slides
 * (drag to reorder, duplicate, delete); the middle is the slide itself —
 * click to select, drag to move, handles to resize and rotate, double-click
 * a text box to type; the right column styles the selection (font, colours,
 * outline, opacity, stacking order) or, with nothing selected, the slide
 * (background, speaker notes). The file bar adds text boxes, shapes and
 * pictures and runs the slide show; the file bar's download icon saves a
 * real PowerPoint `.pptx`. Pictures also paste or drop straight onto the
 * slide. Edits save automatically.
 *
 * Keys (slide focused): Delete removes, arrows nudge (Shift ×10), ⌘/Ctrl+D
 * duplicates, ⌘/Ctrl+C / X / V copy, cut, paste, ⌘/Ctrl+A selects all,
 * ⌘/Ctrl+Z / Shift+Z undo, redo, Enter edits the selected text box,
 * PageUp / PageDown change slide, Escape deselects.
 *
 * Test ids: `pptx-pane`, `pptx-pane-undo-button`,
 * `pptx-pane-redo-button`, `pptx-pane-add-text-button`,
 * `pptx-pane-shape-trigger`, `pptx-pane-shape-<kind>-item`,
 * `pptx-pane-add-image-button`, `pptx-pane-image-input`,
 * `pptx-pane-present-button`, `pptx-pane-slide-list`,
 * `pptx-pane-add-slide-button`, `pptx-pane-workspace`,
 * `pptx-pane-parse-error-message`, `pptx-pane-notice-message`,
 * `pptx-pane-notice-dismiss-button`. Children: see
 * {@link PptxSlideRow}, {@link PptxStage},
 * {@link PptxTextEditor}, {@link PptxInspector},
 * {@link PptxShow}.
 *
 * CSS: block `pptx-pane` (`src/styles/pptx-pane.css`).
 */
export default function PptxPane({ id, content, registerSave }: PaneProps) {
  const dispatch = useAppDispatch();
  // Wide: slides | canvas | settings. Narrower: settings drop below.
  const wide = useMediaQuery(BREAKPOINT.lg);
  const initial = React.useMemo(() => {
    try {
      return {
        doc: parsePptx(typeof content === "string" ? content : ""),
        error: null as string | null,
      };
    } catch (error) {
      return { doc: starterDeck(), error: (error as Error).message };
    }
    // Mounted per file — `content` only seeds state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [doc, setDoc] = React.useState(initial.doc);
  const [parseError, setParseError] = React.useState(initial.error);
  const [slideId, setSlideId] = React.useState(initial.doc.slides[0].id);
  const [selection, setSelection] = React.useState<string[]>([]);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [presenting, setPresenting] = React.useState<number | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [dropping, setDropping] = React.useState(false);
  const [scale, setScale] = React.useState(0.5);
  // Bumped when a picture finishes decoding, so slides redraw with it.
  const [imageTick, setImageTick] = React.useState(0);

  const imagesRef = React.useRef<ImageStore>(new Map());
  const workspaceRef = React.useRef<HTMLDivElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const docRef = React.useRef(doc);
  docRef.current = doc;
  const history = React.useRef({
    past: [] as PptxDoc[],
    future: [] as PptxDoc[],
    tag: null as string | null,
    at: 0,
  });

  const slideIndex = Math.max(
    0,
    doc.slides.findIndex((s) => s.id === slideId),
  );
  const slide = doc.slides[slideIndex];
  const selected = slide.elements.filter((el) => selection.includes(el.id));
  const editing = slide.elements.find(
    (el): el is TextElement => el.id === editingId && el.type === "text",
  );

  /* ───────────── Saving and history ───────────── */

  // The deck is serialised when the save fires, not on every edit — with
  // pictures in it the JSON runs to megabytes.
  const save = useDebouncedSave(
    () => void dispatch(saveContent(id, serializePptx(docRef.current))),
  );
  useSaveHandler(registerSave, () => {
    if (!parseError) {
      return dispatch(saveContent(id, serializePptx(docRef.current)));
    }
  });

  const show = (next: PptxDoc) => {
    docRef.current = next;
    setDoc(next);
    setParseError(null);
    save("");
  };

  /** Applies an edit. Edits sharing a `tag` in quick succession undo as one. */
  const update = (fn: (d: PptxDoc) => PptxDoc, tag?: string) => {
    const prev = docRef.current;
    const next = fn(prev);
    if (next === prev) return;
    const h = history.current;
    const now = Date.now();
    if (!(tag && h.tag === tag && now - h.at < COALESCE_MS)) {
      h.past.push(prev);
      if (h.past.length > HISTORY_LIMIT) h.past.shift();
    }
    h.tag = tag ?? null;
    h.at = now;
    h.future = [];
    show(next);
  };

  const undo = () => {
    const h = history.current;
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push(docRef.current);
    h.tag = null;
    setEditingId(null);
    show(prev);
  };
  const redo = () => {
    const h = history.current;
    const next = h.future.pop();
    if (!next) return;
    h.past.push(docRef.current);
    h.tag = null;
    setEditingId(null);
    show(next);
  };

  const updateSlide = (fn: (s: Slide) => Slide, tag?: string) =>
    update((d) => {
      let changed = false;
      const slides = d.slides.map((s) => {
        if (s.id !== slide.id) return s;
        const next = fn(s);
        if (next !== s) changed = true;
        return next;
      });
      return changed ? { ...d, slides } : d;
    }, tag);

  const patchElements = (
    ids: string[],
    fn: (el: SlideElement) => SlideElement,
    tag?: string,
  ) =>
    updateSlide((s) => {
      let changed = false;
      const elements = s.elements.map((el) => {
        if (!ids.includes(el.id)) return el;
        const next = fn(el);
        if (next === el) return el;
        changed = true;
        // Konva cuts text that overflows its box, so a text box is always
        // at least as tall as what it holds.
        return next.type === "text"
          ? { ...next, height: Math.max(next.height, textHeight(next)) }
          : next;
      });
      return changed ? { ...s, elements } : s;
    }, tag);

  /* ───────────── Pictures and sizing ───────────── */

  React.useEffect(() => {
    let live = true;
    void loadDeckImages(initial.doc, imagesRef.current).then(() => {
      if (live) setImageTick((t) => t + 1);
    });
    return () => {
      live = false;
    };
  }, [initial.doc]);

  // The slide is drawn as large as the workspace allows.
  React.useEffect(() => {
    const el = workspaceRef.current;
    if (!el) return;
    const fit = () => {
      const room = 2 * STAGE_MARGIN + 8;
      const next = Math.min(
        (el.clientWidth - room) / SLIDE_WIDTH,
        (el.clientHeight - room) / SLIDE_HEIGHT,
      );
      setScale(Math.min(3, Math.max(0.15, next)));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /* ───────────── Elements ───────────── */

  const focusSlide = () => workspaceRef.current?.focus({ preventScroll: true });

  const addElements = (elements: SlideElement[], edit = false) => {
    if (!elements.length) return;
    updateSlide((s) => ({ ...s, elements: [...s.elements, ...elements] }));
    setSelection(elements.map((el) => el.id));
    setEditingId(edit ? elements[0].id : null);
    if (!edit) focusSlide();
  };

  const addPictures = async (files: Blob[]) => {
    setNotice(null);
    for (const file of files) {
      try {
        const picture = await importPicture(file);
        imagesRef.current.set(picture.key, picture.image);
        const element = newImage(picture.key, picture.width, picture.height);
        update((d) => ({
          ...d,
          images: { ...d.images, [picture.key]: picture.src },
          slides: d.slides.map((s) =>
            s.id === slide.id
              ? { ...s, elements: [...s.elements, element] }
              : s,
          ),
        }));
        setSelection([element.id]);
        setEditingId(null);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : String(error));
      }
    }
    focusSlide();
  };

  const removeSelection = () => {
    if (!selected.length) return;
    updateSlide((s) => ({
      ...s,
      elements: s.elements.filter((el) => !selection.includes(el.id)),
    }));
    setSelection([]);
    setEditingId(null);
  };

  const duplicateSelection = () => {
    addElements(selected.map((el) => cloneElement(el)));
  };

  const commitText = (elementId: string, text: string) => {
    setEditingId(null);
    // The box grows to hold what was typed (see `patchElements`).
    patchElements([elementId], (el) =>
      el.type !== "text" || el.text === text ? el : { ...el, text },
    );
  };

  /* ───────────── Slides ───────────── */

  const openSlide = (nextId: string) => {
    setSlideId(nextId);
    setSelection([]);
    setEditingId(null);
  };

  const addSlide = () => {
    const next = contentSlide(slide.background);
    update((d) => ({
      ...d,
      slides: [
        ...d.slides.slice(0, slideIndex + 1),
        next,
        ...d.slides.slice(slideIndex + 1),
      ],
    }));
    openSlide(next.id);
  };

  const duplicateSlide = (sourceId: string) => {
    const index = doc.slides.findIndex((s) => s.id === sourceId);
    if (index < 0) return;
    const copy = cloneSlide(doc.slides[index]);
    update((d) => ({
      ...d,
      slides: [
        ...d.slides.slice(0, index + 1),
        copy,
        ...d.slides.slice(index + 1),
      ],
    }));
    openSlide(copy.id);
  };

  const removeSlide = (targetId: string) => {
    if (doc.slides.length < 2) return;
    const index = doc.slides.findIndex((s) => s.id === targetId);
    if (index < 0) return;
    update((d) => ({
      ...d,
      slides: d.slides.filter((s) => s.id !== targetId),
    }));
    if (targetId === slide.id) {
      openSlide((doc.slides[index + 1] ?? doc.slides[index - 1]).id);
    }
  };

  const sensors = useSensors(
    // 5px of travel before a press becomes a drag, so clicks still select.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // Space lifts a slide; Enter is left alone so it still opens one.
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: {
        start: ["Space"],
        cancel: ["Escape"],
        end: ["Space", "Enter"],
      },
    }),
  );
  const onSlideDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    update((d) => {
      const from = d.slides.findIndex((s) => s.id === active.id);
      const to = d.slides.findIndex((s) => s.id === over.id);
      return from < 0 || to < 0
        ? d
        : { ...d, slides: arrayMove(d.slides, from, to) };
    });
  };

  /* ───────────── Keyboard and clipboard ───────────── */

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (isTyping(e.target)) return;
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();
    if (mod && key === "z") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if (mod && key === "y") {
      e.preventDefault();
      redo();
    } else if (mod && key === "d") {
      e.preventDefault();
      duplicateSelection();
    } else if (mod && key === "a") {
      e.preventDefault();
      setSelection(slide.elements.map((el) => el.id));
    } else if (mod || e.altKey) {
      return;
    } else if (key === "delete" || key === "backspace") {
      e.preventDefault();
      removeSelection();
    } else if (key === "escape") {
      setSelection([]);
    } else if (key === "enter" && selected.length === 1) {
      if (selected[0].type === "text") {
        e.preventDefault();
        setEditingId(selected[0].id);
      }
    } else if (key.startsWith("arrow") && selected.length) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const dx = key === "arrowleft" ? -step : key === "arrowright" ? step : 0;
      const dy = key === "arrowup" ? -step : key === "arrowdown" ? step : 0;
      patchElements(
        selection,
        (el) => ({ ...el, x: el.x + dx, y: el.y + dy }),
        "nudge",
      );
    } else if (key === "pagedown" || key === "pageup") {
      const next = doc.slides[slideIndex + (key === "pagedown" ? 1 : -1)];
      if (next) {
        e.preventDefault();
        openSlide(next.id);
      }
    }
  };

  const onCopy = (e: React.ClipboardEvent) => {
    if (isTyping(e.target) || !selected.length) return;
    e.preventDefault();
    e.clipboardData.setData(CLIP_TYPE, JSON.stringify(selected));
    e.clipboardData.setData(
      "text/plain",
      selected
        .filter((el): el is TextElement => el.type === "text")
        .map((el) => el.text)
        .join("\n"),
    );
  };

  const onPaste = (e: React.ClipboardEvent) => {
    if (isTyping(e.target)) return;
    const pictures = Array.from(e.clipboardData.files).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (pictures.length) {
      e.preventDefault();
      void addPictures(pictures);
      return;
    }
    const copied = e.clipboardData.getData(CLIP_TYPE);
    if (copied) {
      e.preventDefault();
      try {
        addElements(
          parseElements(JSON.parse(copied), doc.images).map((el) =>
            cloneElement(el),
          ),
        );
      } catch {
        // Not ours after all — ignore.
      }
      return;
    }
    const text = e.clipboardData.getData("text/plain").trim();
    if (text) {
      e.preventDefault();
      const box = newText({ text, x: 180, width: 600 });
      addElements([{ ...box, height: Math.max(box.height, textHeight(box)) }]);
    }
  };

  const canUndo = history.current.past.length > 0;
  const canRedo = history.current.future.length > 0;

  return (
    <>
      <FileBarSlot>
        <ButtonGroup aria-label="History">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={ui.paneToolbarBtn}
            data-testid="pptx-pane-undo-button"
            aria-label="Undo"
            title="Undo (⌘/Ctrl+Z)"
            disabled={!canUndo}
            onClick={undo}
          >
            <IconArrowBackUp aria-hidden className="pane-icon" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={ui.paneToolbarBtn}
            data-testid="pptx-pane-redo-button"
            aria-label="Redo"
            title="Redo (⌘/Ctrl+Shift+Z)"
            disabled={!canRedo}
            onClick={redo}
          >
            <IconArrowForwardUp aria-hidden className="pane-icon" />
          </Button>
        </ButtonGroup>

        <ButtonGroup aria-label="Insert">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={ui.paneToolbarBtn}
            data-testid="pptx-pane-add-text-button"
            title="Add a text box"
            onClick={() => addElements([newText()], true)}
          >
            <IconLetterT aria-hidden className="pane-icon" />
            Text
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={ui.paneToolbarBtn}
                data-testid="pptx-pane-shape-trigger"
                title="Add a shape"
              >
                <IconShape aria-hidden className="pane-icon" />
                Shape
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {SHAPE_KINDS.map((shape) => {
                const ShapeIcon = SHAPE_ICON[shape.value];
                return (
                  <DropdownMenuItem
                    key={shape.value}
                    data-testid={`pptx-pane-shape-${shape.value}-item`}
                    onSelect={() => addElements([newShape(shape.value)])}
                  >
                    <ShapeIcon aria-hidden />
                    {shape.label}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={ui.paneToolbarBtn}
            data-testid="pptx-pane-add-image-button"
            title="Add a picture — or paste / drop one onto the slide"
            onClick={() => fileInputRef.current?.click()}
          >
            <IconPhotoPlus aria-hidden className="pane-icon" />
            Image
          </Button>
        </ButtonGroup>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className={ui.paneToolbarBtn}
          data-testid="pptx-pane-present-button"
          title="Start the slide show from this slide"
          onClick={() => {
            setEditingId(null);
            setPresenting(slideIndex);
          }}
        >
          <IconPlayerPlay aria-hidden className="pane-icon" />
          Present
        </Button>
      </FileBarSlot>

      <div className="pptx-pane" data-testid="pptx-pane">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.heic,.heif,.tif,.tiff"
          multiple
          className="pptx-pane__file-input"
          aria-label="Add pictures"
          data-testid="pptx-pane-image-input"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            void addPictures(files);
          }}
        />

        <PaneSplit
          sideSize="17rem"
          sideMinSize={200}
          stackedSideSize="45%"
          breakpoint={BREAKPOINT.lg}
        >
          <ResizableGroup orientation="horizontal">
            <ResizablePanel
              defaultSize={wide ? "10rem" : "6.5rem"}
              minSize={88}
              maxSize="40%"
              groupResizeBehavior="preserve-pixel-size"
            >
              <nav className="pptx-pane__slides" aria-label="Slides">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={onSlideDragEnd}
                >
                  <SortableContext
                    items={doc.slides.map((s) => s.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <ol
                      className="pptx-pane__slide-list"
                      data-testid="pptx-pane-slide-list"
                    >
                      {doc.slides.map((s, index) => (
                        <PptxSlideRow
                          key={s.id}
                          slide={s}
                          index={index}
                          selected={s.id === slide.id}
                          removable={doc.slides.length > 1}
                          images={imagesRef.current}
                          imageTick={imageTick}
                          onOpen={openSlide}
                          onDuplicate={duplicateSlide}
                          onRemove={removeSlide}
                        />
                      ))}
                    </ol>
                  </SortableContext>
                </DndContext>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="pptx-pane__add-slide"
                  data-testid="pptx-pane-add-slide-button"
                  title="Add a slide after this one"
                  onClick={addSlide}
                >
                  <IconPlus aria-hidden className="pane-icon" />
                  Slide
                </Button>
              </nav>
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel minSize={200}>
              <div className="pptx-pane__main">
                {parseError ? (
                  <div className="pptx-pane__notice" role="alert">
                    <IconAlertTriangle aria-hidden className="pane-icon" />
                    <p
                      className="pptx-pane__notice-text"
                      data-testid="pptx-pane-parse-error-message"
                    >
                      This file is not a valid slide deck ({parseError}). Any
                      change replaces it with the deck shown.
                    </p>
                  </div>
                ) : null}
                {notice ? (
                  <div className="pptx-pane__notice" role="alert">
                    <IconAlertTriangle aria-hidden className="pane-icon" />
                    <p
                      className="pptx-pane__notice-text"
                      data-testid="pptx-pane-notice-message"
                    >
                      {notice}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Dismiss"
                      data-testid="pptx-pane-notice-dismiss-button"
                      onClick={() => setNotice(null)}
                    >
                      <IconX aria-hidden />
                    </Button>
                  </div>
                ) : null}

                <div
                  ref={workspaceRef}
                  tabIndex={0}
                  role="application"
                  aria-label={`Slide ${slideIndex + 1} of ${doc.slides.length}`}
                  className={cn(
                    "pptx-pane__workspace",
                    dropping && "pptx-pane__workspace--dropping",
                  )}
                  data-testid="pptx-pane-workspace"
                  onKeyDown={onKeyDown}
                  onCopy={onCopy}
                  onCut={(e) => {
                    if (isTyping(e.target) || !selected.length) return;
                    onCopy(e);
                    removeSelection();
                  }}
                  onPaste={onPaste}
                  onPointerDown={(e) => {
                    if (e.target === e.currentTarget) setSelection([]);
                  }}
                  onDragOver={(e) => {
                    if (!e.dataTransfer.types.includes("Files")) return;
                    e.preventDefault();
                    setDropping(true);
                  }}
                  onDragLeave={() => setDropping(false)}
                  onDrop={(e) => {
                    setDropping(false);
                    const files = Array.from(e.dataTransfer.files);
                    if (!files.length) return;
                    e.preventDefault();
                    void addPictures(files);
                  }}
                >
                  <div
                    className="pptx-pane__canvas"
                    style={{
                      width: SLIDE_WIDTH * scale + 2 * STAGE_MARGIN,
                      height: SLIDE_HEIGHT * scale + 2 * STAGE_MARGIN,
                    }}
                  >
                    <PptxStage
                      slide={slide}
                      images={imagesRef.current}
                      imageTick={imageTick}
                      scale={scale}
                      selection={selection}
                      editingId={editing?.id ?? null}
                      onSelect={(ids) => {
                        setSelection(ids);
                        focusSlide();
                      }}
                      onBoxes={(boxes) =>
                        patchElements([...boxes.keys()], (el) => {
                          const box = boxes.get(el.id);
                          const moved =
                            box &&
                            (Object.keys(box) as Array<keyof BoxPatch>).some(
                              (field) => box[field] !== el[field],
                            );
                          return moved ? { ...el, ...box } : el;
                        })
                      }
                      onEdit={(elementId) => {
                        setSelection([elementId]);
                        setEditingId(elementId);
                      }}
                    />
                    {editing ? (
                      <PptxTextEditor
                        key={editing.id}
                        element={editing}
                        scale={scale}
                        onCommit={(text) => {
                          commitText(editing.id, text);
                          // Escape leaves focus nowhere; a click elsewhere has
                          // already moved it and keeps it.
                          requestAnimationFrame(() => {
                            if (document.activeElement === document.body) {
                              focusSlide();
                            }
                          });
                        }}
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            </ResizablePanel>
          </ResizableGroup>

          <PptxInspector
            slide={slide}
            selected={selected}
            onSlide={(patch, tag) =>
              updateSlide((s) => ({ ...s, ...patch }), tag)
            }
            onBackgroundAll={() =>
              update((d) => ({
                ...d,
                slides: d.slides.map((s) =>
                  s.background === slide.background
                    ? s
                    : { ...s, background: slide.background },
                ),
              }))
            }
            onElements={(patch, tag) =>
              patchElements(selection, (el) => ({ ...el, ...patch }), tag)
            }
            onText={(patch, tag) =>
              patchElements(
                selection,
                (el) => (el.type === "text" ? { ...el, ...patch } : el),
                tag,
              )
            }
            onShape={(patch, tag) =>
              patchElements(
                selection,
                (el) => {
                  if (el.type !== "shape") return el;
                  const next = { ...el, ...patch };
                  const middle = el.y + el.height / 2;
                  // A line has nothing but its outline — keep it drawn.
                  if (isLineShape(next)) {
                    return {
                      ...next,
                      y: isLineShape(el) ? next.y : middle - 12,
                      height: isLineShape(el) ? next.height : 24,
                      fill: null,
                      stroke: next.stroke ?? el.stroke ?? "#0f172a",
                      strokeWidth: Math.max(1, next.strokeWidth),
                    };
                  }
                  // A line turned into a box needs a body.
                  return isLineShape(el)
                    ? {
                        ...next,
                        y: middle - 80,
                        height: 160,
                        fill: "#3b82f6",
                        stroke: null,
                      }
                    : next;
                },
                tag,
              )
            }
            onArrange={(mode) =>
              updateSlide((s) => ({
                ...s,
                elements: arrange(s.elements, selection, mode),
              }))
            }
            onDuplicate={duplicateSelection}
            onRemove={removeSelection}
          />
        </PaneSplit>
      </div>

      {presenting !== null ? (
        <PptxShow
          doc={doc}
          images={imagesRef.current}
          start={presenting}
          onClose={(index) => {
            setPresenting(null);
            const last = doc.slides[index];
            if (last) openSlide(last.id);
          }}
        />
      ) : null}
    </>
  );
}

/* ─────────────────────────────── Slide list ────────────────────────────── */

type PptxSlideRowProps = {
  slide: Slide;
  /** Zero-based position in the deck; shown as `index + 1`. */
  index: number;
  /** This is the slide open in the editor. */
  selected: boolean;
  /** False for the last remaining slide — a deck keeps at least one. */
  removable: boolean;
  images: ImageStore;
  /** Changes when a picture finishes decoding, to redraw the thumbnail. */
  imageTick: number;
  /**
   * Fires when the thumbnail is clicked.
   * @param id - the slide's id
   */
  onOpen: (id: string) => void;
  /**
   * Fires when the duplicate button is clicked.
   * @param id - the slide's id
   */
  onDuplicate: (id: string) => void;
  /**
   * Fires when the delete button is clicked.
   * @param id - the slide's id
   */
  onRemove: (id: string) => void;
};

/**
 * One slide in the list: its number and a live thumbnail. Click opens it,
 * drag reorders (dnd-kit sortable; Space + arrows from the keyboard). The
 * open slide shows duplicate and delete buttons over its corner.
 *
 * Test ids: `pptx-slide-row-<id>-item`, `-button`,
 * `-duplicate-button`, `-delete-button`.
 *
 * CSS: `pptx-pane__slide` (+ `--dragging`), `__slide-number` and
 * `__slide-button` (+ `--selected`), `__thumb`, `__slide-actions`.
 */
function PptxSlideRow({
  slide,
  index,
  selected,
  removable,
  images,
  imageTick,
  onOpen,
  onDuplicate,
  onRemove,
}: PptxSlideRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: slide.id });
  const thumb = React.useMemo(
    () => renderSlideCanvas(slide, images, 0.3).toDataURL("image/png"),
    // `imageTick` stands for "the pictures in `images` changed".
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slide, images, imageTick],
  );
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "pptx-pane__slide",
        isDragging && "pptx-pane__slide--dragging",
      )}
      data-testid={`pptx-slide-row-${slide.id}-item`}
    >
      <span
        className={cn(
          "pptx-pane__slide-number",
          selected && "pptx-pane__slide-number--selected",
        )}
        aria-hidden
      >
        {index + 1}
      </span>
      <button
        type="button"
        className={cn(
          "pptx-pane__slide-button",
          selected && "pptx-pane__slide-button--selected",
        )}
        {...attributes}
        {...listeners}
        aria-label={`Slide ${index + 1}`}
        aria-current={selected || undefined}
        data-testid={`pptx-slide-row-${slide.id}-button`}
        onClick={() => onOpen(slide.id)}
      >
        <img
          className="pptx-pane__thumb"
          src={thumb}
          alt=""
          draggable={false}
        />
      </button>
      {selected ? (
        <div className="pptx-pane__slide-actions">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Duplicate slide ${index + 1}`}
            title="Duplicate slide"
            data-testid={`pptx-slide-row-${slide.id}-duplicate-button`}
            onClick={() => onDuplicate(slide.id)}
          >
            <IconCopyPlus aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Delete slide ${index + 1}`}
            title={
              removable ? "Delete slide" : "A deck keeps at least one slide"
            }
            disabled={!removable}
            data-testid={`pptx-slide-row-${slide.id}-delete-button`}
            onClick={() => onRemove(slide.id)}
          >
            <IconTrash aria-hidden />
          </Button>
        </div>
      ) : null}
    </li>
  );
}

/* ───────────────────────────────── Stage ───────────────────────────────── */

type PptxStageProps = {
  slide: Slide;
  images: ImageStore;
  /** Changes when a picture finishes decoding, to redraw. */
  imageTick: number;
  /** Screen px per slide px. */
  scale: number;
  /** Ids of the selected elements. */
  selection: string[];
  /** Text box being typed into; its drawn text is hidden meanwhile. */
  editingId: string | null;
  /**
   * Fires on pointer-down: on an element (that element, or the selection
   * with it toggled when Shift / ⌘ / Ctrl is held), or on empty space (`[]`).
   * @param ids - the new selection
   */
  onSelect: (ids: string[]) => void;
  /**
   * Fires once when a drag, resize or rotation ends — never while it runs.
   * @param boxes - new position / size / rotation per element id
   */
  onBoxes: (boxes: Map<string, BoxPatch>) => void;
  /**
   * Fires when a text box is double-clicked.
   * @param id - the text element's id
   */
  onEdit: (id: string) => void;
};

/**
 * The slide as an interactive Konva stage. Elements are drawn by
 * `pptx-render` — the same code as thumbnails and exports — and
 * rebuilt whenever `slide` changes; a Konva `Transformer` supplies the
 * resize / rotate handles. One selected element resizes and rotates (pictures
 * keep their proportions, lines only stretch); several move together.
 *
 * The canvas is not focusable or readable by assistive tech; the parent's
 * workspace carries the keyboard handling and the label.
 *
 * Test ids: `pptx-stage`.
 *
 * CSS: `pptx-pane__stage`.
 */
function PptxStage({
  slide,
  images,
  imageTick,
  scale,
  selection,
  editingId,
  onSelect,
  onBoxes,
  onEdit,
}: PptxStageProps) {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const konvaRef = React.useRef<{
    stage: Konva.Stage;
    layer: Konva.Layer;
    transformer: Konva.Transformer;
    frameColor: string;
  } | null>(null);
  const nodesRef = React.useRef(new Map<string, Konva.Group>());
  const latest = React.useRef({ selection, scale, onSelect, onBoxes, onEdit });
  latest.current = { selection, scale, onSelect, onBoxes, onEdit };

  React.useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const theme = getComputedStyle(host);
    const accent = theme.getPropertyValue("--app-accent").trim() || "#2563eb";
    const stage = new Konva.Stage({ container: host, width: 1, height: 1 });
    const layer = new Konva.Layer({ x: STAGE_MARGIN, y: STAGE_MARGIN });
    const transformer = new Konva.Transformer({
      flipEnabled: false,
      ignoreStroke: true,
      rotationSnaps: ROTATION_SNAPS,
      rotationSnapTolerance: 4,
      rotateAnchorOffset: 22,
      anchorSize: 9,
      anchorCornerRadius: 2,
      anchorStroke: accent,
      anchorFill: "#ffffff",
      borderStroke: accent,
      boundBoxFunc: (oldBox, newBox) => {
        const min = MIN_ELEMENT_SIZE * latest.current.scale;
        return Math.abs(newBox.width) < min || Math.abs(newBox.height) < min
          ? oldBox
          : newBox;
      },
    });
    layer.add(transformer);
    stage.add(layer);
    stage.on("mousedown touchstart", (e) => {
      if (e.target === stage || e.target.name() === "background") {
        latest.current.onSelect([]);
      }
    });
    konvaRef.current = {
      stage,
      layer,
      transformer,
      frameColor:
        theme.getPropertyValue("--app-border-mid").trim() || "#cbd5e1",
    };
    const nodes = nodesRef.current;
    return () => {
      konvaRef.current = null;
      nodes.clear();
      stage.destroy();
    };
  }, []);

  React.useEffect(() => {
    const k = konvaRef.current;
    if (!k) return;
    k.stage.size({
      width: SLIDE_WIDTH * scale + 2 * STAGE_MARGIN,
      height: SLIDE_HEIGHT * scale + 2 * STAGE_MARGIN,
    });
    k.layer.scale({ x: scale, y: scale });
    k.layer.batchDraw();
  }, [scale]);

  // Rebuild the slide's nodes. Moves and resizes run on the nodes themselves
  // and only reach `slide` when they end, so this never fires mid-gesture.
  React.useEffect(() => {
    const k = konvaRef.current;
    if (!k) return;
    const { stage, layer, transformer } = k;
    const nodes = nodesRef.current;
    const options: DrawOptions = { placeholders: true, editingId };
    transformer.nodes([]);
    for (const child of layer.getChildren().slice()) {
      if (child !== transformer) child.destroy();
    }
    nodes.clear();

    /** Each element as last drawn — ahead of `slide` during a resize. */
    const live = new Map(slide.elements.map((el) => [el.id, el]));
    const [background, ...groups] = slideNodes(slide, images, options);
    layer.add(
      background,
      new Konva.Rect({
        name: "frame",
        width: SLIDE_WIDTH,
        height: SLIDE_HEIGHT,
        stroke: k.frameColor,
        strokeWidth: 1,
        strokeScaleEnabled: false,
        listening: false,
      }),
      ...groups,
    );
    transformer.moveToTop();

    for (const node of groups) {
      const group = node as Konva.Group;
      const elementId = group.id();
      nodes.set(elementId, group);
      group.draggable(true);

      group.on("mousedown touchstart", (e) => {
        const { selection: current, onSelect: select } = latest.current;
        const evt = e.evt as MouseEvent;
        if (evt.shiftKey || evt.metaKey || evt.ctrlKey) {
          select(
            current.includes(elementId)
              ? current.filter((other) => other !== elementId)
              : [...current, elementId],
          );
        } else if (!current.includes(elementId)) {
          select([elementId]);
        }
      });
      group.on("mouseenter", () => {
        stage.container().style.cursor = "move";
      });
      group.on("mouseleave", () => {
        stage.container().style.cursor = "";
      });
      group.on("dblclick dbltap", () => {
        if (live.get(elementId)?.type === "text") {
          latest.current.onEdit(elementId);
        }
      });

      // The transformer drags every node it holds along with this one, so
      // one report covers the whole selection. The other nodes report the
      // same boxes when their own drag ends; the parent drops no-op edits.
      group.on("dragend", () => {
        const boxes = new Map<string, BoxPatch>();
        for (const movedId of new Set([
          elementId,
          ...latest.current.selection,
        ])) {
          const moved = nodes.get(movedId);
          const el = live.get(movedId);
          if (!moved || !el) continue;
          // A node sits at its box centre (see `syncElementNode`).
          boxes.set(movedId, {
            x: Math.round(moved.x() - el.width / 2),
            y: Math.round(moved.y() - el.height / 2),
          });
        }
        latest.current.onBoxes(boxes);
      });

      // The handles scale the node; turn that into a new box each frame so
      // text re-wraps and outlines keep their width instead of stretching.
      group.on("transform", () => {
        const el = live.get(elementId);
        if (!el) return;
        const width = Math.max(
          MIN_ELEMENT_SIZE,
          el.width * Math.abs(group.scaleX()),
        );
        const height = isLineShape(el)
          ? el.height
          : Math.max(MIN_ELEMENT_SIZE, el.height * Math.abs(group.scaleY()));
        const next = {
          ...el,
          width,
          height,
          x: group.x() - width / 2,
          y: group.y() - height / 2,
          rotation: group.rotation(),
        };
        live.set(elementId, next);
        syncElementNode(group, next, images, options);
      });
      group.on("transformend", () => {
        const el = live.get(elementId);
        if (!el) return;
        latest.current.onBoxes(
          new Map([
            [
              elementId,
              {
                x: Math.round(el.x),
                y: Math.round(el.y),
                width: Math.round(el.width),
                height: Math.round(el.height),
                rotation: Math.round(el.rotation),
              },
            ],
          ]),
        );
      });
    }
    layer.batchDraw();
  }, [slide, images, imageTick, editingId]);

  // Handles follow the selection. Declared after the rebuild so it sees the
  // fresh nodes.
  React.useEffect(() => {
    const k = konvaRef.current;
    if (!k) return;
    const picked = selection
      .filter((elementId) => elementId !== editingId)
      .map((elementId) => nodesRef.current.get(elementId))
      .filter((node): node is Konva.Group => Boolean(node));
    const single =
      picked.length === 1
        ? slide.elements.find((el) => el.id === picked[0].id())
        : undefined;
    k.transformer.nodes(picked);
    k.transformer.resizeEnabled(Boolean(single));
    k.transformer.rotateEnabled(Boolean(single));
    k.transformer.keepRatio(single?.type === "image");
    k.transformer.enabledAnchors(
      single && isLineShape(single) ? LINE_ANCHORS : ALL_ANCHORS,
    );
    k.layer.batchDraw();
  }, [selection, slide, images, imageTick, editingId]);

  return (
    <div ref={hostRef} className="pptx-pane__stage" data-testid="pptx-stage" />
  );
}

/* ────────────────────────────── Text editing ───────────────────────────── */

type PptxTextEditorProps = {
  /** The text box being edited; supplies position, size and every style. */
  element: TextElement;
  /** Screen px per slide px. */
  scale: number;
  /**
   * Fires once, when the field loses focus or Escape is pressed.
   * @param text - what the field holds
   */
  onCommit: (text: string) => void;
};

/**
 * A text field laid exactly over a text box on the stage — same font, size,
 * colour, alignment and rotation — so typing happens in place. Grows with
 * its content; Escape or clicking away finishes.
 *
 * Accessibility: a native `<textarea>` labelled "Text box", focused on mount
 * with the caret at the end.
 *
 * Test ids: `pptx-text-editor-input`.
 *
 * CSS: `pptx-pane__editor` (+ `--middle`, `--bottom`),
 * `pptx-pane__editor-input`.
 */
function PptxTextEditor({ element, scale, onCommit }: PptxTextEditorProps) {
  const [text, setText] = React.useState(element.text);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const done = React.useRef(false);
  const commit = () => {
    if (done.current) return;
    done.current = true;
    onCommit(text);
  };

  React.useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);
  }, []);

  // As tall as its text, so the box's vertical alignment can place it.
  React.useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "0px";
    input.style.height = `${input.scrollHeight}px`;
  }, [text, scale, element.width, element.fontSize, element.fontFamily]);

  return (
    <div
      className={cn(
        "pptx-pane__editor",
        element.valign === "middle" && "pptx-pane__editor--middle",
        element.valign === "bottom" && "pptx-pane__editor--bottom",
      )}
      style={{
        left: STAGE_MARGIN + element.x * scale,
        top: STAGE_MARGIN + element.y * scale,
        width: element.width * scale,
        height: element.height * scale,
        padding: TEXT_PADDING * scale,
        transform: `rotate(${element.rotation}deg)`,
        opacity: element.opacity,
      }}
    >
      <textarea
        ref={inputRef}
        className="pptx-pane__editor-input"
        aria-label="Text box"
        data-testid="pptx-text-editor-input"
        rows={1}
        spellCheck={false}
        value={text}
        style={{
          fontFamily: `"${element.fontFamily}"`,
          fontSize: element.fontSize * scale,
          fontWeight: element.bold ? 700 : 400,
          fontStyle: element.italic ? "italic" : "normal",
          textDecoration: element.underline ? "underline" : "none",
          lineHeight: TEXT_LINE_HEIGHT,
          color: element.color,
          textAlign: element.align,
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            commit();
          }
        }}
      />
    </div>
  );
}

/* ─────────────────────────────── Inspector ─────────────────────────────── */

type PptxInspectorProps = {
  /** The open slide; edited when nothing is selected. */
  slide: Slide;
  /** Selected elements of `slide`, bottom to top. */
  selected: SlideElement[];
  /**
   * Fires when the slide's background or notes change.
   * @param patch - the changed fields
   * @param tag - edits sharing a tag in quick succession undo as one
   */
  onSlide: (
    patch: Partial<Pick<Slide, "background" | "notes">>,
    tag?: string,
  ) => void;
  /** Fires when "Use on every slide" is clicked. */
  onBackgroundAll: () => void;
  /**
   * Fires when a field every element has (box, opacity) changes.
   * @param patch - the changed fields, applied to the whole selection
   * @param tag - undo-coalescing tag
   */
  onElements: (
    patch: BoxPatch & Partial<Pick<SlideElement, "opacity">>,
    tag?: string,
  ) => void;
  /**
   * Fires when a text setting changes.
   * @param patch - the changed fields, applied to every selected text box
   * @param tag - undo-coalescing tag
   */
  onText: (patch: Partial<TextElement>, tag?: string) => void;
  /**
   * Fires when a shape setting changes.
   * @param patch - the changed fields, applied to every selected shape
   * @param tag - undo-coalescing tag
   */
  onShape: (patch: Partial<ShapeElement>, tag?: string) => void;
  /**
   * Fires when a stacking-order button is clicked.
   * @param mode - where the selection moves in the stack
   */
  onArrange: (mode: ArrangeMode) => void;
  /** Fires when Duplicate is clicked. */
  onDuplicate: () => void;
  /** Fires when Delete is clicked. */
  onRemove: () => void;
};

/**
 * The settings column. With a selection it shows what that selection has —
 * text (font, size, style, alignment, colours), shape (fill, outline),
 * then opacity, stacking order and, for a single element, its exact
 * position, size and rotation. With nothing selected it edits the slide:
 * background colour and speaker notes.
 *
 * Test ids, all prefixed `pptx-inspector-`: `background-*` (colour
 * field), `background-all-button`, `notes-input`, `font-select`,
 * `font-size-input`, `style-<bold|italic|underline>-button`,
 * `align-<left|center|right>-button`, `valign-<top|middle|bottom>-button`,
 * `text-color-*`, `text-fill-*`, `shape-select`, `fill-*`, `stroke-*`,
 * `stroke-width-input`, `opacity-input`, `arrange-<mode>-button`,
 * `x-input`, `y-input`, `width-input`, `height-input`, `rotation-input`,
 * `duplicate-button`, `delete-button`. A colour field `<name>-*` has
 * `-picker-input`, `-hex-input`, `-none-checkbox` (optional) and
 * `-swatch-<rrggbb>-button`.
 *
 * CSS: `pptx-pane__side`, `__section`, `__heading`, `__pair`,
 * `__actions`, `__swatches`, `__swatch`; shared block `pane-field`.
 */
function PptxInspector({
  slide,
  selected,
  onSlide,
  onBackgroundAll,
  onElements,
  onText,
  onShape,
  onArrange,
  onDuplicate,
  onRemove,
}: PptxInspectorProps) {
  if (!selected.length) {
    return (
      <aside className="pptx-pane__side" aria-label="Slide settings">
        <Section title="Slide">
          <ColorField
            label="Background"
            testId="pptx-inspector-background"
            value={slide.background}
            onChange={(background) =>
              background && onSlide({ background }, "background")
            }
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="pptx-inspector-background-all-button"
            onClick={onBackgroundAll}
          >
            Use on every slide
          </Button>
        </Section>
        <Section title="Speaker notes">
          <textarea
            className="pane-field__textarea"
            aria-label="Speaker notes"
            data-testid="pptx-inspector-notes-input"
            rows={6}
            placeholder="Notes for this slide — kept in the .pptx export"
            value={slide.notes}
            onChange={(e) => onSlide({ notes: e.target.value }, "notes")}
          />
        </Section>
        <Section title="Tips">
          <p className="pane-field__hint">
            Double-click a text box to type. Shift-click selects several
            elements. Paste or drop pictures onto the slide.
          </p>
        </Section>
      </aside>
    );
  }

  const text = selected.find((el): el is TextElement => el.type === "text");
  const shape = selected.find((el): el is ShapeElement => el.type === "shape");
  const single = selected.length === 1 ? selected[0] : null;
  const first = selected[0];

  return (
    <aside className="pptx-pane__side" aria-label="Selection settings">
      {text ? (
        <Section title="Text">
          <div className="pptx-pane__pair">
            <SelectField
              label="Font"
              testId="pptx-inspector-font-select"
              value={text.fontFamily}
              options={[
                ...FONT_FAMILIES,
                // A font from a hand-edited file stays selectable.
                ...(FONT_FAMILIES.includes(
                  text.fontFamily as (typeof FONT_FAMILIES)[number],
                )
                  ? []
                  : [text.fontFamily]),
              ].map((font) => ({ value: font, label: font }))}
              onChange={(fontFamily) => onText({ fontFamily })}
            />
            <NumberField
              label="Size (px)"
              testId="pptx-inspector-font-size-input"
              min={MIN_FONT_SIZE}
              max={MAX_FONT_SIZE}
              value={text.fontSize}
              onChange={(fontSize) => onText({ fontSize }, "font-size")}
            />
          </div>
          <div className="pane-field__row">
            <ToggleGroup
              type="multiple"
              variant="outline"
              size="sm"
              aria-label="Text style"
              value={[
                text.bold ? "bold" : "",
                text.italic ? "italic" : "",
                text.underline ? "underline" : "",
              ].filter(Boolean)}
              onValueChange={(styles) =>
                onText({
                  bold: styles.includes("bold"),
                  italic: styles.includes("italic"),
                  underline: styles.includes("underline"),
                })
              }
            >
              <ToggleGroupItem
                value="bold"
                aria-label="Bold"
                data-testid="pptx-inspector-style-bold-button"
              >
                <IconBold aria-hidden className="pane-icon" />
              </ToggleGroupItem>
              <ToggleGroupItem
                value="italic"
                aria-label="Italic"
                data-testid="pptx-inspector-style-italic-button"
              >
                <IconItalic aria-hidden className="pane-icon" />
              </ToggleGroupItem>
              <ToggleGroupItem
                value="underline"
                aria-label="Underline"
                data-testid="pptx-inspector-style-underline-button"
              >
                <IconUnderline aria-hidden className="pane-icon" />
              </ToggleGroupItem>
            </ToggleGroup>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              aria-label="Horizontal alignment"
              value={text.align}
              onValueChange={(align) => {
                if (align) onText({ align: align as TextAlign });
              }}
            >
              <ToggleGroupItem
                value="left"
                aria-label="Align left"
                data-testid="pptx-inspector-align-left-button"
              >
                <IconAlignLeft aria-hidden className="pane-icon" />
              </ToggleGroupItem>
              <ToggleGroupItem
                value="center"
                aria-label="Align centre"
                data-testid="pptx-inspector-align-center-button"
              >
                <IconAlignCenter aria-hidden className="pane-icon" />
              </ToggleGroupItem>
              <ToggleGroupItem
                value="right"
                aria-label="Align right"
                data-testid="pptx-inspector-align-right-button"
              >
                <IconAlignRight aria-hidden className="pane-icon" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            aria-label="Vertical alignment"
            value={text.valign}
            onValueChange={(valign) => {
              if (valign) onText({ valign: valign as TextValign });
            }}
          >
            <ToggleGroupItem
              value="top"
              aria-label="Align top"
              data-testid="pptx-inspector-valign-top-button"
            >
              <IconAlignBoxCenterTop aria-hidden className="pane-icon" />
            </ToggleGroupItem>
            <ToggleGroupItem
              value="middle"
              aria-label="Align middle"
              data-testid="pptx-inspector-valign-middle-button"
            >
              <IconAlignBoxCenterMiddle aria-hidden className="pane-icon" />
            </ToggleGroupItem>
            <ToggleGroupItem
              value="bottom"
              aria-label="Align bottom"
              data-testid="pptx-inspector-valign-bottom-button"
            >
              <IconAlignBoxCenterBottom aria-hidden className="pane-icon" />
            </ToggleGroupItem>
          </ToggleGroup>
          <ColorField
            label="Text colour"
            testId="pptx-inspector-text-color"
            value={text.color}
            onChange={(color) => color && onText({ color }, "text-color")}
          />
          <ColorField
            label="Box fill"
            testId="pptx-inspector-text-fill"
            value={text.fill}
            allowNone
            onChange={(fill) => onText({ fill }, "text-fill")}
          />
        </Section>
      ) : null}

      {shape ? (
        <Section title="Shape">
          <SelectField
            label="Shape"
            testId="pptx-inspector-shape-select"
            value={shape.shape}
            options={SHAPE_KINDS}
            onChange={(next) => onShape({ shape: next })}
          />
          {isLineShape(shape) ? null : (
            <ColorField
              label="Fill"
              testId="pptx-inspector-fill"
              value={shape.fill}
              allowNone
              onChange={(fill) => onShape({ fill }, "fill")}
            />
          )}
          <ColorField
            label={isLineShape(shape) ? "Colour" : "Outline"}
            testId="pptx-inspector-stroke"
            value={shape.stroke}
            allowNone={!isLineShape(shape)}
            onChange={(stroke) =>
              onShape(
                // Picking an outline colour on a shape drawn without one
                // should show it.
                { stroke, strokeWidth: Math.max(1, shape.strokeWidth) },
                "stroke",
              )
            }
          />
          <Slider
            size="sm"
            label={isLineShape(shape) ? "Thickness" : "Outline width"}
            data-testid="pptx-inspector-stroke-width-input"
            min={isLineShape(shape) ? 1 : 0}
            max={MAX_STROKE_WIDTH}
            step={1}
            value={shape.strokeWidth}
            formatValue={(v) => `${v}px`}
            onValueChange={(strokeWidth) =>
              onShape({ strokeWidth }, "stroke-width")
            }
          />
        </Section>
      ) : null}

      <Section title="Arrange">
        <Slider
          size="sm"
          label="Opacity"
          data-testid="pptx-inspector-opacity-input"
          min={0}
          max={1}
          step={0.05}
          value={first.opacity}
          formatValue={(v) => `${Math.round(v * 100)}%`}
          onValueChange={(opacity) => onElements({ opacity }, "opacity")}
        />
        <div className="pptx-pane__actions">
          {(
            [
              ["front", "Bring to front", IconStackFront],
              ["forward", "Bring forward", IconStackPop],
              ["backward", "Send backward", IconStackPush],
              ["back", "Send to back", IconStackBack],
            ] as const
          ).map(([mode, label, ArrangeIcon]) => (
            <Button
              key={mode}
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={label}
              title={label}
              data-testid={`pptx-inspector-arrange-${mode}-button`}
              onClick={() => onArrange(mode)}
            >
              <ArrangeIcon aria-hidden className="pane-icon" />
            </Button>
          ))}
        </div>
        {single ? (
          <>
            <div className="pptx-pane__pair">
              <NumberField
                label="X"
                testId="pptx-inspector-x-input"
                min={-4 * SLIDE_WIDTH}
                max={4 * SLIDE_WIDTH}
                value={single.x}
                onChange={(x) => onElements({ x }, "x")}
              />
              <NumberField
                label="Y"
                testId="pptx-inspector-y-input"
                min={-4 * SLIDE_HEIGHT}
                max={4 * SLIDE_HEIGHT}
                value={single.y}
                onChange={(y) => onElements({ y }, "y")}
              />
            </div>
            <div className="pptx-pane__pair">
              <NumberField
                label="Width"
                testId="pptx-inspector-width-input"
                min={MIN_ELEMENT_SIZE}
                max={4 * SLIDE_WIDTH}
                value={single.width}
                onChange={(width) => onElements({ width }, "width")}
              />
              {isLineShape(single) ? null : (
                <NumberField
                  label="Height"
                  testId="pptx-inspector-height-input"
                  min={MIN_ELEMENT_SIZE}
                  max={4 * SLIDE_HEIGHT}
                  value={single.height}
                  onChange={(height) => onElements({ height }, "height")}
                />
              )}
            </div>
            <NumberField
              label="Rotation (°)"
              testId="pptx-inspector-rotation-input"
              min={-360}
              max={360}
              value={single.rotation}
              onChange={(rotation) => onElements({ rotation }, "rotation")}
            />
          </>
        ) : (
          <p className="pane-field__hint">
            {selected.length} elements selected — drag to move them together.
          </p>
        )}
        <div className="pptx-pane__actions">
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="pptx-inspector-duplicate-button"
            onClick={onDuplicate}
          >
            <IconCopyPlus aria-hidden className="pane-icon" />
            Duplicate
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            data-testid="pptx-inspector-delete-button"
            onClick={onRemove}
          >
            <IconTrash aria-hidden className="pane-icon" />
            Delete
          </Button>
        </div>
      </Section>
    </aside>
  );
}

/** A titled group of fields in the settings column. */
function Section({
  title,
  children,
}: {
  /** Heading above the fields. */
  title: string;
  /** The fields. */
  children: React.ReactNode;
}) {
  return (
    <section className="pptx-pane__section">
      <h3 className="pptx-pane__heading">{title}</h3>
      {children}
    </section>
  );
}

/** A labelled compacto `Select` over a fixed list of options. */
function SelectField<T extends string>({
  label,
  testId,
  value,
  options,
  onChange,
}: {
  /** Field label; also the trigger's accessible name. */
  label: string;
  /** `data-testid` of the trigger. */
  testId: string;
  /** Selected option value. */
  value: T;
  /** Options, in menu order. */
  options: readonly { value: T; label: string }[];
  /**
   * Fires when another option is picked.
   * @param value - the picked option's value
   */
  onChange: (value: T) => void;
}) {
  return (
    <div className="pane-field">
      <span className="pane-field__label">{label}</span>
      <Select value={value} onValueChange={(next) => onChange(next as T)}>
        <SelectTrigger
          size="sm"
          className="pane-field__select"
          aria-label={label}
          data-testid={testId}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * A labelled whole-number field. Keeps what is being typed until it parses,
 * and reports values clamped to `min`–`max`; it does not rewrite the text
 * under the caret while focused.
 */
function NumberField({
  label,
  testId,
  value,
  min,
  max,
  onChange,
}: {
  /** Field label. */
  label: string;
  /** `data-testid` of the input. */
  testId: string;
  /** Current value; shown rounded. */
  value: number;
  /** Smallest value reported. */
  min: number;
  /** Largest value reported. */
  max: number;
  /**
   * Fires on each keystroke that leaves a valid number.
   * @param value - the number, rounded and clamped
   */
  onChange: (value: number) => void;
}) {
  const shown = String(Math.round(value));
  const [draft, setDraft] = React.useState(shown);
  const focused = React.useRef(false);
  React.useEffect(() => {
    if (!focused.current) setDraft(shown);
  }, [shown]);
  return (
    <label className="pane-field">
      <span className="pane-field__label">{label}</span>
      <Input
        type="number"
        inputMode="numeric"
        data-testid={testId}
        min={min}
        max={max}
        step={1}
        value={draft}
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={() => {
          focused.current = false;
          setDraft(shown);
        }}
        onChange={(e) => {
          setDraft(e.target.value);
          const next = Number(e.target.value);
          if (e.target.value.trim() === "" || !Number.isFinite(next)) return;
          onChange(Math.min(max, Math.max(min, Math.round(next))));
        }}
      />
    </label>
  );
}

/**
 * A colour: native picker, hex field and quick-pick swatches. With
 * `allowNone` a "None" checkbox turns the colour off (`null`).
 */
function ColorField({
  label,
  testId,
  value,
  allowNone,
  onChange,
}: {
  /** Field label. */
  label: string;
  /** Base `data-testid`; parts derive `-picker-input`, `-hex-input`, …. */
  testId: string;
  /** `#rrggbb`, or `null` for none. */
  value: string | null;
  /**
   * Offer the "None" checkbox.
   * @defaultValue `false`
   */
  allowNone?: boolean;
  /**
   * Fires when a valid colour is picked or typed, or None is toggled.
   * @param value - `#rrggbb`, or `null` when None is ticked
   */
  onChange: (value: string | null) => void;
}) {
  const [draft, setDraft] = React.useState(value ?? "");
  // Colour to return to when None is unticked.
  const lastColor = React.useRef(value ?? "#3b82f6");
  if (value) lastColor.current = value;
  React.useEffect(() => setDraft(value ?? ""), [value]);
  const none = value === null;
  const valid = none || isHexColor(draft);
  return (
    <div className="pane-field">
      <span className="pane-field__label">{label}</span>
      <div className="pane-field__row">
        <input
          type="color"
          className="pane-field__color"
          aria-label={`${label} picker`}
          data-testid={`${testId}-picker-input`}
          value={value ?? lastColor.current}
          disabled={none}
          onChange={(e) => onChange(e.target.value)}
        />
        <Input
          className={cn(
            "pane-field__hex",
            !valid && "pane-field__hex--invalid",
          )}
          aria-invalid={!valid || undefined}
          aria-label={`${label} hex`}
          data-testid={`${testId}-hex-input`}
          value={draft}
          placeholder={none ? "None" : "#rrggbb"}
          disabled={none}
          spellCheck={false}
          maxLength={7}
          onChange={(e) => {
            setDraft(e.target.value);
            if (isHexColor(e.target.value)) onChange(e.target.value);
          }}
        />
        {allowNone ? (
          <label className="pane-field__check">
            <input
              type="checkbox"
              className="pane-field__checkbox"
              data-testid={`${testId}-none-checkbox`}
              checked={none}
              onChange={(e) =>
                onChange(e.target.checked ? null : lastColor.current)
              }
            />
            None
          </label>
        ) : null}
      </div>
      <div className="pptx-pane__swatches">
        {SWATCHES.map((swatch) => (
          <button
            key={swatch}
            type="button"
            className={cn(
              "pptx-pane__swatch",
              value?.toLowerCase() === swatch && "pptx-pane__swatch--selected",
            )}
            style={{ backgroundColor: swatch }}
            aria-label={`${label} ${swatch}`}
            title={swatch}
            data-testid={`${testId}-swatch-${swatch.slice(1)}-button`}
            onClick={() => onChange(swatch)}
          />
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────── Slide show ────────────────────────────── */

type PptxShowProps = {
  doc: PptxDoc;
  images: ImageStore;
  /** Index of the slide to open on. */
  start: number;
  /**
   * Fires when the show ends — Escape, the close button, leaving full
   * screen, or advancing past the last slide.
   * @param index - the slide that was showing
   */
  onClose: (index: number) => void;
};

/**
 * The deck full-screen, one slide at a time, portalled to `document.body`.
 * Click, →, ↓, Space, Enter or PageDown advance; ←, ↑, Backspace or PageUp
 * go back; Home / End jump; Escape ends the show. Asks the browser for full
 * screen and still works as a full-window overlay when that is refused.
 *
 * Accessibility: `role="dialog"`, `aria-modal`, focused on mount; each slide
 * is an image whose alt text is the slide's text.
 *
 * Test ids: `pptx-show`, `pptx-show-slide-content`,
 * `pptx-show-count-message`, `pptx-show-close-button`.
 *
 * CSS: block `pptx-show` (`__slide`, `__count`, `__close`).
 */
function PptxShow({ doc, images, start, onClose }: PptxShowProps) {
  const [index, setIndex] = React.useState(start);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const cache = React.useRef(new Map<string, string>());
  const state = React.useRef({ index, onClose, count: doc.slides.length });
  state.current = { index, onClose, count: doc.slides.length };

  const slide = doc.slides[Math.min(index, doc.slides.length - 1)];
  const src = React.useMemo(() => {
    const hit = cache.current.get(slide.id);
    if (hit) return hit;
    // Sharp on the screen it is shown on, without drawing absurd sizes.
    const ratio = Math.min(
      4,
      Math.max(
        1,
        (window.screen.width * window.devicePixelRatio) / SLIDE_WIDTH,
      ),
    );
    const url = renderSlideCanvas(slide, images, ratio).toDataURL("image/png");
    cache.current.set(slide.id, url);
    return url;
  }, [slide, images]);

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.focus();
    let entered = false;
    const close = () => state.current.onClose(state.current.index);
    const step = (by: number) => {
      const next = state.current.index + by;
      if (next >= state.current.count) close();
      else setIndex(Math.max(0, next));
    };
    const onKey = (e: KeyboardEvent) => {
      // ⌘/Ctrl+S and friends keep working underneath.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const forward = ["ArrowRight", "ArrowDown", " ", "Enter", "PageDown"];
      const back = ["ArrowLeft", "ArrowUp", "Backspace", "PageUp"];
      if (e.key === "Escape") close();
      else if (forward.includes(e.key)) step(1);
      else if (back.includes(e.key)) step(-1);
      else if (e.key === "Home") setIndex(0);
      else if (e.key === "End") setIndex(state.current.count - 1);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    const onFullscreen = () => {
      if (document.fullscreenElement === root) entered = true;
      else if (entered) close();
    };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("fullscreenchange", onFullscreen);
    void root.requestFullscreen?.().catch(() => undefined);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("fullscreenchange", onFullscreen);
      if (document.fullscreenElement === root) {
        void document.exitFullscreen().catch(() => undefined);
      }
    };
  }, []);

  return createPortal(
    <div
      ref={rootRef}
      className="pptx-show"
      role="dialog"
      aria-modal="true"
      aria-label="Slide show"
      tabIndex={-1}
      data-testid="pptx-show"
      onClick={() => {
        if (index + 1 >= doc.slides.length) onClose(index);
        else setIndex(index + 1);
      }}
    >
      <img
        className="pptx-show__slide"
        src={src}
        alt={
          slide.elements
            .filter((el): el is TextElement => el.type === "text")
            .map((el) => el.text)
            .join(" — ") || `Slide ${index + 1}`
        }
        draggable={false}
        data-testid="pptx-show-slide-content"
      />
      <p className="pptx-show__count" data-testid="pptx-show-count-message">
        {index + 1} / {doc.slides.length}
      </p>
      <button
        type="button"
        className="pptx-show__close"
        aria-label="End slide show"
        title="End slide show (Esc)"
        data-testid="pptx-show-close-button"
        onClick={(e) => {
          e.stopPropagation();
          onClose(index);
        }}
      >
        <IconX aria-hidden className="pane-icon" />
      </button>
    </div>,
    document.body,
  );
}
