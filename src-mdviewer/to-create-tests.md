# Markdown Viewer/Editor — Integration Tests To Create

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
- [ ] "Delete table" option appears in table right-click context menu
- [ ] "Delete table" option appears in row handle menu
- [ ] "Delete table" option appears in column handle menu
- [ ] Deleting table removes entire table-wrapper from DOM
- [ ] Deleting table places cursor in next sibling element
- [ ] Deleting table at end of document creates new empty paragraph
- [ ] Deleting table syncs removal to CM source
- [ ] Deleting table creates undo entry (Ctrl+Z restores table)
- [ ] Add-column button (+) has visible dashed border matching add-row button style
- [ ] Add-column button visible when table is active (cursor inside)

## UL/OL Toggle (List Type Switching)
- [x] Clicking UL button when in OL switches nearest parent list to `<ul>`
- [x] Clicking OL button when in UL switches nearest parent list to `<ol>`
- [ ] UL/OL toggle only affects nearest parent list (not all ancestor lists)
- [x] UL/OL toggle preserves list content and nesting
- [ ] UL/OL toggle syncs to CM (e.g. `1. item` → `- item`)
- [x] Toolbar UL button shows active state when cursor is in UL
- [x] Toolbar OL button shows active state when cursor is in OL
- [x] Block-level buttons (quote, hr, table, codeblock) hidden when cursor is in list
- [x] Block type selector (Paragraph/H1/H2/H3) hidden when cursor is in list
- [x] List buttons remain visible when cursor is in list (for UL/OL switching)
- [x] Moving cursor out of list restores all toolbar buttons

## Image Handling
- [ ] Images not reloaded when editing text in CM (DOM nodes preserved)
- [ ] GIFs don't blink/restart when editing text elsewhere
- [ ] Image upload placeholder (uploading.svg) is not preserved across updates
- [ ] End key near image goes to end of current block (not end of file) on Win/Linux
- [ ] Home key near image goes to start of current block (not start of file) on Win/Linux
- [ ] Cmd+Right near image goes to end of block on Mac
- [ ] Cmd+Left near image goes to start of block on Mac
- [ ] End/Home work normally on lines without images

## Heading Editing
- [ ] Enter at start of heading (|Heading) inserts empty `<p>` above, heading shifts down
- [ ] Enter in middle of heading splits: text before stays heading, text after becomes `<p>`
- [ ] Enter at end of heading creates new empty `<p>` below (no content split)
- [ ] Enter in middle syncs correctly to CM (heading line + new paragraph line)
- [ ] Shift+Enter in heading creates empty `<p>` below without moving content
- [ ] Shift+Enter moves cursor to new `<p>`, heading text untouched
- [ ] Backspace at start of heading converts heading to `<p>` (strips ### prefix in CM)
- [ ] Backspace at start of heading preserves content and cursor position
- [ ] Backspace at start of heading updates toolbar from "Heading N" to "Paragraph"
- [ ] Heading-to-paragraph conversion syncs correctly to CM source
- [ ] Backspace in middle of heading works normally (deletes character)

## Undo/Redo
- [ ] Cursor restored to correct block element (source-line) after undo
- [ ] Cursor restored to correct offset within block after undo
- [ ] Undo/redo cursor works when editing at different positions in document
- [ ] Typing in CM and undoing in CM doesn't interfere with md editor
- [ ] Multiple rapid edits can be undone one by one

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
