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

## Image Handling
- [ ] Images not reloaded when editing text in CM (DOM nodes preserved)
- [ ] GIFs don't blink/restart when editing text elsewhere
- [ ] Image upload placeholder (uploading.svg) is not preserved across updates
- [ ] End key near image goes to end of current block (not end of file) on Win/Linux
- [ ] Home key near image goes to start of current block (not start of file) on Win/Linux
- [ ] Cmd+Right near image goes to end of block on Mac
- [ ] Cmd+Left near image goes to start of block on Mac
- [ ] End/Home work normally on lines without images

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
