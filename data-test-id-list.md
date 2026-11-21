# data-testid registry

## SchemaPane
- `schema-pane-builder-content` — SchemaPane / builder root
- `schema-pane-raw-input` — SchemaPane / Monaco raw JSON editor root
- `schema-pane-error-message` — SchemaPane / parse error message
- `schema-pane-raw-button` — SchemaPane / "Fix in raw editor" button

## MermaidPane
- `mermaid-pane-raw-input` — MermaidPane / Monaco source editor root
- `mermaid-pane-preview-content` — MermaidPane / rendered diagram root
- `mermaid-pane-empty-message` — MermaidPane / empty-source message
- `mermaid-pane-error-message` — MermaidPane / syntax error message

## CsvPane
- `csv-raw-editor` — CsvPane / Monaco raw CSV editor root

## TextPane (EditorArea)
- `text-editor` — TextPane / Monaco plain-text editor root

## MarkdownPane (EditorArea)
- `markdown-skeleton` — MarkdownSkeleton / loading placeholder until the rich editor is ready

## Loading skeletons
- `pane-skeleton` — PaneSkeleton / per-kind placeholder while a file is read or its pane chunk loads
- `code-skeleton` — CodeSkeleton / placeholder while Monaco downloads and boots
- `diff-lines-skeleton` — DiffLinesSkeleton / diff rows while both files are read
- `diagram-skeleton` — DiagramSkeleton / Mermaid preview before its first render

## MermaidPane (image download)
- `mermaid-pane-download-png-button` — MermaidPane / download PNG button
- `mermaid-pane-download-svg-button` — MermaidPane / download SVG button
- `mermaid-pane-image-error-message` — MermaidPane / image export error

## UnifiedExportDialog
- `unified-export-dialog` — UnifiedExportDialog / dialog root
- `unified-export-dialog-title-input` — UnifiedExportDialog / PDF title field
- `unified-export-dialog-page-size-a4-button` — UnifiedExportDialog / A4 page size
- `unified-export-dialog-page-size-letter-button` — UnifiedExportDialog / Letter page size
- `unified-export-dialog-contents-checkbox` — UnifiedExportDialog / contents page toggle
- `unified-export-dialog-count-message` — UnifiedExportDialog / "n of m selected"
- `unified-export-dialog-reset-order-button` — UnifiedExportDialog / back to explorer order
- `unified-export-dialog-select-all-button` — UnifiedExportDialog / select all
- `unified-export-dialog-clear-button` — UnifiedExportDialog / clear selection
- `unified-export-dialog-list` — UnifiedExportDialog / file list
- `unified-export-dialog-empty-message` — UnifiedExportDialog / no exportable files
- `unified-export-dialog-progress` — UnifiedExportDialog / conversion progress
- `unified-export-dialog-error-message` — UnifiedExportDialog / export failure
- `unified-export-dialog-result-message` — UnifiedExportDialog / download result
- `unified-export-dialog-failure-list` — UnifiedExportDialog / per-file failures in preview
- `unified-export-dialog-preview-content` — UnifiedExportDialog / PDF preview root
- `unified-export-dialog-cancel-button` — UnifiedExportDialog / close
- `unified-export-dialog-preview-button` — UnifiedExportDialog / preview PDF
- `unified-export-dialog-export-button` — UnifiedExportDialog / export (download) PDF
- `unified-export-dialog-back-button` — UnifiedExportDialog / back from preview
- `unified-export-dialog-download-button` — UnifiedExportDialog / download from preview

## UnifiedExportRow
- `unified-export-row-<id>` — UnifiedExportRow / row
- `unified-export-row-checkbox-<id>` — UnifiedExportRow / include checkbox
- `unified-export-row-drag-handle-<id>` — UnifiedExportRow / drag handle
- `unified-export-row-move-up-button-<id>` — UnifiedExportRow / move up
- `unified-export-row-move-down-button-<id>` — UnifiedExportRow / move down

## CalendarPane
- `calendar-pane` — CalendarPane / root (focus target for shortcuts)
- `calendar-pane-title` — CalendarPane / period title ("November 2026")
- `calendar-pane-view-day-button` — CalendarPane / Day view button
- `calendar-pane-view-week-button` — CalendarPane / Week view button
- `calendar-pane-view-month-button` — CalendarPane / Month view button
- `calendar-pane-view-year-button` — CalendarPane / Year view button
- `calendar-pane-prev-button` — CalendarPane / previous period
- `calendar-pane-today-button` — CalendarPane / Today
- `calendar-pane-next-button` — CalendarPane / next period
- `calendar-pane-new-button` — CalendarPane / new event
- `calendar-pane-ics-button` — CalendarPane / download .ics (file bar)
- `calendar-pane-error-message` — CalendarPane / invalid file message
- `calendar-pane-reset-button` — CalendarPane / "Start an empty calendar"

