import {
  closeImageDialog$,
  imageDialogState$,
  imageUploadState$,
  saveImage$,
  useCellValues,
  usePublisher,
} from "@mdxeditor/editor";
import {
  IconDeviceFloppy,
  IconLink,
  IconLoader2,
  IconPhoto,
  IconPhotoOff,
  IconPhotoPlus,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import * as React from "react";
import { useDropzone } from "react-dropzone";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/cn";
import * as ui from "@/lib/ui-styles";

type Source = "upload" | "link";

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Replacement for MDXEditor's built-in image dialog, in the compacto look:
 * Upload / Link tabs, a drop zone with a live preview, a URL field that
 * previews (and flags) what it points at, plus alt text and title. Wired to
 * MDXEditor through `saveImage$` / `closeImageDialog$`, so uploads still go
 * through the editor's `imageUploadHandler` (images are inlined as data URLs).
 */
export function ImageDialog() {
  const [state, uploadState] = useCellValues(
    imageDialogState$,
    imageUploadState$,
  );
  const saveImage = usePublisher(saveImage$);
  const closeImageDialog = usePublisher(closeImageDialog$);

  const editing = state.type === "editing";
  const initial = editing ? state.initialValues : undefined;

  const [source, setSource] = React.useState<Source>("upload");
  const [file, setFile] = React.useState<File | null>(null);
  // An image already inlined in the note (data: URL) — kept unless replaced.
  const [embeddedSrc, setEmbeddedSrc] = React.useState<string | null>(null);
  const [url, setUrl] = React.useState("");
  const [altText, setAltText] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [rejected, setRejected] = React.useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = React.useState(false);

  // Reset the form each time the dialog opens (new image or edit).
  React.useEffect(() => {
    if (state.type === "inactive") return;
    const src = initial?.src ?? "";
    const embedded = src.startsWith("data:");
    setFile(null);
    setRejected(null);
    setPreviewFailed(false);
    setEmbeddedSrc(embedded ? src : null);
    setUrl(embedded ? "" : src);
    setAltText(initial?.altText ?? "");
    setTitle(initial?.title ?? "");
    setSource(src && !embedded ? "link" : "upload");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const filePreview = React.useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );
  React.useEffect(
    () => () => {
      if (filePreview) URL.revokeObjectURL(filePreview);
    },
    [filePreview],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "image/*": [] },
    maxSize: MAX_BYTES,
    multiple: false,
    onDropAccepted: ([accepted]) => {
      setFile(accepted);
      setRejected(null);
      if (!altText) setAltText(accepted.name.replace(/\.[^.]+$/, ""));
    },
    onDropRejected: ([rejection]) =>
      setRejected(
        rejection?.errors[0]?.code === "file-too-large"
          ? "That image is larger than 10 MB."
          : "Only image files can be inserted.",
      ),
  });

  const uploading = uploadState === "uploading";
  const trimmedUrl = url.trim();
  const canSave =
    !uploading &&
    (source === "upload"
      ? Boolean(file || embeddedSrc)
      : Boolean(trimmedUrl) && !previewFailed);

  const submit = () => {
    if (!canSave) return;
    const base = {
      altText: altText.trim() || undefined,
      title: title.trim() || undefined,
      width: initial?.width,
      height: initial?.height,
    };
    if (source === "upload" && file) {
      const list = new DataTransfer();
      list.items.add(file);
      saveImage({ ...base, file: list.files });
    } else if (source === "upload" && embeddedSrc) {
      saveImage({ ...base, src: embeddedSrc });
    } else {
      saveImage({ ...base, src: trimmedUrl });
    }
  };

  if (state.type === "inactive") return null;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) closeImageDialog();
      }}
    >
      <DialogContent
        data-testid="image-dialog"
        className="w-[min(480px,92vw)]"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{editing ? "Edit image" : "Insert image"}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            submit();
          }}
        >
          <DialogBody className="flex flex-col gap-4">
            <DialogDescription className="sr-only">
              Upload an image from your device or link one from the web.
            </DialogDescription>

            <Tabs
              value={source}
              onValueChange={(v) => {
                setSource(v as Source);
                setPreviewFailed(false);
              }}
            >
              <TabsList className="w-full">
                <TabsTrigger value="upload" className="flex-1">
                  <IconUpload className="size-3.5" />
                  Upload
                </TabsTrigger>
                <TabsTrigger value="link" className="flex-1">
                  <IconLink className="size-3.5" />
                  Link
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {source === "upload" ? (
              file && filePreview ? (
                <PreviewFrame
                  src={filePreview}
                  caption={file.name}
                  onRemove={() => setFile(null)}
                />
              ) : embeddedSrc ? (
                <PreviewFrame
                  src={embeddedSrc}
                  caption="Embedded in this note · remove to replace"
                  onRemove={() => setEmbeddedSrc(null)}
                />
              ) : (
                <div
                  {...getRootProps()}
                  data-drag-active={isDragActive || undefined}
                  className={cn(
                    "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-app-border-mid bg-app-bg px-4 py-8 text-center transition-colors",
                    "hover:border-app-border-accent hover:bg-app-hover",
                    "data-drag-active:border-app-accent data-drag-active:bg-app-accent-faint",
                  )}
                >
                  <input {...getInputProps()} />
                  <span className="flex size-10 items-center justify-center rounded-lg border tint-current text-app-accent">
                    <IconPhoto className="size-5" />
                  </span>
                  <span className="font-title text-[12px] font-semibold text-app-bright">
                    {isDragActive ? "Drop the image" : "Click or drop an image"}
                  </span>
                  <span className={ui.help}>PNG, JPG, GIF, WebP or SVG · up to 10 MB</span>
                </div>
              )
            ) : (
              <div className="flex flex-col gap-2">
                <label className={ui.fieldLabel} htmlFor="image-dialog-url">
                  Image URL
                </label>
                <Input
                  id="image-dialog-url"
                  icon={IconLink}
                  autoFocus
                  placeholder="https://example.com/picture.png"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    setPreviewFailed(false);
                  }}
                  onClear={() => setUrl("")}
                  aria-invalid={previewFailed || undefined}
                />
                {trimmedUrl ? (
                  previewFailed ? (
                    <div className="flex items-center gap-2 rounded-md border border-app-error/40 bg-app-error/5 px-3 py-2 font-description text-[11px] text-app-error">
                      <IconPhotoOff className="size-4 shrink-0" />
                      Couldn’t load an image from that address.
                    </div>
                  ) : (
                    <PreviewFrame
                      src={trimmedUrl}
                      onError={() => setPreviewFailed(true)}
                    />
                  )
                ) : null}
              </div>
            )}

            {rejected && source === "upload" ? (
              <p role="alert" className="font-description text-[11px] text-app-error">
                {rejected}
              </p>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className={ui.fieldLabel} htmlFor="image-dialog-alt">
                  Alt text
                </label>
                <Input
                  id="image-dialog-alt"
                  placeholder="What the image shows"
                  value={altText}
                  onChange={(e) => setAltText(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={ui.fieldLabel} htmlFor="image-dialog-title">
                  Title <span className="font-normal">(optional)</span>
                </label>
                <Input
                  id="image-dialog-title"
                  placeholder="Shown on hover"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
            </div>
            <p className={cn(ui.help, "-mt-2")}>
              Alt text is read aloud by screen readers and shown if the image
              can’t load.
            </p>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                <IconX />
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!canSave} data-testid="image-dialog-save">
              {uploading ? (
                <IconLoader2 className="animate-spin" />
              ) : editing ? (
                <IconDeviceFloppy />
              ) : (
                <IconPhotoPlus />
              )}
              {uploading ? "Inserting…" : editing ? "Save" : "Insert"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PreviewFrame({
  src,
  caption,
  onRemove,
  onError,
}: {
  src: string;
  caption?: string;
  onRemove?: () => void;
  onError?: () => void;
}) {
  return (
    <figure className="relative m-0 overflow-hidden rounded-lg border border-app-border bg-app-sidebar">
      <img
        src={src}
        alt=""
        onError={onError}
        className="mx-auto block max-h-56 w-auto max-w-full object-contain"
      />
      {caption ? (
        <figcaption className="truncate border-t border-app-border bg-app-panel px-3 py-1.5 font-mono text-[11px] text-app-dim">
          {caption}
        </figcaption>
      ) : null}
      {onRemove ? (
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="Remove image"
          title="Remove image"
          onClick={onRemove}
          className="absolute top-2 right-2 size-7 bg-app-panel text-app-dim hover:text-app-error"
        >
          <IconX className="size-4" />
        </Button>
      ) : null}
    </figure>
  );
}
