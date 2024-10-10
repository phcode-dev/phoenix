### Import :
```js
const StringUtils = brackets.getModule("utils/StringUtils")
```

<a name="module_utils/StringUtils"></a>

## utils/StringUtils
Utilities functions related to string manipulation


* [utils/StringUtils](#module_utils/StringUtils)
    * [.format(str, Arguments)](#module_utils/StringUtils..format) ⇒ <code>string</code>
    * [.getLines(text)](#module_utils/StringUtils..getLines) ⇒ <code>Array.&lt;string&gt;</code>
    * [.offsetToLineNum(textOrLines, offset)](#module_utils/StringUtils..offsetToLineNum) ⇒ <code>number</code>
    * [.startsWith(str, prefix)](#module_utils/StringUtils..startsWith) ⇒ <code>Boolean</code>
    * [.endsWith(str, suffix)](#module_utils/StringUtils..endsWith)
    * [.breakableUrl(url)](#module_utils/StringUtils..breakableUrl) ⇒ <code>string</code>
    * [.prettyPrintBytes(bytes, precision)](#module_utils/StringUtils..prettyPrintBytes) ⇒ <code>string</code>
    * [.truncate(str, len)](#module_utils/StringUtils..truncate) ⇒ <code>string</code>
    * [.hashCode(str)](#module_utils/StringUtils..hashCode) ⇒ <code>number</code>
    * [.randomString(stringLength, [prefix])](#module_utils/StringUtils..randomString) ⇒ <code>string</code>

<a name="module_utils/StringUtils..format"></a>

### utils/StringUtils.format(str, Arguments) ⇒ <code>string</code>
Format a string by replacing placeholder symbols with passed in arguments.

**Kind**: inner method of [<code>utils/StringUtils</code>](#module_utils/StringUtils)  
**Returns**: <code>string</code> - Formatted string  

| Param | Type | Description |
| --- | --- | --- |
| str | <code>string</code> | The base string |
| Arguments | <code>rest</code> | to be substituted into the string |

<a name="module_utils/StringUtils..getLines"></a>

### utils/StringUtils.getLines(text) ⇒ <code>Array.&lt;string&gt;</code>
Splits the text by new line characters and returns an array of lines

**Kind**: inner method of [<code>utils/StringUtils</code>](#module_utils/StringUtils)  
**Returns**: <code>Array.&lt;string&gt;</code> - lines  

| Param | Type |
| --- | --- |
| text | <code>string</code> | 

<a name="module_utils/StringUtils..offsetToLineNum"></a>

### utils/StringUtils.offsetToLineNum(textOrLines, offset) ⇒ <code>number</code>
Returns a line number corresponding to an offset in some text. The text can

**Kind**: inner method of [<code>utils/StringUtils</code>](#module_utils/StringUtils)  
**Returns**: <code>number</code> - line number  

| Param | Type | Description |
| --- | --- | --- |
| textOrLines | <code>string</code> \| <code>Array.&lt;string&gt;</code> | string or array of lines from which      to compute the line number from the offset |
| offset | <code>number</code> |  |

<a name="module_utils/StringUtils..startsWith"></a>

### utils/StringUtils.startsWith(str, prefix) ⇒ <code>Boolean</code>
Returns true if the given string starts with the given prefix.

**Kind**: inner method of [<code>utils/StringUtils</code>](#module_utils/StringUtils)  

| Param | Type |
| --- | --- |
| str | <code>String</code> | 
| prefix | <code>String</code> | 

<a name="module_utils/StringUtils..endsWith"></a>

### utils/StringUtils.endsWith(str, suffix)
Returns true if the given string ends with the given suffix.

**Kind**: inner method of [<code>utils/StringUtils</code>](#module_utils/StringUtils)  

| Param | Type |
| --- | --- |
| str | <code>string</code> | 
| suffix | <code>string</code> | 

<a name="module_utils/StringUtils..breakableUrl"></a>

### utils/StringUtils.breakableUrl(url) ⇒ <code>string</code>
Return an escaped path or URL string that can be broken near path separators.

**Kind**: inner method of [<code>utils/StringUtils</code>](#module_utils/StringUtils)  
**Returns**: <code>string</code> - the formatted path or URL  

| Param | Type | Description |
| --- | --- | --- |
| url | <code>string</code> | the path or URL to format |

<a name="module_utils/StringUtils..prettyPrintBytes"></a>

### utils/StringUtils.prettyPrintBytes(bytes, precision) ⇒ <code>string</code>
Converts number of bytes into human readable format.

**Kind**: inner method of [<code>utils/StringUtils</code>](#module_utils/StringUtils)  

| Param | Type | Description |
| --- | --- | --- |
| bytes | <code>number</code> | Number of bytes to convert |
| precision | <code>number</code> | Number of digits after the decimal separator |

<a name="module_utils/StringUtils..truncate"></a>

### utils/StringUtils.truncate(str, len) ⇒ <code>string</code>
Truncate text to specified length.

**Kind**: inner method of [<code>utils/StringUtils</code>](#module_utils/StringUtils)  
**Returns**: <code>string</code> - Returns truncated text only if it was changed  

| Param | Type | Description |
| --- | --- | --- |
| str | <code>string</code> | Text to be truncated. |
| len | <code>number</code> | Length to which text should be truncated |

<a name="module_utils/StringUtils..hashCode"></a>

### utils/StringUtils.hashCode(str) ⇒ <code>number</code>
Computes a 32bit hash from the given string

**Kind**: inner method of [<code>utils/StringUtils</code>](#module_utils/StringUtils)  
**Returns**: <code>number</code> - The 32-bit hash  
**Cc**: wiki attribution: esmiralha  

| Param | Type | Description |
| --- | --- | --- |
| str | <code>string</code> | The string for which hash is to be computed |

<a name="module_utils/StringUtils..randomString"></a>

### utils/StringUtils.randomString(stringLength, [prefix]) ⇒ <code>string</code>
Generates a random nonce string of the specified length.

**Kind**: inner method of [<code>utils/StringUtils</code>](#module_utils/StringUtils)  
**Returns**: <code>string</code> - - The randomly generated nonce.  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| stringLength | <code>number</code> | <code>10</code> | The length of the nonce in bytes. default 10. |
| [prefix] | <code>string</code> |  | optional prefix |
