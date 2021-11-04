# markdown-toolbar

Brackets extension that adds Markdown editing support via a toolbar.

## Features

### Formatting

* Heading (H1 - H6) toggles
* Numbered and unnumbered lists
* Bold, italic, monospace, strikethrough. Work as toggles, though
  they are a little picky about the selection in order to toggle off.
* Images and links
* Code blocks
* Buttons do sensible things with no selection, single selection,
  or multiple selections.

### Converting to Markdown

* Separate paragraphs: Adds a blank line between paragraphs. This is
  very handy for reformatting text pasted from a non-Markdown source
  such as a word processor. By its nature it can only be applied once,
  so it's important to control the selection.
* Reflow: Reformats a paragraph to add hard line breaks to keep lines
  under a maximum length. Handles lists well, so it's pretty safe to
  apply it to a whole document. It is safe to apply multiple times or
  to repapply to a paragraph that is already partially correct. It does not
  handle tables well, so keep it away from those.

## Planned Features

* Add a button and a GUI to insert a Markdown table
* Make reflow smart about tables

## Preferences

* `markdownbar.showOnStartup`: Display the toolbar when Brackets starts, default false
* `markdownbar.maxLength`: Maximum line length used for reflow, default 80

Example:

```json
{
    ...
    "markdownbar.showOnStartup": true,
    "markdownbar.maxLength": 75
}
```

## Attribution

Icons from [Octicons][https://octicons.github.com/].


