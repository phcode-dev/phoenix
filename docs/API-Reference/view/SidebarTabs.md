### Import :
```js
const SidebarTabs = brackets.getModule("view/SidebarTabs")
```

<a name="module_view/SidebarTabs"></a>

## view/SidebarTabs
SidebarTabs manages multiple tab panes within the sidebar. It inserts a
`#navTabBar` element after `#mainNavBar` and provides an API for registering
tabs, associating DOM content with tabs, and switching between them.

Existing sidebar children that are not explicitly associated with a tab via
`addToTab` are treated as belonging to the default "Files" tab. This means
extensions that add DOM nodes to the sidebar will continue to work without
any code changes.

Tab switching works purely by toggling the `.sidebar-tab-hidden` CSS class
(`display: none !important`). No DOM reparenting or detaching occurs, so
cached jQuery/DOM references held by extensions remain valid.


* [view/SidebarTabs](#module_view/SidebarTabs)
    * [.SIDEBAR_TAB_FILES](#module_view/SidebarTabs..SIDEBAR_TAB_FILES) : <code>string</code>
    * [.AI_TAB_GOOD_WIDTH](#module_view/SidebarTabs..AI_TAB_GOOD_WIDTH) : <code>number</code>
    * [.PREF_AI_WIDTH_SET_INITIAL](#module_view/SidebarTabs..PREF_AI_WIDTH_SET_INITIAL)
    * [.EVENT_TAB_ADDED](#module_view/SidebarTabs..EVENT_TAB_ADDED) : <code>string</code>
    * [.EVENT_TAB_REMOVED](#module_view/SidebarTabs..EVENT_TAB_REMOVED) : <code>string</code>
    * [.EVENT_TAB_CHANGED](#module_view/SidebarTabs..EVENT_TAB_CHANGED) : <code>string</code>
    * [.addTab(id, label, iconClass, [options])](#module_view/SidebarTabs..addTab)
    * [.addToTab(tabId, $content)](#module_view/SidebarTabs..addToTab)
    * [.removeFromTab(tabId, $content)](#module_view/SidebarTabs..removeFromTab)
    * [.removeTab(id)](#module_view/SidebarTabs..removeTab) ⇒ <code>boolean</code>
    * [.setActiveTab(id)](#module_view/SidebarTabs..setActiveTab)
    * [.getActiveTab()](#module_view/SidebarTabs..getActiveTab) ⇒ <code>string</code>
    * [.getAllTabs()](#module_view/SidebarTabs..getAllTabs) ⇒ <code>Array.&lt;{id: string, label: string, iconClass: string, priority: number}&gt;</code>

<a name="module_view/SidebarTabs..SIDEBAR_TAB_FILES"></a>

### view/SidebarTabs.SIDEBAR\_TAB\_FILES : <code>string</code>
The built-in Files tab id.

**Kind**: inner constant of [<code>view/SidebarTabs</code>](#module_view/SidebarTabs)  
<a name="module_view/SidebarTabs..AI_TAB_GOOD_WIDTH"></a>

### view/SidebarTabs.AI\_TAB\_GOOD\_WIDTH : <code>number</code>
Preferred sidebar width (px) when a non-files tab (e.g. AI) is
first activated. Applied once if the current width is narrower.

**Kind**: inner constant of [<code>view/SidebarTabs</code>](#module_view/SidebarTabs)  
<a name="module_view/SidebarTabs..PREF_AI_WIDTH_SET_INITIAL"></a>

### view/SidebarTabs.PREF\_AI\_WIDTH\_SET\_INITIAL
Preference key used to track whether the initial width bump has been applied.

**Kind**: inner constant of [<code>view/SidebarTabs</code>](#module_view/SidebarTabs)  
<a name="module_view/SidebarTabs..EVENT_TAB_ADDED"></a>

### view/SidebarTabs.EVENT\_TAB\_ADDED : <code>string</code>
Fired when a new tab is registered via `addTab`.

**Kind**: inner constant of [<code>view/SidebarTabs</code>](#module_view/SidebarTabs)  
<a name="module_view/SidebarTabs..EVENT_TAB_REMOVED"></a>

### view/SidebarTabs.EVENT\_TAB\_REMOVED : <code>string</code>
Fired when a tab is removed via `removeTab`.

**Kind**: inner constant of [<code>view/SidebarTabs</code>](#module_view/SidebarTabs)  
<a name="module_view/SidebarTabs..EVENT_TAB_CHANGED"></a>

### view/SidebarTabs.EVENT\_TAB\_CHANGED : <code>string</code>
Fired when the active tab changes via `setActiveTab`.

**Kind**: inner constant of [<code>view/SidebarTabs</code>](#module_view/SidebarTabs)  
<a name="module_view/SidebarTabs..addTab"></a>

### view/SidebarTabs.addTab(id, label, iconClass, [options])
Register a new sidebar tab.

**Kind**: inner method of [<code>view/SidebarTabs</code>](#module_view/SidebarTabs)  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| id | <code>string</code> |  | Unique tab identifier |
| label | <code>string</code> |  | Display text shown in the tab bar |
| iconClass | <code>string</code> |  | FontAwesome (or other) icon class string |
| [options] | <code>Object</code> |  |  |
| [options.priority] | <code>number</code> | <code>100</code> | Lower values appear further left |

<a name="module_view/SidebarTabs..addToTab"></a>

### view/SidebarTabs.addToTab(tabId, $content)
Associate a DOM node (or jQuery element) with a tab. If the node is not
already a child of `#sidebar`, it is appended. If the tab is not the
currently active tab, the node is immediately hidden.

**Kind**: inner method of [<code>view/SidebarTabs</code>](#module_view/SidebarTabs)  

| Param | Type | Description |
| --- | --- | --- |
| tabId | <code>string</code> | The tab to associate with |
| $content | <code>jQuery</code> \| <code>Element</code> | DOM node or jQuery wrapper |

<a name="module_view/SidebarTabs..removeFromTab"></a>

### view/SidebarTabs.removeFromTab(tabId, $content)
Remove a DOM node's association with a tab. If the node was appended by
`addToTab` (was not originally in the sidebar) and is no longer
associated with any tab, it is also removed from the DOM.

**Kind**: inner method of [<code>view/SidebarTabs</code>](#module_view/SidebarTabs)  

| Param | Type | Description |
| --- | --- | --- |
| tabId | <code>string</code> | The tab to disassociate from |
| $content | <code>jQuery</code> \| <code>Element</code> | DOM node or jQuery wrapper |

<a name="module_view/SidebarTabs..removeTab"></a>

### view/SidebarTabs.removeTab(id) ⇒ <code>boolean</code>
Remove a tab entirely. Only succeeds if all content has been removed via
`removeFromTab` first. Returns false if content still exists.

**Kind**: inner method of [<code>view/SidebarTabs</code>](#module_view/SidebarTabs)  
**Returns**: <code>boolean</code> - true if removed, false if content still associated  

| Param | Type | Description |
| --- | --- | --- |
| id | <code>string</code> | The tab id to remove |

<a name="module_view/SidebarTabs..setActiveTab"></a>

### view/SidebarTabs.setActiveTab(id)
Switch the active sidebar tab. Shows nodes associated with the target
tab, hides all others.

**Kind**: inner method of [<code>view/SidebarTabs</code>](#module_view/SidebarTabs)  

| Param | Type | Description |
| --- | --- | --- |
| id | <code>string</code> | The tab id to activate |

<a name="module_view/SidebarTabs..getActiveTab"></a>

### view/SidebarTabs.getActiveTab() ⇒ <code>string</code>
Get the currently active tab id.

**Kind**: inner method of [<code>view/SidebarTabs</code>](#module_view/SidebarTabs)  
<a name="module_view/SidebarTabs..getAllTabs"></a>

### view/SidebarTabs.getAllTabs() ⇒ <code>Array.&lt;{id: string, label: string, iconClass: string, priority: number}&gt;</code>
Get an array of all registered tab descriptors.

**Kind**: inner method of [<code>view/SidebarTabs</code>](#module_view/SidebarTabs)  
