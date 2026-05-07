### Import :
```js
const VideoPlayer = brackets.getModule("view/VideoPlayer")
```

<a name="Strings"></a>

## Strings
Tiny shared HTML5 `<video>` widget. Two entry points:

  createPlayer(options) — returns a configured `<video>` wrapper the
      caller can drop anywhere in their UI.

  renderFullScreenPlayer(srcElement, options) — opens a viewport-
      covering overlay with a large auto-playing player that
      expands out of `srcElement` (genie-style) and contracts back
      on close. Useful when an inline thumbnail should expand into
      a focused fullscreen view on click.

**Kind**: global constant  
<a name="createPlayer"></a>

## createPlayer(options) ⇒ <code>jQuery</code>
Build a `<video>` element wrapped in a div with sensible Phoenix
defaults. Returns the wrapper as a jQuery object; the caller appends
and disposes it.

**Kind**: global function  
**Returns**: <code>jQuery</code> - `<div class="phx-video-player ..."><video.../></div>`  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| options | <code>Object</code> |  |  |
| options.src | <code>string</code> |  | Video URL (required). |
| [options.poster] | <code>string</code> |  | Optional poster image URL. |
| [options.controls] | <code>boolean</code> | <code>true</code> | Show native player controls. |
| [options.muted] | <code>boolean</code> | <code>true</code> | Start muted. |
| [options.autoplay] | <code>boolean</code> | <code>false</code> | Autoplay on insert (browsers                                            only honour this when also muted). |
| [options.loop] | <code>boolean</code> | <code>false</code> |  |
| [options.preload] | <code>string</code> | <code>&quot;\&quot;metadata\&quot;&quot;</code> | One of "none", "metadata",                                                "auto". Use "auto" when you                                                want the bytes to fetch in                                                the background after the                                                poster paints. |
| [options.className] | <code>string</code> |  | Extra class on the wrapper. |

<a name="renderFullScreenPlayer"></a>

## renderFullScreenPlayer(srcElement, options) ⇒ <code>Object</code>
Open a viewport-covering overlay with a large autoplaying video that
expands out of `srcElement` (Mac-dock-genie style) and contracts
back to it on close. Click on the dimmed backdrop, the close (×)
button, or pressing Escape closes the overlay.

Defaults: muted, autoplay, controls, preload="auto" (so the bytes
stream while the open animation runs and the user can hit play
straight away). Override via `options`.

**Kind**: global function  
**Returns**: <code>Object</code> - Handle exposing a programmatic close.  

| Param | Type | Description |
| --- | --- | --- |
| srcElement | <code>HTMLElement</code> \| <code>jQuery</code> | Element the lightbox should      expand from / contract back to. Used only for the source rect;      not modified. |
| options | <code>Object</code> | See createPlayer's options;      additionally honours all the same player flags. `src` required. |

