# Markdown Viewer/Editor — Integration Tests To Create

## Keyboard Shortcut Forwarding
- [ ] Ctrl+S in edit mode triggers Phoenix save (not consumed by md editor)
- [ ] Ctrl+P in edit mode opens Quick Open
- [ ] Ctrl+Shift+F in edit mode opens Find in Files
- [ ] Ctrl+B/I/U in edit mode applies bold/italic/underline (not forwarded)
- [ ] Ctrl+K in edit mode opens link input (not forwarded)
- [ ] Ctrl+Shift+X in edit mode applies strikethrough (not forwarded)
- [ ] Ctrl+Z/Y in edit mode triggers undo/redo via CM (routed through Phoenix undo stack)
- [ ] Ctrl+A/C/V/X in edit mode work natively (select all, copy, paste, cut)
- [ ] Escape in edit mode sends focus back to Phoenix editor
- [ ] F-key shortcuts (e.g. F8 for live preview toggle) work in edit mode
- [ ] F-key shortcuts work in reader mode

## Document Cache & File Switching
- [ ] Switching between two MD files is instant (no re-render, DOM cached)
- [ ] Scroll position preserved per-document on switch
- [ ] Edit/reader mode preserved globally across file switches
- [ ] Switching MD → HTML → MD reuses persistent md iframe (no reload)
- [ ] Closing live preview panel and reopening preserves md iframe and cache
- [ ] Project switch clears all cached documents
- [ ] Working set changes sync to iframe (files removed from working set go to LRU)
- [ ] LRU cache evicts beyond 20 non-working-set files
- [ ] Reload button (in LP toolbar) re-renders current file, preserves scroll and edit mode

## Selection Sync (Bidirectional)
- [ ] Selecting text in CM highlights corresponding block in md viewer
- [ ] Selecting text in md viewer selects corresponding text in CM
- [ ] Clicking in md viewer (no selection) clears CM selection
- [ ] Clicking in CM clears md viewer highlight
- [ ] Selection sync respects cursor sync toggle (disabled when sync off)

## Cursor/Scroll Sync
- [ ] Clicking in CM scrolls md viewer to corresponding element
- [ ] Clicking in md viewer scrolls CM to corresponding line (centered)
- [ ] Cursor sync toggle button disables/enables bidirectional sync
- [ ] Cursor sync toggle state preserved across toolbar re-renders (file switch, mode toggle)
- [ ] Content sync still works when cursor sync is disabled
- [ ] Cursor sync toggle works in both reader and edit mode
- [ ] Disabling cursor sync in reader mode prevents CM scroll on click

## Edit Mode & Entitlement Gating
- [ ] Free user sees Edit button → clicking shows upsell dialog
- [ ] Pro user sees Edit button → clicking enters edit mode
- [ ] Entitlement change (free→pro) switches to edit mode automatically
- [ ] Entitlement change (pro→free) switches to reader mode automatically
- [ ] Edit/Reader toggle works correctly in the iframe toolbar

## Toolbar & UI
- [ ] Phoenix play button and mode dropdown hidden for MD files
- [ ] Phoenix play button and mode dropdown visible for HTML files
- [ ] Phoenix play button and mode dropdown visible for custom server MD files
- [ ] Progressive toolbar collapse: blocks collapse first, then lists, then text formatting
- [ ] Toolbar collapse thresholds work at various widths
- [ ] Dropdown menus in collapsed toolbar open and close correctly
- [ ] Format buttons apply formatting and close dropdown
- [ ] Tooltip delay is 800ms (not too aggressive)
- [ ] Underline button has shortcut in tooltip (Ctrl+U / ⌘U)
- [ ] Reader button has book-open icon and "Switch to reader mode" title
- [ ] Edit button has pencil icon and "Switch to edit mode" title
- [ ] 1px white line at bottom of preview not visible (box-sizing: border-box on toolbar)

## Checkbox (Task List) Sync
- [ ] Clicking checkbox in edit mode toggles it and syncs to CM source ([x] ↔ [ ])
- [ ] Checkboxes enabled in edit mode, disabled in reader mode
- [ ] Checkbox toggle creates an undo entry
- [ ] Undo reverses checkbox toggle

## Format Bar & Link Popover
- [ ] Format bar appears on text selection (single line, not wrapping)
- [ ] Format bar includes underline button
- [ ] Format bar dismissed on scroll
- [ ] Link popover appears when clicking a link in edit mode
- [ ] Link popover URL opens in default browser (not Electron window)
- [ ] Link popover dismissed on scroll
- [ ] Escape in link popover only dismisses popover, refocuses editor
- [ ] Escape in slash menu only dismisses menu, refocuses editor
- [ ] Escape in lang picker only dismisses picker, refocuses editor

## Empty Line Placeholder
- [ ] Empty paragraph in edit mode shows "Type / for commands" hint text
- [ ] Hint disappears as soon as user types
- [ ] Hint only shows in edit mode, not reader mode
- [ ] Hint shows on paragraphs with only a `<br>` child