## MonthView (CalendarPane)
- `calendar-month-view` — MonthView / root
- `calendar-month-view-day-<YYYY-MM-DD>` — MonthView / day cell
- `calendar-month-view-day-<YYYY-MM-DD>-button` — MonthView / day number (opens Day view)
- `calendar-month-view-event-<eventId>` — MonthView / event chip
- `calendar-month-view-more-<YYYY-MM-DD>-button` — MonthView / "N more"

## TimeGridView (CalendarPane, Day + Week)
- `calendar-time-grid` — TimeGridView / root
- `calendar-time-grid-day-<YYYY-MM-DD>-button` — TimeGridView / day header
- `calendar-time-grid-column-<YYYY-MM-DD>` — TimeGridView / day column (drag / double-click to create)
- `calendar-time-grid-event-<eventId>-<YYYY-MM-DD>` — TimeGridView / timed event block
- `calendar-time-grid-event-<eventId>-<YYYY-MM-DD>-resize` — TimeGridView / resize handle
- `calendar-time-grid-allday-<eventId>-<YYYY-MM-DD>` — TimeGridView / all-day chip

## YearView (CalendarPane)
- `calendar-year-view` — YearView / root
- `calendar-year-view-month-<1-12>-button` — YearView / month title
- `calendar-year-view-day-<YYYY-MM-DD>-button` — YearView / day

## EventEditor (CalendarPane)
- `calendar-event-editor` — EventEditor / popover content
- `calendar-event-editor-title-input` — EventEditor / title
- `calendar-event-editor-location-input` — EventEditor / location
- `calendar-event-editor-summary-message` — EventEditor / time summary line
- `calendar-event-editor-allday-input` — EventEditor / all-day checkbox
- `calendar-event-editor-start-date-input` — EventEditor / start date
- `calendar-event-editor-start-time-input` — EventEditor / start time
- `calendar-event-editor-end-date-input` — EventEditor / end date
- `calendar-event-editor-end-time-input` — EventEditor / end time
- `calendar-event-editor-color-<color>-button` — EventEditor / colour swatch
- `calendar-event-editor-notes-input` — EventEditor / notes
- `calendar-event-editor-delete-button` — EventEditor / delete

## DataPane (.json / .yaml / .toml)
- `data-pane-status-message` — DataPane / first parse error (file bar; absent when the file parses)
- `data-pane-format-button` — DataPane / Format (JSON, YAML, TOML)
- `data-pane-source-input` — DataPane / Monaco source editor root

## SqlPane
- `sql-pane-run-button` — SqlPane / Run (file bar)
- `sql-pane-source-input` — SqlPane / Monaco SQL editor root
- `sql-pane-idle-message` — SqlPane / before first run / running
- `sql-pane-error-message` — SqlPane / SQLite error
- `sql-pane-results` — SqlPane / results root
- `sql-pane-summary-message` — SqlPane / timing + counts line
- `sql-pane-result-<n>-table` — SqlPane / nth result set (statement order)

## EnvPane (.env)
- `env-pane-source-input` — EnvPane / Monaco dotenv editor root
- `env-pane-status-message` — EnvPane / file-bar problem count button (absent when there are none); opens the problem list
- `env-pane-format-button` — EnvPane / Format (file bar; disabled while the file has syntax errors)
- `env-pane-problems-list` — EnvPane / popover listing every problem as "L<n> message" (touch has no Monaco hover)
- `env-pane-problem-<index>-button` — EnvPane / one problem; selects its line in the editor

## RegexPane (.regex)
- `regex-pane-text-input` — RegexPane / Monaco test-text editor root (left)
- `regex-pane-pattern-input` — RegexPane / one-line Monaco regex editor root
- `regex-pane-error-message` — RegexPane / pattern syntax error
- `regex-pane-copy-button` — RegexPane / copy `/pattern/flags` (file bar)

## RegexStatus (RegexPane, file bar)
- `regex-status-message` — RegexStatus / match count, "Invalid pattern", "Timed out"

## RegexFlags (RegexPane)
- `regex-flags-<flag>-button` — RegexFlags / flag toggle (g, i, m, s, u, y)

## RegexPanel (RegexPane, collapsible block)
- `regex-panel-<id>-toggle-button` — RegexPanel / collapse / expand (id: usage, suggestions)

## RegexUsage (RegexPane)
- `regex-usage-explain-button` — RegexUsage / show the explanation
- `regex-usage-matches-button` — RegexUsage / show the matches
- `regex-usage-count-message` — RegexUsage / total matches (inside the Matches switch)

## RegexExplain (RegexUsage)
- `regex-explain-list` — RegexExplain / rows container
- `regex-explain-row-<start>-<end>` — RegexExplain / one part (selects it in the expression)
- `regex-explain-empty-message` — RegexExplain / no pattern or unexplainable pattern

## RegexMatches (RegexUsage)
- `regex-matches-list` — RegexMatches / matches container
- `regex-matches-row-<startOffset>` — RegexMatches / one match (jumps to it)
- `regex-matches-empty-message` — RegexMatches / no matches, invalid, timed out

