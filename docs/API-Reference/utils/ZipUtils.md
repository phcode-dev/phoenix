### Import :
```js
const ZipUtils = brackets.getModule("utils/ZipUtils")
```

<a name="unzipBinDataToLocation"></a>

## unzipBinDataToLocation(zipData, projectDir, flattenFirstLevel, [progressControlCallback]) ⇒ <code>Promise</code>
Extracts a given binary zip data array to a specified location.

**Kind**: global function  
**Returns**: <code>Promise</code> - - A promise that resolves when extraction is complete.  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| zipData | <code>UInt8Array</code> |  | Binary zip data. |
| projectDir | <code>string</code> |  | Directory to extract to. |
| flattenFirstLevel | <code>boolean</code> | <code>false</code> | If set to true, then if zip contents are nested inside a directory,          the nested directory will be removed in the path structure in the destination. For example,          some zip may contain a `contents` folder inside the zip which has all the files. If we blindly          extract the zip, all the contents will be placed inside a `contents` folder in the root instead           of the root directory itself.           See a sample zip file here: https://api.github.com/repos/StartBootstrap/startbootstrap-grayscales/zipball |
| [progressControlCallback] | <code>function</code> |  | A function that can be used          to view the progress and stop further extraction. The function will be invoked with (doneCount, totalCount).          The function should return `false` if further extraction needs to be stopped. If nothing or `true` is returned,          it will continue extraction. |

<a name="zipFolder"></a>

## zipFolder(fullPath) ⇒ <code>Promise.&lt;JSZip&gt;</code>
Zips a given folder located at path to a jsZip object.

**Kind**: global function  
**Returns**: <code>Promise.&lt;JSZip&gt;</code> - zip object  

| Param | Type | Description |
| --- | --- | --- |
| fullPath | <code>string</code> | to zip |

<a name="unzipURLToLocation"></a>

## unzipURLToLocation(url, projectDir, flattenFirstLevel) ⇒ <code>Promise</code>
**Kind**: global function  

| Param | Default | Description |
| --- | --- | --- |
| url |  | the zip fle URL |
| projectDir |  | To extract to |
| flattenFirstLevel | <code>false</code> | if set to true, then if zip contents are nested inside a directory, the nexted dir will be removed in the path structure in destination. For Eg. some Zip may contain a `contents` folder inside the zip which has all the contents. If we blindly extract the zio, all the contents will be placed inside a `contents` folder in root and not the root dir itself. See a sample zip file here: https://api.github.com/repos/StartBootstrap/startbootstrap-grayscales/zipball |