## Slash Menu (/ command)
- [ ] Slash menu appears at the / cursor position (not at top of page)
- [ ] Slash menu opens below cursor when space available
- [ ] Slash menu opens above cursor when near bottom of viewport
- [ ] Slash menu has gap between cursor line and menu (not overlapping)
- [ ] Typing after / filters the menu items (e.g. /h1 shows Heading 1)
- [ ] Arrow down/up scrolls selected item into view when outside viewport
- [ ] Escape dismisses slash menu without forwarding to Phoenix
- [ ] Escape refocuses the md editor after dismissing slash menu
- [ ] Selected item wraps around (last → first, first → last)
- [ ] Slash menu works at bottom of a long scrolled document

## Keyboard Shortcut Focus
- [ ] Ctrl+S saves file and keeps focus in md editor (not CM)
- [ ] Forwarded shortcuts refocus md editor after Phoenix handles them

## Table Editing
- [ ] Clearing a table cell with backspace produces valid markdown (no broken pipe rows)
- [ ] Empty table cell renders as `|  |` in markdown source
- [ ] Table cell with `<br>` only-child is treated as empty (br stripped before conversion)
- [ ] Table cell with actual content + `<br>` preserves the line break
- [ ] Tab navigation between table cells works
- [ ] Adding new row via Tab at last cell works
- [ ] Delete row / delete column via context menu works and syncs to CM
- [ ] Table header editing syncs correctly to CM
- [ ] Enter key blocked in table cells (no paragraph/line break insertion)
- [ ] Shift+Enter blocked in table cells
- [ ] Block-level format buttons hidden when cursor is in table (quote, hr, table, codeblock, lists)
- [ ] Block type selector (Paragraph/H1/H2/H3) hidden when cursor is in table
- [ ] Dropdown groups for lists and blocks hidden when cursor is in table
- [ ] Pasting multi-line text in table cell converts to single line (newlines → spaces)
- [ ] Moving cursor out of table restores all toolbar buttons
- [ ] ArrowRight at end of last cell exits table to paragraph below
- [ ] ArrowDown from last cell exits table to paragraph below
- [ ] Enter in last cell exits table to paragraph below
- [ ] If no paragraph exists below table, one is created on exit
- [ ] If paragraph exists below table, cursor moves into it (no duplicate)
- [ ] Cursor in table wrapper gap (outside cells) + Enter exits table
- [ ] Cursor in table wrapper gap (outside cells) + typing is blocked
- [ ] Table rows don't visually expand when cursor is in wrapper gap

## Undo/Redo
- [ ] Ctrl+Z undoes change in both md editor and CM (single undo stack)
- [ ] Ctrl+Shift+Z / Ctrl+Y redoes change in both
- [ ] Cursor restored to correct block element (source-line) after undo
- [ ] Cursor restored to correct offset within block after undo
- [ ] Undo/redo cursor works when editing at different positions in document
- [ ] Typing in CM and undoing in CM doesn't interfere with md editor
- [ ] Multiple rapid edits can be undone one by one

## Scroll Behavior
- [ ] Cursor sync scroll is instant (not smooth animated)
- [ ] Scroll restore on file switch uses exact pixel position (no jump)
- [ ] Scroll restore on reload uses source-line-based positioning
- [ ] No progressive scroll-down on reload with many images (source-line approach)

## Border & Styling
- [ ] Subtle bottom border on #mainNavBar (rgba(255,255,255,0.08))
- [ ] Subtle bottom border on #live-preview-plugin-toolbar (rgba(255,255,255,0.08))
- [ ] No medium-zoom magnifying glass cursor on images
- [ ] Cursor sync icon is subtle (secondary text color, not accent blue)

## Translation (i18n)
- [ ] en.json strings load correctly (toolbar.reader, format.underline, etc.)
- [ ] Locale with region code (e.g. en-GB) falls back to base (en) if specific file missing
- [ ] No "Failed to load locale" console warnings for valid locales
- [ ] gulp translateStrings translates both Phoenix NLS and mdviewer locales
- [ ] Translated locale files copied back to src-mdviewer/src/locales/

## In-Document Search (Ctrl+F)
- [ ] Ctrl+F opens search bar in md viewer (both edit and reader mode)
- [ ] Ctrl+F with text selected pre-fills search and highlights closest match as active
- [ ] Typing in search input highlights matches with debounce (300ms)
- [ ] Match count shows "N/total" format
- [ ] Enter / Arrow Down navigates to next match
- [ ] Shift+Enter / Arrow Up navigates to previous match
- [ ] Navigation wraps around (last → first, first → last)
- [ ] Active match scrolls into view (instant, centered)
- [ ] Escape closes search bar and restores cursor to previous position
- [ ] Escape in search does NOT forward to Phoenix (no focus steal)
- [ ] Closing search clears all mark.js highlights
- [ ] Search works across cached document DOMs (uses #viewer-content)
- [ ] × button closes search
- [ ] Search starts from 1 character
- [ ] Switching documents with search open re-runs search on new document
- [ ] Switching back to previous document restores search match index (e.g. was on 3/5, returns to 3/5)