## RegexSuggestions (RegexPane)
- `regex-suggestions-count-message` — RegexSuggestions / number of hints (title bar)
- `regex-suggestions-list` — RegexSuggestions / hints container
- `regex-suggestions-<tipId>-item` — RegexSuggestions / one hint
- `regex-suggestions-<tipId>-button` — RegexSuggestions / hint's one-click fix
- `regex-suggestions-empty-message` — RegexSuggestions / no hints
- `regex-suggestions-recipe-<recipeId>-button` — RegexSuggestions / ready-made pattern

## CanvasPane (.canvas)
- `canvas-pane` — CanvasPane / root
- `canvas-pane-stage` — CanvasPane / Konva board (focusable)
- `canvas-pane-empty-message` — CanvasPane / hint on an empty board
- `canvas-pane-view-toolbar` — CanvasPane / history + zoom island (bottom left)
- `canvas-pane-undo-button` / `canvas-pane-redo-button` — CanvasPane / history
- `canvas-pane-zoom-out-button` / `canvas-pane-zoom-reset-button` / `canvas-pane-zoom-in-button` / `canvas-pane-fit-button` — CanvasPane / zoom
- `canvas-pane-export-png-button` — CanvasPane / download PNG (bottom right)
- `canvas-pane-tool-toolbar` — CanvasPane / tool bar (top centre)
- `canvas-pane-tool-{select|hand|pen|rect|ellipse|arrow|line|text|eraser}-button` — CanvasPane / tool
- `canvas-pane-style-toolbar` — CanvasPane / style panel (left; shown for drawing tools or a selection)
- `canvas-pane-color-{ink|hex}-button` — CanvasPane / colour swatch
- `canvas-pane-width-{s|m|l}-button` — CanvasPane / stroke width
- `canvas-pane-fill-{none|tint}-button` — CanvasPane / fill (boxes)
- `canvas-pane-front-button` / `canvas-pane-back-button` — CanvasPane / bring to front, send to back (selection)
- `canvas-pane-duplicate-button` / `canvas-pane-delete-button` — CanvasPane / duplicate, delete (selection)
- `canvas-pane-text-input` — CanvasPane / text being typed
- `canvas-pane-error-message` — CanvasPane / invalid file message
- `canvas-pane-reset-button` — CanvasPane / "Start a blank canvas"

## KanbanPane (.kanban)
- `kanban-pane` — KanbanPane / root
- `kanban-pane-count-message` — KanbanPane / "N columns · N cards" (file bar)
- `kanban-pane-error-message` — KanbanPane / invalid file message
- `kanban-pane-reset-button` — KanbanPane / "Start a new board"
- `kanban-pane-column-list` — KanbanPane / columns container
- `kanban-pane-add-column-button` — KanbanPane / "Add column"
- `kanban-pane-add-column-input` — KanbanPane / new column name

## ColumnView (KanbanPane)
- `kanban-pane-column-<columnId>` — ColumnView / column root (drag by header)
- `kanban-pane-column-<columnId>-title-input` — ColumnView / rename input
- `kanban-pane-column-<columnId>-count-message` — ColumnView / card count
- `kanban-pane-column-<columnId>-menu-trigger` — ColumnView / "…" menu
- `kanban-pane-column-<columnId>-rename-item` — ColumnView / Rename
- `kanban-pane-column-<columnId>-done-item` — ColumnView / mark as done column
- `kanban-pane-column-<columnId>-delete-item` — ColumnView / Delete column
- `kanban-pane-column-<columnId>-card-list` — ColumnView / cards container
- `kanban-pane-column-<columnId>-add-card-button` — AddCard / "Add card"
- `kanban-pane-column-<columnId>-add-card-input` — AddCard / new card title

## SortableCard (KanbanPane)
- `kanban-pane-card-<cardId>` — SortableCard / card (drag; click to edit)
- `kanban-pane-card-<cardId>-initial-message` — CardFace / initial date
- `kanban-pane-card-<cardId>-dates-message` — CardFace / start – due line
- `kanban-pane-card-<cardId>-end-message` — CardFace / end date (red when after due)

## CardEditor (KanbanPane)
- `kanban-card-editor` — CardEditor / popover content
- `kanban-card-editor-title-input` — CardEditor / title
- `kanban-card-editor-notes-input` — CardEditor / notes
- `kanban-card-editor-initial-input` — CardDateField / initial date
- `kanban-card-editor-start-input` — CardDateField / start date
- `kanban-card-editor-end-input` — CardDateField / end date
- `kanban-card-editor-due-input` — CardDateField / due date
- `kanban-card-editor-color-none-button` — CardEditor / no label
- `kanban-card-editor-color-<color>-button` — CardEditor / label colour
- `kanban-card-editor-delete-button` — CardEditor / delete

