import "@/styles/qr-pane.css";
import {
  IconAlertTriangle,
  IconCheck,
  IconCopy,
  IconDownload,
  IconPhotoPlus,
  IconRefresh,
  IconTrash,
} from "@tabler/icons-react";
import * as React from "react";
import type QRCodeStyling from "qr-code-styling";
import type { FileExtension } from "qr-code-styling";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import * as ui from "@/lib/ui-styles";
import {
  CONTENT_KINDS,
  CORNER_DOT_TYPES,
  CORNER_SQUARE_TYPES,
  DOT_TYPES,
  defaultQrDoc,
  ERROR_LEVELS,
  MAX_SIZE,
  MIN_SIZE,
  parseQr,
  type QrContent,
  qrData,
  type QrDoc,
  qrOptions,
  serializeQr,
} from "@/lib/qr-doc";
import { saveContent } from "@/store/actions";
import { useAppDispatch } from "@/store";
import { FileBarSlot } from "@/features/editors/file-bar-slot";
import {
  type PaneProps,
  useSaveHandler,
} from "@/features/editors/pane-context";
import { useDebouncedSave } from "@/features/editors/use-file-content";

const FORMATS: { value: FileExtension; label: string }[] = [
  { value: "png", label: "PNG" },
  { value: "svg", label: "SVG" },
  { value: "jpeg", label: "JPEG" },
  { value: "webp", label: "WebP" },
];

/** Largest logo stored in the file, as a data: URL. */
const MAX_LOGO_BYTES = 1024 * 1024;

/**
 * `.qr` files: a QR code designer. The right column edits what the code
 * encodes (text, Wi-Fi, email, phone, SMS) and how it looks — dot and corner
 * shapes, colours, gradient, centre logo; the file bar downloads it as PNG,
 * SVG, JPEG or WebP, or copies it as an image. Edits save automatically.
 */
