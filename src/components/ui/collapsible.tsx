"use client";

import { Collapsible as CollapsiblePrimitive } from "radix-ui";
import * as React from "react";

/**
 * Unstyled show/hide region. Put a {@link CollapsibleTrigger} (usually
 * `asChild` on a `Button`) and a {@link CollapsibleContent} inside; style the
 * open state from `data-[state=open]` on either part.
 */
function Collapsible(
  props: React.ComponentProps<typeof CollapsiblePrimitive.Root>,
) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

function CollapsibleTrigger(
  props: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>,
) {
  return (
    <CollapsiblePrimitive.CollapsibleTrigger
      data-slot="collapsible-trigger"
      {...props}
    />
  );
}

function CollapsibleContent(
  props: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent>,
) {
  return (
    <CollapsiblePrimitive.CollapsibleContent
      data-slot="collapsible-content"
      {...props}
    />
  );
}

export { Collapsible, CollapsibleContent, CollapsibleTrigger };