## NameInput (explorer create / rename)
- `tree-create-input-option-<index>` — NameInput / suggested name in the create list
- `tree-rename-input-<id>-suggestions` — NameInput / suggested-names list while renaming
- `tree-rename-input-<id>-option-<index>` — NameInput / suggested name in the rename list

## Explorer footer
- `explorer-notice-dismiss-button` — Explorer / dismiss "Skipped unsupported" notice

## StatusBar
- `status-bar` — StatusBar / root
- `status-bar-quick-open-button` — StatusBar / "Go to file" (quick open)

## PaneToolbar (EditorArea)
- `pane-download-button` — PaneToolbar / download the active file
- `pane-save-error-message` — PaneToolbar / "Not saved" warning, shown only when a save fails

## Explorer multi-select
- `explorer-selection-count` — Explorer footer / "N selected" when several rows are selected
- `node-menu-clear-selection-item` — NodeMenu (multi-selection) / select only this row
- `node-menu-delete-selection-item` — NodeMenu (multi-selection) / delete every selected row

## Explorer sort
- `explorer-sort-button` — Explorer header / "Sort all folders" dropdown trigger
- `explorer-sort-{key}-item` — Explorer header sort dropdown / sort every folder; `{key}`: `name`, `name-desc`, `modified`, `created`, `type`
- `node-menu-sort-trigger` — NodeMenu / "Sort contents by" (folder) or "Sort folder by" (file) submenu trigger
- `node-menu-sort-{key}-item` — NodeMenu sort submenu / sort that folder's direct contents; same `{key}` values

## DiffPane (.diff)
- `diff-pane-picker` — DiffPane / file picker card (shown until two files are chosen)
- `diff-pane-left-slot-button` — DiffPane / Original slot (click to fill it next)
- `diff-pane-right-slot-button` — DiffPane / Changed slot (click to fill it next)
- `diff-pane-left-clear-button` — DiffPane / clear the Original pick
- `diff-pane-right-clear-button` — DiffPane / clear the Changed pick
- `diff-pane-picker-swap-button` — DiffPane / swap the two picks
- `diff-pane-search-input` — DiffPane / filter the file list
- `diff-pane-option-<fileId>` — DiffPane / file row (fills the active slot)
- `diff-pane-compare-button` — DiffPane / start the comparison
- `diff-pane-cancel-button` — DiffPane / leave the picker, keep current pair
- `diff-pane-missing-message` — DiffPane / a compared file was deleted
- `diff-pane-view` — DiffPane / diff body
- `diff-pane-identical-message` — DiffPane / files have no differences
- `diff-pane-stats` — DiffPane / +added −removed counts (file bar)
- `diff-pane-layout-split-button` — DiffPane / side-by-side layout (file bar)
- `diff-pane-layout-unified-button` — DiffPane / inline layout (file bar)
- `diff-pane-whitespace-button` — DiffPane / ignore whitespace toggle (file bar)
- `diff-pane-copy-button` — DiffPane / copy unified patch (file bar)
- `diff-pane-download-button` — DiffPane / download .patch (file bar)
- `diff-pane-swap-button` — DiffPane / swap original and changed (file bar)
- `diff-pane-change-button` — DiffPane / reopen the picker (file bar)
- `diff-pane-open-left-button` — DiffPane / open the original file
- `diff-pane-open-right-button` — DiffPane / open the changed file

## QuickOpen
- `quick-open-dialog` — QuickOpen / dialog root
- `quick-open-search-input` — QuickOpen / search field
- `quick-open-result-list` — QuickOpen / results list
- `quick-open-file-item-<id>` — QuickOpen / file row (per node id)
- `quick-open-folder-item-<id>` — QuickOpen / folder row (per node id)
- `quick-open-create-file-item-<ext>` — QuickOpen / create-file row, one per suggested format (`md`, `csv`, …)
- `quick-open-create-folder-item` — QuickOpen / "Create folder …" row
- `quick-open-create-file-item-<ext>-error-message` / `quick-open-create-folder-item-error-message` — QuickOpen / why the typed path can't be created
- `quick-open-command-item-<command-id>` — QuickOpen / command row (`>` mode)
- `quick-open-content-item-<file-id>:<line>` — QuickOpen / search-in-files hit (`#` mode)
- `quick-open-content-hint-message` — QuickOpen / `#` mode hint before typing
- `quick-open-busy-message` — QuickOpen / "Searching…" status
- `quick-open-help-item-<mode>` — QuickOpen / mode row (`?` mode)
- `quick-open-files-button` — QuickOpen / footer "Files" mode button
- `quick-open-commands-button` — QuickOpen / footer "Commands" mode button
- `quick-open-search-button` — QuickOpen / footer "Search in files" mode button
- `quick-open-help-button` — QuickOpen / footer "Help" mode button

