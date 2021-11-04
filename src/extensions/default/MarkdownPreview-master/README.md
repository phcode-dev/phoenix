# Markdown Preview

A [Brackets](https://github.com/adobe/brackets) extension that provides a live preview of markdown documents. 

![Alt text](./screenshots/markdown-preview.png?raw=true "Markdown Preview")

### Installation

* Select **File > Extension Manager...** (or click the "brick" icon in the toolbar)
* Search for "Markdown Preview"
* Click the **Install** button

### How To Use
When a markdown document (with extension ".md" or ".markdown") is open, a markdown icon is shown in the 
toolbar at the top of the Brackets window. Click this icon to open the preview panel. The panel can be 
resized vertically.

The preview is updated as you edit the document. You can hover over links to see the href in a tooltip,
or click them to open in your default browser.

Hover over the preview area to show the settings "gear" icon. Click this icon to change the settings.

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

### Credits
This extension uses the following open source components:

* [Marked](https://github.com/chjj/marked) - A markdown parser written in JavaScript
* [markdown-css-themes](https://github.com/jasonm23/markdown-css-themes) - The themes are based on the "Swiss" theme
* [markdown-mark](https://github.com/dcurtis/markdown-mark) - The icon used in the toolbar
