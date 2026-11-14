import * as React from "react";

/** Returns the current document bytes from a mounted Extend editor. */
export type GetDocumentBytes = () => Promise<ArrayBuffer | Uint8Array | null>;

type BridgeRef = React.RefObject<GetDocumentBytes | null>;

const SaveBridgeContext = React.createContext<BridgeRef | null>(null);

/**
 * Lets a host read the bytes of an Extend editor (DOCX / XLSX) mounted below
 * it. The editors call {@link useRegisterDocumentBytes} with their internal
 * `getDocxBytes` / `getXlsxBytes`; the host keeps the ref and calls it on save.
 */
export function SaveBridgeProvider({
  bridgeRef,
  children,
}: {
  bridgeRef: BridgeRef;
  children: React.ReactNode;
}) {
  return (
    <SaveBridgeContext.Provider value={bridgeRef}>
      {children}
    </SaveBridgeContext.Provider>
  );
}

export function useRegisterDocumentBytes(getBytes: GetDocumentBytes) {
  const ref = React.useContext(SaveBridgeContext);
  React.useEffect(() => {
    if (!ref) return;
    ref.current = getBytes;
    return () => {
      if (ref.current === getBytes) ref.current = null;
    };
  }, [ref, getBytes]);
}