## QrPane
- `qr-pane` — QrPane / root
- `qr-pane-format-select` — QrPane / download format (file bar)
- `qr-pane-copy-button` — QrPane / copy PNG to clipboard
- `qr-pane-download-button` — QrPane / download image
- `qr-pane-preview-content` — QrPane / rendered QR code
- `qr-pane-data-message` — QrPane / encoded string
- `qr-pane-parse-error-message` — QrPane / invalid file
- `qr-pane-action-error-message` — QrPane / copy / download / logo error
- `qr-pane-kind-<text|wifi|email|phone|sms>-button` — QrPane / content type
- `qr-pane-text-input` / `qr-pane-ssid-input` / `qr-pane-password-input` / `qr-pane-email-input` / `qr-pane-subject-input` / `qr-pane-body-input` / `qr-pane-phone-input` / `qr-pane-message-input` — QrPane / content fields
- `qr-pane-security-select` / `qr-pane-hidden-checkbox` — QrPane / Wi-Fi options
- `qr-pane-dot-type-select` / `qr-pane-gradient-checkbox` / `qr-pane-gradient-type-select` / `qr-pane-gradient-angle-input` — QrPane / dots
- `qr-pane-corner-square-type-select` / `qr-pane-corner-dot-type-select` — QrPane / corners
- `qr-pane-<dot|gradient|corner-square|corner-dot|background>-color-picker-input` — QrPane / colour picker
- `qr-pane-<dot|gradient|corner-square|corner-dot|background>-color-hex-input` — QrPane / colour hex field
- `qr-pane-transparent-checkbox` — QrPane / transparent background
- `qr-pane-logo-file-input` / `qr-pane-logo-button` / `qr-pane-logo-remove-button` — QrPane / logo
- `qr-pane-logo-size-input` / `qr-pane-logo-margin-input` / `qr-pane-logo-hide-dots-checkbox` — QrPane / logo options
- `qr-pane-size-input` / `qr-pane-margin-input` / `qr-pane-error-correction-select` / `qr-pane-shape-select` — QrPane / output
- `qr-pane-reset-button` — QrPane / reset style

## TimerPane
- `timer-pane` — TimerPane / root (Space = play / pause)
- `timer-pane-loop-button` / `timer-pane-sound-button` — TimerPane / queue options (file bar)
- `timer-pane-parse-error-message` — TimerPane / invalid file
- `timer-pane-countdown` — Countdown / ring root
- `timer-pane-hero-label-message` / `timer-pane-clock-message` / `timer-pane-caption-message` — Countdown / label, time, queue position
- `timer-pane-play-button` / `timer-pane-reset-button` / `timer-pane-skip-button` — Countdown / play-pause, stop, skip
- `timer-pane-summary-message` / `timer-pane-empty-message` — TimerPane / queue summary, no timers
- `timer-pane-list` — TimerPane / queue rows
- `timer-pane-timer-<id>-item` — QueueRow / row (click to select)
- `timer-pane-timer-<id>-label-input` / `-h-input` / `-m-input` / `-s-input` — QueueRow / name and duration
- `timer-pane-timer-<id>-clock-message` — QueueRow / remaining time while running
- `timer-pane-timer-<id>-start-button` / `-pause-button` / `-resume-button` / `-reset-button` — QueueRow / run this timer alone
- `timer-pane-timer-<id>-drag-button` — QueueRow / drag handle (also Space + arrow keys)
- `timer-pane-timer-<id>-delete-button` — QueueRow / delete
- `timer-pane-add-<minutes>-button` — TimerPane / add preset timer
- `timer-pane-alerts-button` — TimerPane / enable desktop notifications

## TimerDock
- `timer-dock` — TimerDock / root (bottom-right)
- `timer-dock-collapse-button` / `timer-dock-expand-button` — TimerDock / minimise ⇄ pill
- `timer-dock-run-<run-key>-item` — TimerDock / live timer toast
- `timer-dock-run-<run-key>-pause-button` / `-resume-button` / `-stop-button` / `-open-button` — TimerDock / live controls
- `timer-dock-notice-<notice-id>-item` — TimerDock / "time's up" toast
- `timer-dock-notice-<notice-id>-dismiss-button` / `-open-button` — TimerDock / notice actions

