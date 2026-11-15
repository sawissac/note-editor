import * as React from "react";

/** Returns the current document bytes from a mounted Extend editor. */
export type GetDocumentBytes = () => Promise<ArrayBuffer | Uint8Array | null>;

type BridgeRef = React.RefObject<GetDocumentBytes | null>;

type Bridge = {
  bytes: BridgeRef;
  /** Latest `onChange` from the host, read when an edit is reported. */
  onChange: React.RefObject<(() => void) | undefined>;
};

const SaveBridgeContext = React.createContext<Bridge | null>(null);

/**
 * Lets a host read the bytes of an Extend editor (DOCX / XLSX) mounted below
 * it, and hear when its document changes. The editors call
 * {@link useRegisterDocumentBytes} with their internal `getDocxBytes` /
 * `getXlsxBytes` and {@link useReportDocumentChange} with a value that changes
 * on every edit; the host keeps the ref and autosaves on change.
 */
export function SaveBridgeProvider({
  bridgeRef,
  onChange,
  children,
}: {
  bridgeRef: BridgeRef;
  onChange?: () => void;
  children: React.ReactNode;
}) {
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;
  const value = React.useMemo(
    () => ({ bytes: bridgeRef, onChange: onChangeRef }),
    [bridgeRef],
  );
  return (
    <SaveBridgeContext.Provider value={value}>
      {children}
    </SaveBridgeContext.Provider>
  );
}

export function useRegisterDocumentBytes(getBytes: GetDocumentBytes) {
  const bridge = React.useContext(SaveBridgeContext);
  React.useEffect(() => {
    if (!bridge) return;
    const ref = bridge.bytes;
    ref.current = getBytes;
    return () => {
      if (ref.current === getBytes) ref.current = null;
    };
  }, [bridge, getBytes]);
}

/**
 * Tells the host the document changed whenever `token` changes (an immutable
 * model, a revision counter). A change of `loadKey` — a document (re)load — is
 * a new baseline, not an edit.
 */
export function useReportDocumentChange(token: unknown, loadKey: unknown = null) {
  const bridge = React.useContext(SaveBridgeContext);
  const last = React.useRef({ token, loadKey });
  React.useEffect(() => {
    const prev = last.current;
    last.current = { token, loadKey };
    if (prev.loadKey !== loadKey) return;
    if (prev.token !== token) bridge?.onChange.current?.();
  }, [bridge, token, loadKey]);
}
