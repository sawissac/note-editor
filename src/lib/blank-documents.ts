import { EMPTY_CALENDAR } from "@/lib/calendar";
import { BLANK_DIFF } from "@/lib/diff-doc";
import type { FileKind } from "@/lib/file-types";
import { serializeKanban, starterBoard } from "@/lib/kanban";
import { emptyChat, serializeChat } from "@/lib/chat-doc";
import { defaultQrDoc, serializeQr } from "@/lib/qr-doc";
import { RANDOM_STARTER } from "@/lib/random-doc";
import { serializeTimers, starterTimers } from "@/lib/timer-doc";

/**
 * Minimal valid Office files, base64-encoded: an empty Letter-size Word
 * document and a workbook with one empty "Sheet1". New .docx / .xlsx files
 * start from these so the Extend editors have something to open.
 */
const BLANK_DOCX =
  "UEsDBBQAAAAIAOZkbV15bjPX6AAAAK0BAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH1QyU7DMBD9FWuuKHHggBCK0wPLETiUDxjZk8SqN3nc0v49Tlt6QIXjzFv1+tXeO7GjzDYGBbdtB4KCjsaGScHn+rV5AMEFg0EXAyk4EMNq6NeHRCyqNrCCuZT0KCXrmTxyGxOFiowxeyz1zJNMqDc4kbzrunupYygUSlMWDxj6Zxpx64p42df3qUcmxyCeTsQlSwGm5KzGUnG5C+ZXSnNOaKvyyOHZJr6pBJBXExbk74Cz7r0Ok60h8YG5vKGvLPkVs5Em6q2vyvZ/mys94zhaTRf94pZy1MRcF/euvSAebfjpL49zD99QSwMEFAAAAAgA5mRtXZv9N+qtAAAAKQEAAAsAAABfcmVscy8ucmVsc43POw7CMAwG4KtE3mlaBoRQ0y4IqSsqB7ASN61oHkrCo7cnAwNFDIy2f3+W6/ZpZnanECdnBVRFCYysdGqyWsClP232wGJCq3B2lgQsFKFt6jPNmPJKHCcfWTZsFDCm5A+cRzmSwVg4TzZPBhcMplwGzT3KK2ri27Lc8fBpwNpknRIQOlUB6xdP/9huGCZJRydvhmz6ceIrkWUMmpKAhwuKq3e7yCzwpuarF5sXUEsDBBQAAAAIAOZkbV2gX7hr2QAAAFMBAAARAAAAd29yZC9kb2N1bWVudC54bWxNkMFqwzAMhl/F+L4qDd1WQt3eehsMtj2AaytxILaMrc7rnn5Oykgvkj5J/PrR4fTjJ/GNKY8UlNxuGikwGLJjGJT8+jw/7aXIrIPVEwVU8oZZno6H0lkyV4+BRRUIuStKOubYAWTj0Ou8oYihznpKXnPFNEChZGMigzlXfT9B2zQv4PUY5Cx5IXubc4Q5ZjT8nhYePn5FmU9s23ZXHZbO1fp5X2u4L7zpVLtMsfZ395U0Do5XvBAz+ZUn7B+mDrXFpORru2BPxA84XHnB5Rys1uDfM6z/OP4BUEsBAhQDFAAAAAgA5mRtXXluM9foAAAArQEAABMAAAAAAAAAAAAAAIABAAAAAFtDb250ZW50X1R5cGVzXS54bWxQSwECFAMUAAAACADmZG1dm/036q0AAAApAQAACwAAAAAAAAAAAAAAgAEZAQAAX3JlbHMvLnJlbHNQSwECFAMUAAAACADmZG1doF+4a9kAAABTAQAAEQAAAAAAAAAAAAAAgAHvAQAAd29yZC9kb2N1bWVudC54bWxQSwUGAAAAAAMAAwC5AAAA9wIAAAAA";

const BLANK_XLSX =
  "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";

function fromBase64(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/** One empty US Letter page, built with pdf-lib (loaded on demand). */
async function blankPdf(): Promise<ArrayBuffer> {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  const bytes = await doc.save();
  return bytes.slice().buffer;
}

/** Starter diagram for a new .mermaid file. */
export const MERMAID_STARTER = `flowchart TD
  A[Start] --> B{Decide}
  B -->|Yes| C[Do it]
  B -->|No| D[Skip]
`;

/** Starter script for a new .sql file — runnable as-is. */
export const SQL_STARTER = `-- Run with Cmd/Ctrl+Enter: the selection, or the whole file, executes in a
-- fresh in-memory SQLite database each time.
CREATE TABLE people (id INTEGER PRIMARY KEY, name TEXT NOT NULL, role TEXT);

INSERT INTO people (name, role) VALUES
  ('Ada Lovelace', 'Engineer'),
  ('Grace Hopper', 'Admiral');

SELECT * FROM people ORDER BY name;
`;

/**
 * Starter for a new .regex file: the expression on the first line, the text
 * it is tested on below (see `@/lib/regex`).
 */
export const REGEX_STARTER = String.raw`/\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g
Edit the pattern on the right; matches are highlighted here as you type.

Ada wrote from ada@example.com to grace.hopper@navy.mil,
then copied linus+kernel@linux-foundation.org.

Not addresses: user@localhost, @handle, name@
`;

/** Initial content for a newly created file of `kind`. */
export async function blankContent(
  kind: FileKind,
): Promise<string | ArrayBuffer> {
  switch (kind) {
    case "docx":
      return fromBase64(BLANK_DOCX);
    case "xlsx":
      return fromBase64(BLANK_XLSX);
    case "pdf":
      return blankPdf();
    case "mermaid":
      return MERMAID_STARTER;
    case "calendar":
      return EMPTY_CALENDAR;
    case "kanban":
      return serializeKanban(starterBoard());
    case "json":
    case "apikeys":
      return "{}\n";
    case "sql":
      return SQL_STARTER;
    case "regex":
      return REGEX_STARTER;
    case "diff":
      return BLANK_DIFF;
    case "qr":
      return serializeQr(defaultQrDoc());
    case "random":
      return RANDOM_STARTER;
    case "timer":
      return serializeTimers(starterTimers());
    case "chat":
      return serializeChat(emptyChat());
    case "image":
      // Empty until an image is imported into it.
      return new ArrayBuffer(0);
    default:
      return "";
  }
}
