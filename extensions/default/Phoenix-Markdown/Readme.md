# Phoenix - Markdown

Brackets extension that adds Markdown support via toolbar and preview

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


### Settings

#### Format
By default, the document is rendered as standard Markdown. Change the dropdown to "GitHub-Flavored (GFM)"
to see the Markdown as it would appear in a GitHub issue, pull request, or comment.

#### Theme
There are three themes available:

* Light - Black text on a light background, similar to GitHub wiki pages.
* Dark - Light text on a dark background.
* Classic - Black text with a serif font on a light background

#### Sync scroll position
When checked, scrolling in the editor scrolls the preview to roughly the same location.
The scroll position of the preview is based on the scroll position of the source document, so the
position may be out of sync if you have really long lines in your source file. Scroll synchronization
works best when the preview and code view are the same height.

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

* [Marked](https://github.com/chjj/marked) - A markdown parser written in JavaScript
* [markdown-css-themes](https://github.com/jasonm23/markdown-css-themes) - The themes are based on the "Swiss" theme
* [markdown-mark](https://github.com/dcurtis/markdown-mark) - The icon used in the toolbar

### Installation

* Select **File > Extension Manager...** (or click the "brick" icon in the toolbar)
* Search for "Phoenix Markdown"
* Click the **Install** button


### How To Use with Preview
When a markdown document (with extension ".md" or ".markdown") is open, a markdown icon is shown in the
toolbar at the top of the Brackets window. Click this icon to open the preview panel. The panel can be
resized vertically.

The preview is updated as you edit the document. You can hover over links to see the href in a tooltip,
or click them to open in your default browser.

