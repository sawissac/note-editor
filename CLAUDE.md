## BEM CSS naming

All CSS/SCSS and every `class`/`className` follows BEM — see skill `bem-css` (`.claude/skills/bem-css/SKILL.md`).

Non-negotiables:
- `.block`, `.block__elem`, `.block--mod`, `.block__elem--mod`. Lowercase, dashes for spaces.
- Modifier is an extra class: `class="block block--mod"`, never the modifier alone.
- Flat classes. Never `block__el1__el2`, however deep the DOM nests.
- Single-class selectors only. No tags (`div.block`), no IDs, no `.block .block__elem`.
- Only allowed nesting: `.block--mod .block__elem`.
- Semantic modifier names (`--selected`), never visual (`--border-bottom-5px`).
- No global helpers (`.hidden`, `.red`). No external margin/position on a block.

With Tailwind:
- Markup carries BEM classes only. Utilities live in `@apply` inside the BEM rule, in `@layer components`.
- One-off unnamed layout wrappers may use utilities inline; anything named or reused becomes a block.
- `hover:`/`focus-visible:`/`md:`/`dark:` go in `@apply`. Modifiers stay for app state (`--selected`, `--loading`).
- No `!` importance; modifier rule after base rule. `@apply` utilities only, never another BEM class.
- Prefer theme tokens over arbitrary values. Vue/Svelte/CSS-Module files need `@reference` for `@apply`.