## ChatPane
- `chat-pane` — ChatPane / root
- `chat-setup-trigger` / `chat-setup-content` — ChatSetup / file-bar button (provider · key · model) and its popover
- `chat-setup-provider-<gemini|openrouter>-item` — ChatSetup / provider radio
- `chat-setup-key-<fileId>-<name>-item` / `chat-setup-manage-keys-button` — ChatSetup / API key radio and manage button
- `chat-setup-model-search-input` / `chat-setup-model-list` / `chat-setup-model-custom-item` — ChatSetup / model combobox
- `<prefix>-prompt-none-item` / `<prefix>-prompt-<fileId>-<name>-item` / `<prefix>-prompt-<fileId>-<name>-edit-button` / `<prefix>-prompt-new-button` — PromptList / system prompt radio list (prefix `chat-setup`)
- `<prefix>-prompt-editor` / `<prefix>-prompt-name-input` / `<prefix>-prompt-text-input` / `<prefix>-prompt-save-button` / `<prefix>-prompt-cancel-button` / `<prefix>-prompt-delete-button` / `<prefix>-prompt-error-message` — PromptEditor / write a prompt into its `.prompt` file
- `<prefix>-quick-<slug>-button` / `<prefix>-prompt-<fileId>-<name>-button` / `<prefix>-prompt-<fileId>-<name>-edit-button` / `<prefix>-prompt-new-button` — PromptChips / built-in quick question (only while no `.prompt` entries exist), workspace prompt chip (sends the prompt), its edit pencil, and "+" for a new one (prefix `ask-ai-panel`, `chat-pane`)
- `chat-setup-temperature-input` — ChatSetup / temperature
- `chat-pane-clear-button` — ChatPane / file-bar clear action
- `chat-pane-message-list` — ChatPane / messages
- `chat-pane-message-<id>-item` — ChatPane / message
- `chat-pane-message-<id>-copy-button` / `-regenerate-button` / `-delete-button` — ChatPane / message actions
- `chat-pane-no-key-message` / `chat-pane-create-key-button` — ChatPane / no API key state
- `chat-pane-empty-message` / `chat-pane-parse-error-message` — ChatPane / status text
- `chat-pane-pending-message` — ChatPane / "Thinking · Ns" while a reply has not started
- `chat-composer` — ChatComposer / rich-text message box root
- `chat-pane-send-button` / `chat-pane-stop-button` — ChatPane / composer actions

## AppInfoPane (`app.info`)
- `app-info-pane` — AppInfoPane / root
- `app-info-pane-sort-button` — AppInfoPane / by type ⇄ A→Z (file bar)
- `app-info-pane-replay-button` — AppInfoPane / replay list animation (file bar)
- `app-info-pane-list` — AppInfoPane / file-type list
- `app-info-pane-row-<kind>` — AppInfoPane / one file type: icon, extensions, library chips

## AppStatePane (`app.state`)
- `app-state-pane` — AppStatePane / root
- `app-state-pane-pause-button` — AppStatePane / pause ⇄ resume live updates (file bar)
- `app-state-pane-expand-button` — AppStatePane / expand all (file bar)
- `app-state-pane-collapse-button` — AppStatePane / collapse to slices (file bar)
- `app-state-pane-fit-button` — AppStatePane / fit tree to view (file bar)
- `app-state-pane-graph` — AppStatePane / d3 tree SVG
- `app-state-pane-node-<path>` — AppStatePane / tree node, e.g. `app-state-pane-node-$.fs.nodes`
- `app-state-pane-<files|folders|tabs|updates>-count-message` — AppStatePane / store counter
- `app-state-pane-detail-content` — AppStatePane / selected value JSON

## UnifiedExportDialog (redesign additions)
- `unified-export-dialog-new-note-button` — UnifiedExportDialog / empty state "New note"
- `unified-export-dialog-import-button` — UnifiedExportDialog / empty state "Import files"
- `unified-export-dialog-summary-message` — UnifiedExportDialog / footer "2 Text · 1 Table" summary

## ImagePane (`.img` files)
- `image-pane-import` — ImagePane / importer root (empty `.img`, or Replace)
- `image-pane-import-upload` — ImagePane / image drop zone
- `image-pane-import-error-message` — ImagePane / unreadable or rejected file
- `image-pane-import-cancel-button` — ImagePane / keep current image (Replace)
- `image-pane` — ImagePane / editor root
- `image-pane-error-message` — ImagePane / decode failure
- `image-pane-error-replace-button` — ImagePane / import another image after a failure
- `image-pane-undo-button` / `image-pane-redo-button` — ImagePane / history (file bar)
- `image-pane-zoom-out-button` / `image-pane-zoom-button` / `image-pane-zoom-in-button` — ImagePane / zoom (file bar; middle toggles Fit ⇄ 100%)
- `image-pane-replace-button` — ImagePane / import a different image (file bar)
- `image-pane-copy-button` — ImagePane / copy edited image as PNG (file bar)
- `image-pane-save-button` — ImagePane / save edits (file bar)
- `image-pane-preview-content` — ImagePane / image frame (click copies the pixel colour)
- `image-pane-status` — ImagePane / status line
- `image-pane-size-message` — ImagePane / size · format · bytes
- `image-pane-readout-message` — ImagePane / hovered pixel colour + position
- `image-pane-notice-message` — ImagePane / info or error notice
- `image-pane-save-format-message` — ImagePane / edits saved in another format
- `image-pane-edit-tab-trigger` / `image-pane-adjust-tab-trigger` / `image-pane-export-tab-trigger` — ImagePane / tool tabs
- `image-pane-aspect-<free|original|1-1|4-3|3-2|16-9|4-5|9-16>-button` — ImagePane / crop aspect
- `image-pane-crop-button` / `image-pane-crop-apply-button` / `image-pane-crop-cancel-button` — ImagePane / crop
- `image-pane-crop-x-input` / `-y-input` / `-width-input` / `-height-input` — ImagePane / crop rectangle in px
- `image-pane-rotate-left-button` / `image-pane-rotate-right-button` / `image-pane-flip-horizontal-button` / `image-pane-flip-vertical-button` / `image-pane-trim-button` — ImagePane / transform
- `image-pane-resize-width-input` / `image-pane-resize-height-input` / `image-pane-lock-ratio-switch` / `image-pane-scale-<25|50|200>-button` / `image-pane-resize-apply-button` — ImagePane / resize
- `image-pane-revert-button` — ImagePane / revert to original
- `image-pane-preset-<none|mono|noir|sepia|vintage|vivid|warm|cool|fade>-button` — ImagePane / adjustment presets
- `image-pane-<brightness|contrast|saturation|temperature|hue|grayscale|sepia|blur|sharpen|vignette>-slider` — ImagePane / adjustments (thumb: `…-slider-thumb`)
- `image-pane-invert-switch` / `image-pane-adjust-reset-button` — ImagePane / invert, reset adjustments
- `image-pane-format-select` / `image-pane-quality-slider` / `image-pane-background-input` — ImagePane / export settings
- `image-pane-export-download-button` / `image-pane-export-convert-button` / `image-pane-export-save-copy-button` — ImagePane / download, convert this file, save as new `.img`

