### Import :
```js
const WatchedRoot = brackets.getModule("filesystem/WatchedRoot")
```

<a name="WatchedRoot"></a>

## WatchedRoot
**Kind**: global class  

* [WatchedRoot](#WatchedRoot)
    * [new WatchedRoot(entry, filter, filterGitIgnore)](#new_WatchedRoot_new)
    * _instance_
        * [.entry](#WatchedRoot+entry) : <code>File</code> \| <code>Directory</code>
        * [.filter](#WatchedRoot+filter) : <code>function</code>
        * [.filterGitIgnore](#WatchedRoot+filterGitIgnore) : <code>string</code> \| <code>Array.&lt;string&gt;</code>
        * [.status](#WatchedRoot+status) : <code>number</code>
    * _static_
        * [.INACTIVE](#WatchedRoot.INACTIVE) : <code>number</code>
        * [.STARTING](#WatchedRoot.STARTING) : <code>number</code>
        * [.ACTIVE](#WatchedRoot.ACTIVE) : <code>number</code>

<a name="new_WatchedRoot_new"></a>

### new WatchedRoot(entry, filter, filterGitIgnore)
Represents file or directory structure watched by the FileSystem. If the
entry is a directory, all children (that pass the supplied filter function)
are also watched. A WatchedRoot object begins and ends its life in the
INACTIVE state. While in the process of starting up watchers, the WatchedRoot
is in the STARTING state. When watchers are ready, the WatchedRoot enters
the ACTIVE state.

See the FileSystem class for more details.


| Param | Type |
| --- | --- |
| entry | <code>File</code> \| <code>Directory</code> | 
| filter | <code>function</code> | 
| filterGitIgnore | <code>string</code> \| <code>Array.&lt;string&gt;</code> | 

<a name="WatchedRoot+entry"></a>

### watchedRoot.entry : <code>File</code> \| <code>Directory</code>
**Kind**: instance property of [<code>WatchedRoot</code>](#WatchedRoot)  
<a name="WatchedRoot+filter"></a>

### watchedRoot.filter : <code>function</code>
**Kind**: instance property of [<code>WatchedRoot</code>](#WatchedRoot)  
<a name="WatchedRoot+filterGitIgnore"></a>

### watchedRoot.filterGitIgnore : <code>string</code> \| <code>Array.&lt;string&gt;</code>
**Kind**: instance property of [<code>WatchedRoot</code>](#WatchedRoot)  
<a name="WatchedRoot+status"></a>

### watchedRoot.status : <code>number</code>
**Kind**: instance property of [<code>WatchedRoot</code>](#WatchedRoot)  
<a name="WatchedRoot.INACTIVE"></a>

### WatchedRoot.INACTIVE : <code>number</code>
WatchedRoot inactive

**Kind**: static constant of [<code>WatchedRoot</code>](#WatchedRoot)  
<a name="WatchedRoot.STARTING"></a>

### WatchedRoot.STARTING : <code>number</code>
WatchedRoot starting

**Kind**: static constant of [<code>WatchedRoot</code>](#WatchedRoot)  
<a name="WatchedRoot.ACTIVE"></a>

### WatchedRoot.ACTIVE : <code>number</code>
WatchedRoot active

**Kind**: static constant of [<code>WatchedRoot</code>](#WatchedRoot)  
