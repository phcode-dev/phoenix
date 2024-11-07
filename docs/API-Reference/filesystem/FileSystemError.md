### Import :
```js
const FileSystemError = brackets.getModule("filesystem/FileSystemError")
```

<a name="module_FileSystemError"></a>

## FileSystemError
FileSystemError describes the errors that can occur when using the FileSystem, File,
and Directory modules.

Error values are strings. Any "falsy" value: null, undefined or "" means "no error".

Enumerated File System Errors

```js
        UNKNOWN: "Unknown",
        INVALID_PARAMS: "InvalidParams",
        NOT_FOUND: "NotFound",
        NOT_READABLE: "NotReadable",
        UNSUPPORTED_ENCODING: "UnsupportedEncoding",
        NOT_SUPPORTED: "NotSupported",
        NOT_WRITABLE: "NotWritable",
        OUT_OF_SPACE: "OutOfSpace",
        TOO_MANY_ENTRIES: "TooManyEntries",
        ALREADY_EXISTS: "AlreadyExists",
        CONTENTS_MODIFIED: "ContentsModified",
        ROOT_NOT_WATCHED: "RootNotBeingWatched",
        EXCEEDS_MAX_FILE_SIZE: "ExceedsMaxFileSize",
        NETWORK_DRIVE_NOT_SUPPORTED: "NetworkDriveNotSupported",
        ENCODE_FILE_FAILED: "EncodeFileFailed",
        DECODE_FILE_FAILED: "DecodeFileFailed",
        UNSUPPORTED_UTF16_ENCODING: "UnsupportedUTF16Encoding"
 ```

