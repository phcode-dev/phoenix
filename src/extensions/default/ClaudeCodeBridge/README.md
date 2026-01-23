# ClaudeCodeBridge Extension

A Phoenix Code Editor extension that bridges the Live Preview with Claude AI for intelligent, context-aware code editing.

## Overview

ClaudeCodeBridge enables users to select elements in the live preview and make AI-powered edits using natural language prompts. The extension communicates with the phoenix-ai-server to process requests through Claude's API.

## Features

### Real-time Streaming Progress
- Shows Claude's activity in real-time during edit requests
- Displays tool usage: "Reading file...", "Editing file...", etc.
- Streams Claude's explanatory text as it's generated
- Progress updates appear directly in the Live Preview UI

### Session Management
- Maintains conversation context for follow-up edits
- "New Chat" button to start fresh conversations
- Automatic session cleanup when dialog closes

### Smart Element Tracking
- Tracks selected elements across edits using tagId
- Automatically updates element references after edits
- Uses HTMLInstrumentation to get new tagIds after document changes

### Edit Application
- Applies Claude's edits through Phoenix's document APIs
- Preserves undo/redo functionality
- Auto-saves modified files for Claude to see changes on follow-up

## Architecture

```
Live Preview (RemoteFunctions.js)
        ↓ MessageBroker
LivePreviewEdit.js
        ↓ brackets.ClaudeCodeBridge
ClaudeCodeBridge/main.js
        ↓ WebSocket
phoenix-ai-server
        ↓ Claude SDK
    Claude AI
```

## Files

### main.js
Main extension entry point handling:
- WebSocket connection to phoenix-ai-server
- Request/response routing
- Progress and text stream event broadcasting
- Edit result application with tagId refresh

### EditApplicator.js
Handles applying edits to source files:
- Finds text positions in documents
- Sorts edits bottom-to-top to preserve positions
- Uses batchOperation for grouped undo
- Auto-saves modified files

### PathMapper.js
Maps Phoenix virtual paths to real filesystem paths:
- Handles `/mnt/ProjectName/` format
- Handles `/fs/local/ProjectName/` format
- Handles `/tauri/` format for desktop app

### WebSocketConnection.js
WebSocket client with:
- Auto-reconnection
- Message queuing during disconnection
- Connection state management

## Message Flow

### Outgoing Events (to Live Preview)

| Event | Description |
|-------|-------------|
| `claudeCodeBridge.progress` | Progress update with message and phase |
| `claudeCodeBridge.textStream` | Streamed text from Claude |
| `claudeCodeBridge.complete` | Edit completed with optional new tagId |
| `claudeCodeBridge.error` | Error occurred |

### Progress Event Example
```javascript
$(brackets).trigger("claudeCodeBridge.progress", {
    requestId: "phoenix-ai-123",
    message: "Editing file...",
    phase: "tool_use"
});
```

### Complete Event with TagId Refresh
```javascript
$(brackets).trigger("claudeCodeBridge.complete", {
    requestId: "phoenix-ai-123",
    editCount: 1,
    newTagId: 142  // Updated tagId for the edited element
});
```

## Integration Points

### LivePreviewEdit.js
Forwards ClaudeCodeBridge events to the live preview:
```javascript
$(brackets).on("claudeCodeBridge.progress", function(event, data) {
    LiveDevProtocol.evaluate(
        `window._Phoenix_AI_updateProgress('${data.message}')`
    );
});
```

### RemoteFunctions.js (Live Preview)
Global handlers receive events from Phoenix:
- `window._Phoenix_AI_updateProgress(message)` - Update progress text
- `window._Phoenix_AI_appendStreamText(text)` - Append streamed text
- `window._Phoenix_AI_showSuccess(message, newTagId)` - Show success, update tagId
- `window._Phoenix_AI_showError(message)` - Show error

## TagId Staleness Fix

After an edit is applied, the document changes and HTMLInstrumentation assigns new tagIds. The extension handles this by:

1. After edit success, queries `HTMLInstrumentation._getTagIDAtDocumentPos()` for the new tagId
2. Sends the new tagId in the complete event
3. Live preview updates AIPromptBox's element and tagId references
4. Subsequent edits use the correct, updated tagId

## Configuration

### Server URL
```javascript
const CLAUDECODEUI_WS_URL = "ws://localhost:3002/ws";
```

### Model Mapping
```javascript
const modelMap = {
    'fast': 'haiku',
    'moderate': 'sonnet',
    'slow': 'opus'
};
```

## Usage

1. Start phoenix-ai-server: `node phoenix-ai-server/index.js`
2. Open Phoenix Code Editor
3. Open a project with HTML files
4. Start Live Preview
5. Click an element in the preview
6. Click the AI button (sparkle icon)
7. Type your edit request
8. Watch real-time progress as Claude works
9. Edit is applied automatically

## Dependencies

- Phoenix Core modules:
  - `utils/AppInit`
  - `document/DocumentManager`
  - `editor/EditorManager`
  - `widgets/Dialogs`
  - `project/ProjectManager`
  - `LiveDevelopment/MultiBrowserImpl/language/HTMLInstrumentation`

## License

GNU AGPL-3.0
