import { Fragment, useState } from "react";
import { IconTransform } from "@tabler/icons-react";

import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import { type ConvertTarget, convertedName } from "@/lib/convert-targets";
import type { ConvertCheck, ConvertInput } from "@/lib/data-convert";
import { storage } from "@/lib/storage";
import { createSiblingFile } from "@/store/actions";
import type { FsNode } from "@/store/fs-slice";
import { useAppDispatch, useAppStore } from "@/store";
import { getPath } from "@/store/selectors";
import { uiActions } from "@/store/ui-slice";

/**
 * "Convert to" submenu for any file with conversions (data files, CSV,
 * Word, Excel, Markdown, images, diagrams, …). Opening it reads the file and
 * checks every target: quick text conversions run right away, so a target
 * that cannot hold the data (TOML from a top-level list, say) shows
 * disabled with the reason listed under the targets. Slow ones (PDF,
 * images, Word / Excel sources) run when chosen; a failure lands in the
 * explorer footer notice. The converted copy is added next to the file and
 * opened; the source is never changed.
 *
 * @param node - The file row the menu belongs to.
 * @param targets - What the file converts to (`convertTargetsOf`).
 */
export function ConvertMenu({
  node,
  targets,
}: {
  node: FsNode;
  targets: ConvertTarget[];
}) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const [checks, setChecks] = useState<Record<string, ConvertCheck> | null>(
    null,
  );
  const problems = [
    ...new Set(
      targets.flatMap((t) => {
        const c = checks?.[t.id];
        return c && !c.ok ? [c.message] : [];
      }),
    ),
  ];

  const readInput = async (): Promise<ConvertInput> => {
    const { nodes } = store.getState().fs;
    return {
      id: node.id,
      name: node.name,
      content: await storage.getContent(node.id),
      path: getPath(nodes, node.id).join(" / "),
      pathOf: (id) => {
        const all = store.getState().fs.nodes;
        return all[id] ? getPath(all, id).join("/") : undefined;
      },
    };
  };

  const load = async () => {
    setChecks(null);
    const [{ checkTargets }, input] = await Promise.all([
      import("@/lib/data-convert"),
      readInput(),
    ]);
    setChecks(await checkTargets(input, targets));
  };

  const run = async (target: ConvertTarget, check: ConvertCheck) => {
    if (!check.ok) return;
    const name = convertedName(node.name, target.id);
    try {
      let output = check.output;
      if (output === undefined) {
        const [{ convertFile }, input] = await Promise.all([
          import("@/lib/data-convert"),
          readInput(),
        ]);
        output = await convertFile(input, target.id);
      }
      await dispatch(createSiblingFile(node.id, name, output));
      dispatch(uiActions.explorerNoticeSet(null));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      dispatch(
        uiActions.explorerNoticeSet(
          `Could not convert ${node.name} to ${target.label}: ${reason}`,
        ),
      );
    }
  };

  return (
    <ContextMenuSub
      onOpenChange={(open) => {
        if (open) void load();
      }}
    >
      <ContextMenuSubTrigger data-testid={`node-menu-convert-${node.id}`}>
        <IconTransform />
        Convert to
      </ContextMenuSubTrigger>
      <ContextMenuSubContent>
        {targets.map((target, i) => {
          const check = checks?.[target.id];
          return (
            <Fragment key={target.id}>
              {i > 0 && targets[i - 1].group !== target.group ? (
                <ContextMenuSeparator />
              ) : null}
              <ContextMenuItem
                data-testid={`node-menu-convert-${target.id}-item`}
                disabled={!check?.ok}
                onSelect={() => {
                  if (check) void run(target, check);
                }}
              >
                {target.label}
              </ContextMenuItem>
            </Fragment>
          );
        })}
        {problems.length ? (
          <>
            <ContextMenuSeparator />
            {problems.map((message) => (
              <p
                key={message}
                className="convert-menu__problem"
                data-testid="node-menu-convert-problem-message"
              >
                {message}
              </p>
            ))}
          </>
        ) : null}
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}