export default function QrPane({ id, name, content, registerSave }: PaneProps) {
  const dispatch = useAppDispatch();
  const initial = React.useMemo(() => {
    try {
      return {
        doc: parseQr(typeof content === "string" ? content : ""),
        error: null as string | null,
      };
    } catch (error) {
      return { doc: defaultQrDoc(), error: (error as Error).message };
    }
    // Mounted per file — `content` only seeds state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [doc, setDoc] = React.useState(initial.doc);
  const [parseError, setParseError] = React.useState(initial.error);
  const [format, setFormat] = React.useState<FileExtension>("png");
  const [copied, setCopied] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const qrRef = React.useRef<QRCodeStyling | null>(null);

  const save = useDebouncedSave(
    (value) => void dispatch(saveContent(id, value)),
  );
  const docRef = React.useRef(doc);
  docRef.current = doc;
  useSaveHandler(registerSave, () => {
    if (!parseError) dispatch(saveContent(id, serializeQr(docRef.current)));
  });

  const update = (fn: (d: QrDoc) => QrDoc) => {
    const next = fn(docRef.current);
    docRef.current = next;
    setDoc(next);
    setParseError(null);
    save(serializeQr(next));
  };
  const setContent = (patch: Partial<QrContent>) =>
    update((d) => ({ ...d, content: { ...d.content, ...patch } }));

  // Rebuilt on each change: `update()` merges options, so cleared values
  // (gradient, logo) would otherwise linger.
  React.useEffect(() => {
    let live = true;
    void import("qr-code-styling").then(({ default: QR }) => {
      const stage = stageRef.current;
      if (!live || !stage) return;
      const qr = new QR(qrOptions(doc));
      stage.replaceChildren();
      qr.append(stage);
      qrRef.current = qr;
    });
    return () => {
      live = false;
    };
  }, [doc]);

  const baseName = name.replace(/\.[^.]+$/, "") || "qr-code";

  const download = async () => {
    setActionError(null);
    try {
      await qrRef.current?.download({ name: baseName, extension: format });
    } catch (error) {
      setActionError(`Download failed: ${String(error)}`);
    }
  };

  const copy = async () => {
    setActionError(null);
    try {
      const blob = await qrRef.current?.getRawData("png");
      if (!(blob instanceof Blob)) throw new Error("nothing rendered");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch (error) {
      setActionError(`Copy failed: ${(error as Error).message ?? error}`);
    }
  };

  const data = qrData(doc.content);

  return (
    <>
      <FileBarSlot>
        <Select
          value={format}
          onValueChange={(value) => setFormat(value as FileExtension)}
        >
          <SelectTrigger
            size="sm"
            className="qr-pane__format"
            aria-label="Download format"
            data-testid="qr-pane-format-select"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FORMATS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={ui.paneToolbarBtn}
          data-testid="qr-pane-copy-button"
          onClick={() => void copy()}
          title="Copy the QR code as a PNG image"
        >
          {copied ? (
            <IconCheck aria-hidden className="pane-icon" />
          ) : (
            <IconCopy aria-hidden className="pane-icon" />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button
          type="button"
          size="sm"
          className={ui.paneToolbarSolidBtn}
          data-testid="qr-pane-download-button"
          onClick={() => void download()}
          title={`Download ${doc.size}×${doc.size} ${format.toUpperCase()}`}
        >
          <IconDownload aria-hidden className="pane-icon" />
          Download
        </Button>
      </FileBarSlot>

      <div className="qr-pane" data-testid="qr-pane">
        <div className="qr-pane__stage-area">
          <div
            ref={stageRef}
            className={cn(
              "qr-pane__stage",
              doc.background.transparent && "qr-pane__stage--transparent",
            )}
            role="img"
            aria-label={`QR code for ${data || "nothing yet"}`}
            data-testid="qr-pane-preview-content"
          />
          <p className="qr-pane__data" data-testid="qr-pane-data-message">
            {data || "Nothing to encode yet"}
          </p>
          {parseError ? (
            <p
              className="qr-pane__error"
              role="alert"
              data-testid="qr-pane-parse-error-message"
            >
              <IconAlertTriangle aria-hidden className="pane-icon" />
              This file is not a valid QR design ({parseError}). Any change
              replaces it with the design shown.
            </p>
          ) : null}
          {actionError ? (
            <p
              className="qr-pane__error"
              role="alert"
              data-testid="qr-pane-action-error-message"
            >
              <IconAlertTriangle aria-hidden className="pane-icon" />
              {actionError}
            </p>
          ) : null}
        </div>

        <aside className="qr-pane__side" aria-label="QR code settings">
          <Section title="Content">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              className="flex-wrap"
              aria-label="Content type"
              value={doc.content.kind}
              onValueChange={(kind) => {
                // Single-select groups emit "" when the active item is
                // clicked again; a QR always has a content kind.
                if (kind) setContent({ kind: kind as QrContent["kind"] });
              }}
            >
              {CONTENT_KINDS.map((k) => (
                <ToggleGroupItem
                  key={k.value}
                  value={k.value}
                  data-testid={`qr-pane-kind-${k.value}-button`}
                >
                  {k.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <ContentFields content={doc.content} onChange={setContent} />
          </Section>

          <Section title="Dots">
            <SelectField
              label="Shape"
              testId="qr-pane-dot-type-select"
              value={doc.dots.type}
              options={DOT_TYPES}
              onChange={(type) => update((d) => ({ ...d, dots: { ...d.dots, type } }))}
            />
            <ColorField
              label={doc.dots.gradient ? "Start colour" : "Colour"}
              testId="qr-pane-dot-color"
              value={doc.dots.color}
              onChange={(color) =>
                update((d) => ({ ...d, dots: { ...d.dots, color } }))
              }
            />
            <label className="pane-field__check">
              <input
                type="checkbox"
                className="pane-field__checkbox"
                data-testid="qr-pane-gradient-checkbox"
                checked={Boolean(doc.dots.gradient)}
                onChange={(e) =>
                  update((d) => ({
                    ...d,
                    dots: {
                      ...d.dots,
                      gradient: e.target.checked
                        ? { type: "linear", to: "#6366f1", rotation: 45 }
                        : null,
                    },
                  }))
                }
              />
              Gradient
            </label>
            {doc.dots.gradient ? (
              <>
                <ColorField
                  label="End colour"
                  testId="qr-pane-gradient-color"
                  value={doc.dots.gradient.to}
                  onChange={(to) =>
                    update((d) => ({
                      ...d,
                      dots: { ...d.dots, gradient: { ...d.dots.gradient!, to } },
                    }))
                  }
                />
                <SelectField
                  label="Gradient type"
                  testId="qr-pane-gradient-type-select"
                  value={doc.dots.gradient.type}
                  options={[
                    { value: "linear", label: "Linear" },
                    { value: "radial", label: "Radial" },
                  ]}
                  onChange={(type) =>
                    update((d) => ({
                      ...d,
                      dots: { ...d.dots, gradient: { ...d.dots.gradient!, type } },
                    }))
                  }
                />
                {doc.dots.gradient.type === "linear" ? (
                  <RangeField
                    label="Angle"
                    testId="qr-pane-gradient-angle-input"
                    min={0}
                    max={360}
                    step={15}
                    value={doc.dots.gradient.rotation}
                    format={(v) => `${v}°`}
                    onChange={(rotation) =>
                      update((d) => ({
                        ...d,
                        dots: {
                          ...d.dots,
                          gradient: { ...d.dots.gradient!, rotation },
                        },
                      }))
                    }
                  />
                ) : null}
              </>
            ) : null}
          </Section>

          <Section title="Corners">
            <div className="qr-pane__pair">
              <SelectField
                label="Frame"
                testId="qr-pane-corner-square-type-select"
                value={doc.cornerSquare.type}
                options={CORNER_SQUARE_TYPES}
                onChange={(type) =>
                  update((d) => ({ ...d, cornerSquare: { ...d.cornerSquare, type } }))
                }
              />
              <ColorField
                label="Colour"
                testId="qr-pane-corner-square-color"
                value={doc.cornerSquare.color}
                onChange={(color) =>
                  update((d) => ({ ...d, cornerSquare: { ...d.cornerSquare, color } }))
                }
              />
            </div>
            <div className="qr-pane__pair">
              <SelectField
                label="Centre"
                testId="qr-pane-corner-dot-type-select"
                value={doc.cornerDot.type}
                options={CORNER_DOT_TYPES}
                onChange={(type) =>
                  update((d) => ({ ...d, cornerDot: { ...d.cornerDot, type } }))
                }
              />
              <ColorField
                label="Colour"
                testId="qr-pane-corner-dot-color"
                value={doc.cornerDot.color}
                onChange={(color) =>
                  update((d) => ({ ...d, cornerDot: { ...d.cornerDot, color } }))
                }
              />
            </div>
          </Section>

          <Section title="Background">
            <ColorField
              label="Colour"
              testId="qr-pane-background-color"
              value={doc.background.color}
              disabled={doc.background.transparent}
              onChange={(color) =>
                update((d) => ({ ...d, background: { ...d.background, color } }))
              }
            />
            <label className="pane-field__check">
              <input
                type="checkbox"
                className="pane-field__checkbox"
                data-testid="qr-pane-transparent-checkbox"
                checked={doc.background.transparent}
                onChange={(e) =>
                  update((d) => ({
                    ...d,
                    background: { ...d.background, transparent: e.target.checked },
                  }))
                }
              />
              Transparent (PNG, SVG, WebP)
            </label>
          </Section>

          <Section title="Logo">
            <LogoField doc={doc} update={update} onError={setActionError} />
          </Section>

          <Section title="Output">
            <RangeField
              label="Size"
              testId="qr-pane-size-input"
              min={MIN_SIZE}
              max={MAX_SIZE}
              step={32}
              value={doc.size}
              format={(v) => `${v}px`}
              onChange={(size) => update((d) => ({ ...d, size }))}
            />
            <RangeField
              label="Quiet zone"
              testId="qr-pane-margin-input"
              min={0}
              max={64}
              step={2}
              value={doc.margin}
              format={(v) => `${v}px`}
              onChange={(margin) => update((d) => ({ ...d, margin }))}
            />
            <SelectField
              label="Error correction"
              testId="qr-pane-error-correction-select"
              value={doc.errorCorrection}
              options={ERROR_LEVELS}
              onChange={(errorCorrection) =>
                update((d) => ({ ...d, errorCorrection }))
              }
            />
            <SelectField
              label="Outline"
              testId="qr-pane-shape-select"
              value={doc.shape}
              options={[
                { value: "square", label: "Square" },
                { value: "circle", label: "Circle" },
              ]}
              onChange={(shape) => update((d) => ({ ...d, shape }))}
            />
            <Button
              type="button"
              variant="destructive"
              size="sm"
              data-testid="qr-pane-reset-button"
              onClick={() =>
                update((d) => ({ ...defaultQrDoc(), content: d.content }))
              }
            >
              <IconRefresh aria-hidden className="pane-icon" />
              Reset style
            </Button>
          </Section>
        </aside>
      </div>
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="qr-pane__section">
      <h3 className="qr-pane__heading">{title}</h3>
      {children}
    </section>
  );
}

function ContentFields({
  content,
  onChange,
}: {
  content: QrContent;
  onChange: (patch: Partial<QrContent>) => void;
}) {
  switch (content.kind) {
    case "text":
      return (
        <TextField
          label="Text or link"
          testId="qr-pane-text-input"
          multiline
          value={content.text}
          placeholder="https://example.com"
          onChange={(text) => onChange({ text })}
        />
      );
    case "wifi":
      return (
        <>
          <TextField
            label="Network name (SSID)"
            testId="qr-pane-ssid-input"
            value={content.ssid}
            onChange={(ssid) => onChange({ ssid })}
          />
          <SelectField
            label="Security"
            testId="qr-pane-security-select"
            value={content.security}
            options={[
              { value: "WPA", label: "WPA / WPA2 / WPA3" },
              { value: "WEP", label: "WEP" },
              { value: "nopass", label: "None" },
            ]}
            onChange={(security) => onChange({ security })}
          />
          {content.security !== "nopass" ? (
            <TextField
              label="Password"
              testId="qr-pane-password-input"
              value={content.password}
              onChange={(password) => onChange({ password })}
            />
          ) : null}
          <label className="pane-field__check">
            <input
              type="checkbox"
              className="pane-field__checkbox"
              data-testid="qr-pane-hidden-checkbox"
              checked={content.hidden}
              onChange={(e) => onChange({ hidden: e.target.checked })}
            />
            Hidden network
          </label>
        </>
      );
    case "email":
      return (
        <>
          <TextField
            label="To"
            testId="qr-pane-email-input"
            value={content.email}
            placeholder="name@example.com"
            onChange={(email) => onChange({ email })}
          />
          <TextField
            label="Subject"
            testId="qr-pane-subject-input"
            value={content.subject}
            onChange={(subject) => onChange({ subject })}
          />
          <TextField
            label="Message"
            testId="qr-pane-body-input"
            multiline
            value={content.body}
            onChange={(body) => onChange({ body })}
          />
        </>
      );
    case "phone":
      return (
        <TextField
          label="Phone number"
          testId="qr-pane-phone-input"
          value={content.phone}
          placeholder="+1 555 0100"
          onChange={(phone) => onChange({ phone })}
        />
      );
    case "sms":
      return (
        <>
          <TextField
            label="Phone number"
            testId="qr-pane-phone-input"
            value={content.phone}
            placeholder="+1 555 0100"
            onChange={(phone) => onChange({ phone })}
          />
          <TextField
            label="Message"
            testId="qr-pane-message-input"
            multiline
            value={content.message}
            onChange={(message) => onChange({ message })}
          />
        </>
      );
  }
}

function LogoField({
  doc,
  update,
  onError,
}: {
  doc: QrDoc;
  update: (fn: (d: QrDoc) => QrDoc) => void;
  onError: (message: string | null) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const pick = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      onError("The logo must be an image file.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      onError("The logo must be 1 MB or smaller.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      onError(null);
      update((d) => ({
        ...d,
        // A logo hides dots — raise error correction so the code still scans.
        errorCorrection: "H",
        logo: {
          src: String(reader.result),
          size: d.logo?.size ?? 0.3,
          margin: d.logo?.margin ?? 4,
          hideBackgroundDots: d.logo?.hideBackgroundDots ?? true,
        },
      }));
    };
    reader.onerror = () => onError("Could not read that image.");
    reader.readAsDataURL(file);
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="qr-pane__file-input"
        data-testid="qr-pane-logo-file-input"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <div className="pane-field__row">
        {doc.logo ? (
          <img className="qr-pane__logo" src={doc.logo.src} alt="Current logo" />
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="qr-pane-logo-button"
          onClick={() => inputRef.current?.click()}
        >
          <IconPhotoPlus aria-hidden className="pane-icon" />
          {doc.logo ? "Replace" : "Add image"}
        </Button>
        {doc.logo ? (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            data-testid="qr-pane-logo-remove-button"
            onClick={() => update((d) => ({ ...d, logo: null }))}
          >
            <IconTrash aria-hidden className="pane-icon" />
            Remove
          </Button>
        ) : null}
      </div>
      {doc.logo ? (
        <>
          <RangeField
            label="Logo size"
            testId="qr-pane-logo-size-input"
            min={0.1}
            max={0.5}
            step={0.05}
            value={doc.logo.size}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(size) =>
              update((d) => ({ ...d, logo: d.logo && { ...d.logo, size } }))
            }
          />
          <RangeField
            label="Logo padding"
            testId="qr-pane-logo-margin-input"
            min={0}
            max={20}
            step={1}
            value={doc.logo.margin}
            format={(v) => `${v}px`}
            onChange={(margin) =>
              update((d) => ({ ...d, logo: d.logo && { ...d.logo, margin } }))
            }
          />
          <label className="pane-field__check">
            <input
              type="checkbox"
              className="pane-field__checkbox"
              data-testid="qr-pane-logo-hide-dots-checkbox"
              checked={doc.logo.hideBackgroundDots}
              onChange={(e) =>
                update((d) => ({
                  ...d,
                  logo: d.logo && {
                    ...d.logo,
                    hideBackgroundDots: e.target.checked,
                  },
                }))
              }
            />
            Clear dots behind the logo
          </label>
        </>
      ) : (
        <p className="pane-field__hint">
          A centred image, stored in the file. Error correction switches to
          High so the code still scans.
        </p>
      )}
    </>
  );
}

function TextField({
  label,
  testId,
  value,
  placeholder,
  multiline,
  onChange,
}: {
  label: string;
  testId: string;
  value: string;
  placeholder?: string;
  multiline?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="pane-field">
      <span className="pane-field__label">{label}</span>
      {multiline ? (
        <textarea
          className="pane-field__textarea"
          data-testid={testId}
          value={value}
          placeholder={placeholder}
          rows={3}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Input
          data-testid={testId}
          value={value}
          placeholder={placeholder}
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}

function SelectField<T extends string>({
  label,
  testId,
  value,
  options,
  onChange,
}: {
  label: string;
  testId: string;
  value: T;
  options: readonly { value: T; label: string }[];
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
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ColorField({
  label,
  testId,
  value,
  disabled,
  onChange,
}: {
  label: string;
  testId: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => setDraft(value), [value]);
  const valid = /^#[0-9a-f]{6}$/i.test(draft);
  return (
    <div className="pane-field">
      <span className="pane-field__label">{label}</span>
      <div className="pane-field__row">
        <input
          type="color"
          className="pane-field__color"
          aria-label={`${label} picker`}
          data-testid={`${testId}-picker-input`}
          value={valid ? draft : value}
          disabled={disabled}
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
          disabled={disabled}
          spellCheck={false}
          maxLength={7}
          onChange={(e) => {
            setDraft(e.target.value);
            if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange(e.target.value);
          }}
        />
      </div>
    </div>
  );
}

function RangeField({
  label,
  testId,
  min,
  max,
  step,
  value,
  format,
  onChange,
}: {
  label: string;
  testId: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <Slider
      size="sm"
      label={label}
      data-testid={testId}
      min={min}
      max={max}
      step={step}
      value={value}
      formatValue={(current) => format(current)}
      onValueChange={onChange}
    />
  );
}
