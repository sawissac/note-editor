import { IconCheck, IconCopy } from "@tabler/icons-react";
import * as React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/** Plain text of rendered children, for copying a code block. */
function textOf(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return textOf(node.props.children);
  }
  return "";
}

function CodeBlock({ children }: { children?: React.ReactNode }) {
  const [copied, setCopied] = React.useState(false);
  const code = React.isValidElement<{ className?: string }>(children)
    ? React.cloneElement(children, {
        className: cn(children.props.className, "chat-markdown__code--block"),
      })
    : children;
  return (
    <div className="chat-markdown__code-frame">
      <Button
        type="button"
        variant="outline"
        size="icon-xs"
        className="chat-markdown__copy"
        aria-label="Copy code"
        onClick={() =>
          void navigator.clipboard.writeText(textOf(children)).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1000);
          })
        }
      >
        {copied ? (
          <IconCheck aria-hidden className="chat-markdown__copy-icon" />
        ) : (
          <IconCopy aria-hidden className="chat-markdown__copy-icon" />
        )}
      </Button>
      <pre className="chat-markdown__pre">{code}</pre>
    </div>
  );
}

/** Every tag mapped to a BEM element of `chat-markdown`. */
const COMPONENTS: Components = {
  p: ({ children }) => <p className="chat-markdown__paragraph">{children}</p>,
  h1: ({ children }) => <h3 className="chat-markdown__heading">{children}</h3>,
  h2: ({ children }) => <h3 className="chat-markdown__heading">{children}</h3>,
  h3: ({ children }) => <h4 className="chat-markdown__heading">{children}</h4>,
  h4: ({ children }) => <h5 className="chat-markdown__heading">{children}</h5>,
  h5: ({ children }) => <h6 className="chat-markdown__heading">{children}</h6>,
  h6: ({ children }) => <h6 className="chat-markdown__heading">{children}</h6>,
  ul: ({ children }) => <ul className="chat-markdown__list">{children}</ul>,
  ol: ({ children }) => (
    <ol className="chat-markdown__list chat-markdown__list--ordered">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="chat-markdown__item">{children}</li>,
  a: ({ children, href }) => (
    <a
      className="chat-markdown__link"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="chat-markdown__quote">{children}</blockquote>
  ),
  code: ({ children, className }) => (
    <code className={cn("chat-markdown__code", className)}>{children}</code>
  ),
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  table: ({ children }) => (
    <div className="chat-markdown__table-frame">
      <table className="chat-markdown__table">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="chat-markdown__th">{children}</th>,
  td: ({ children }) => <td className="chat-markdown__td">{children}</td>,
  hr: () => <hr className="chat-markdown__rule" />,
  strong: ({ children }) => (
    <strong className="chat-markdown__strong">{children}</strong>
  ),
  // Remote images are not fetched automatically — shown as a link instead.
  img: ({ src, alt }) => (
    <a
      className="chat-markdown__link"
      href={typeof src === "string" ? src : undefined}
      target="_blank"
      rel="noopener noreferrer"
    >
      [image{alt ? `: ${alt}` : ""}]
    </a>
  ),
};

/** A model reply rendered as GitHub-flavoured Markdown (no raw HTML). */
export function ChatMarkdown({ text }: { text: string }) {
  return (
    <div className="chat-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
