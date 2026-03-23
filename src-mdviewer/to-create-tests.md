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