## ConvertMenu (NodeMenu "Convert to" submenu)
- `node-menu-convert-{id}` — ConvertMenu / "Convert to" submenu trigger for file `{id}`
- `node-menu-convert-{target}-item` — ConvertMenu / one target: `json`, `yml`, `yaml`, `toml`, `env`, `csv`, `md`, `txt`, `pdf`, `img-{format}` (e.g. `img-png`)
- `node-menu-convert-problem-message` — ConvertMenu / why a target is unavailable
- `explorer-notice-dismiss-button` also shows a failed conversion (Explorer footer)

## BookmarkPane
- `bookmark-pane` — BookmarkPane / root (paste or drop a link to save it, `/` focuses search)
- `bookmark-pane-previews-button` / `bookmark-pane-import-button` / `bookmark-pane-import-input` — BookmarkPane / fetch missing previews, import browser bookmarks.html (file bar)
- `bookmark-pane-grid-view-button` / `bookmark-pane-list-view-button` / `bookmark-pane-add-button` — BookmarkPane / view toggle, add (file bar)
- `bookmark-pane-all-button` / `bookmark-pane-favorites-button` / `bookmark-pane-unsorted-button` — BookmarkPane / collections (drop a card on favorites / unsorted)
- `bookmark-pane-add-folder-button` / `bookmark-pane-folder-list` — BookmarkPane / new top-level folder, folder tree
- `bookmark-pane-tag-list` / `bookmark-pane-tag-<tag>-button` — BookmarkPane / tag filter toggles
- `bookmark-pane-search-input` / `bookmark-pane-sort-select` — BookmarkPane / search, sort
- `bookmark-pane-active-tag-<tag>-button` — BookmarkPane / remove an active tag filter
- `bookmark-pane-parse-error-message` — BookmarkPane / invalid file
- `bookmark-pane-notice-message` / `bookmark-pane-notice-undo-button` / `bookmark-pane-notice-dismiss-button` — BookmarkPane / status notice, undo delete
- `bookmark-pane-list` / `bookmark-pane-empty-message` / `bookmark-pane-clear-filters-button` — BookmarkPane / cards, empty state

## BookmarkFolderRow
- `bookmark-folder-row-<id>-item` / `-button` — BookmarkFolderRow / row, open folder (double-click renames; drop a card to move it)
- `bookmark-folder-row-<id>-name-input` — BookmarkFolderRow / rename field
- `bookmark-folder-row-<id>-add-button` / `-rename-button` / `-delete-button` — BookmarkFolderRow / sub-folder, rename, delete

## BookmarkCard
- `bookmark-card-<id>-item` — BookmarkCard / card or list row (draggable)
- `bookmark-card-<id>-link` — BookmarkCard / title link (new tab)
- `bookmark-card-<id>-tag-<tag>-button` — BookmarkCard / filter by tag
- `bookmark-card-<id>-favorite-button` / `-copy-button` / `-refresh-button` / `-edit-button` / `-delete-button` — BookmarkCard / actions

## BookmarkDialog
- `bookmark-dialog` — BookmarkDialog / add / edit dialog root
- `bookmark-dialog-url-input` / `bookmark-dialog-title-input` / `bookmark-dialog-description-input` — BookmarkDialog / fields
- `bookmark-dialog-folder-select` / `bookmark-dialog-favorite-button` — BookmarkDialog / folder, favorite
- `bookmark-dialog-tags-input` / `bookmark-dialog-tag-<tag>-remove-button` — BookmarkDialog / tags
- `bookmark-dialog-preview-content` / `bookmark-dialog-preview-button` — BookmarkDialog / website preview, fetch / refresh
- `bookmark-dialog-error-message` / `bookmark-dialog-duplicate-message` — BookmarkDialog / invalid address, already saved
- `bookmark-dialog-cancel-button` / `bookmark-dialog-save-button` — BookmarkDialog / actions

