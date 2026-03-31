# Markdown Viewer/Editor — Integration Tests To Create

## Table Editing
- [ ] Clearing a table cell with backspace produces valid markdown (no broken pipe rows)
- [ ] Empty table cell renders as `|  |` in markdown source
- [ ] Table cell with `<br>` only-child is treated as empty (br stripped before conversion)
- [ ] Table cell with actual content + `<br>` preserves the line break
- [x] Tab navigation between table cells works
- [x] Adding new row via Tab at last cell works
- [ ] Delete row / delete column via context menu works and syncs to CM
- [x] Table headers are editable in edit mode
- [x] Enter key blocked in table cells (no paragraph/line break insertion)
- [x] Shift+Enter blocked in table cells
- [x] Block-level format buttons hidden when cursor is in table (quote, hr, table, codeblock, lists)
- [x] Block type selector (Paragraph/H1/H2/H3) hidden when cursor is in table
- [x] Dropdown groups for lists and blocks hidden when cursor is in table
- [ ] Pasting multi-line text in table cell converts to single line (newlines → spaces)
- [x] Moving cursor out of table restores all toolbar buttons
- [x] ArrowRight at end of last cell exits table to paragraph below
- [x] ArrowDown from last cell exits table to paragraph below
- [x] Enter in last cell exits table to paragraph below
- [x] If no paragraph exists below table, one is created on exit
- [x] If paragraph exists below table, cursor moves into it (no duplicate)
- [ ] Cursor in table wrapper gap (outside cells) + Enter exits table
- [ ] Cursor in table wrapper gap (outside cells) + typing is blocked
- [ ] Table rows don't visually expand when cursor is in wrapper gap
- [x] "Delete table" option appears in table right-click context menu
- [ ] "Delete table" option appears in row handle menu
- [ ] "Delete table" option appears in column handle menu
- [x] Deleting table removes entire table-wrapper from DOM
- [x] Deleting table places cursor outside table after deletion
- [x] Deleting table at end of document creates new empty paragraph
- [ ] Deleting table syncs removal to CM source
- [ ] Deleting table creates undo entry (Ctrl+Z restores table)
- [ ] Add-column button (+) has visible dashed border matching add-row button style
- [x] Add-column button visible when table is active (cursor inside)

## Image Handling
- [ ] Images not reloaded when editing text in CM (DOM nodes preserved)
- [ ] GIFs don't blink/restart when editing text elsewhere
- [ ] Image upload placeholder (uploading.svg) is not preserved across updates
- [ ] End key near image goes to end of current block (not end of file) on Win/Linux
- [ ] Home key near image goes to start of current block (not start of file) on Win/Linux
- [ ] Cmd+Right near image goes to end of block on Mac
- [ ] Cmd+Left near image goes to start of block on Mac
- [ ] End/Home work normally on lines without images