## PptxPane
- `pptx-pane` — PptxPane / root
- `pptx-pane-undo-button` / `pptx-pane-redo-button` — PptxPane / history (file bar)
- `pptx-pane-add-text-button` / `pptx-pane-shape-trigger` / `pptx-pane-shape-<kind>-item` / `pptx-pane-add-image-button` — PptxPane / insert text box, shape (`rect`, `rounded`, `ellipse`, `triangle`, `diamond`, `star`, `line`, `arrow`), picture (file bar)
- `pptx-pane-image-input` — PptxPane / hidden picture file input
- `pptx-pane-present-button` — PptxPane / start the slide show (file bar)
- `pptx-pane-slide-list` / `pptx-pane-add-slide-button` — PptxPane / slide thumbnails, new slide
- `pptx-pane-workspace` — PptxPane / focusable slide area (keyboard, paste, drop pictures)
- `pptx-pane-parse-error-message` — PptxPane / invalid file
- `pptx-pane-notice-message` / `pptx-pane-notice-dismiss-button` — PptxPane / picture or export error

## PptxSlideRow
- `pptx-slide-row-<id>-item` / `-button` — PptxSlideRow / row, open slide (drag to reorder)
- `pptx-slide-row-<id>-duplicate-button` / `-delete-button` — PptxSlideRow / actions on the open slide

## PptxStage
- `pptx-stage` — PptxStage / Konva canvas host

## PptxTextEditor
- `pptx-text-editor-input` — PptxTextEditor / in-place text field

## PptxInspector
- `pptx-inspector-background-picker-input` / `-hex-input` / `-swatch-<rrggbb>-button` — PptxInspector / slide background
- `pptx-inspector-background-all-button` / `pptx-inspector-notes-input` — PptxInspector / background on every slide, speaker notes
- `pptx-inspector-font-select` / `pptx-inspector-font-size-input` — PptxInspector / font, size
- `pptx-inspector-style-<bold|italic|underline>-button` — PptxInspector / text style
- `pptx-inspector-align-<left|center|right>-button` / `pptx-inspector-valign-<top|middle|bottom>-button` — PptxInspector / alignment
- `pptx-inspector-text-color-*` / `pptx-inspector-text-fill-*` — PptxInspector / text colour, box fill (`-picker-input`, `-hex-input`, `-none-checkbox` on fill, `-swatch-<rrggbb>-button`)
- `pptx-inspector-shape-select` — PptxInspector / shape kind
- `pptx-inspector-fill-*` / `pptx-inspector-stroke-*` — PptxInspector / shape fill, outline (same parts as above)
- `pptx-inspector-stroke-width-input` / `pptx-inspector-opacity-input` — PptxInspector / sliders
- `pptx-inspector-arrange-<front|forward|backward|back>-button` — PptxInspector / stacking order
- `pptx-inspector-x-input` / `-y-input` / `-width-input` / `-height-input` / `-rotation-input` — PptxInspector / exact box (single selection)
- `pptx-inspector-duplicate-button` / `pptx-inspector-delete-button` — PptxInspector / selection actions

- `pptx-inspector-edit-text-button` — PptxInspector / Text section "Edit text" (opens the text editor; the touch/double-click-free route)
- `pptx-inspector-select-all-button` — PptxInspector / Slide section "Select all" elements (multi-select without Shift / ⌘A)

## PptxShow
- `pptx-show` — PptxShow / full-screen slide show root (click advances)
- `pptx-show-slide-content` / `pptx-show-count-message` / `pptx-show-close-button` — PptxShow / slide, position, exit

## DocxEditor (.docx)
- `docx-editor-import-button` — DocxEditor file bar / "Import": replace the document with a DOCX file

## App shell (tablet / narrow layout)
- `explorer-drawer` — App / explorer overlay drawer, shown instead of the docked sidebar below 1024px wide
- `explorer-drawer-scrim` — App / dimmed backdrop behind the drawer; tap closes it

## TabBar
- `tab-bar-show-sidebar-button` — TabBar / "Show sidebar" button (sidebar hidden, or the drawer closed on narrow layouts)

## XlsxContextMenu (xlsx editor / viewer)
- `xlsx-context-menu-<action-id>-item` — xlsx context menu / one row per library action id (cut, copy, merge, …); 40px on touch

## PdfEditor panels (touch additions)
- `pdf-editor-outline-toggle-button` — Outline panel / expand or collapse one bookmark
- `pdf-editor-stamp-remove-button` — Stamps panel / remove a custom stamp (always visible on touch)
- `pdf-editor-pages-goto-button` — Pages panel / go to the selected page (touch only; replaces double-click)

## NotAvailable
- `not-available-screen` — NotAvailable / screen shown instead of the app on phones and tablets
