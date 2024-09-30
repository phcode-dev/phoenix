### Import :
```js
brackets.getModule("features/TaskManager")
```

<a name="module_features/TaskManager"></a>

## features/TaskManager
TaskManager module deals with managing long running tasks in phcode. It handles the `Tasks` dropdown in the status
bar where the user can see all running tasks, monitor its progress and close/pause the execution of the task if
supported by the task.


* [features/TaskManager](#module_features/TaskManager)
    * [.renderSpinnerIcon()](#module_features/TaskManager..renderSpinnerIcon)
    * [.addNewTask(taskTitle, message, [iconHTML], [options])](#module_features/TaskManager..addNewTask) ⇒ <code>TaskObject</code>
    * [.TaskObject](#module_features/TaskManager..TaskObject) : <code>Object</code>

<a name="module_features/TaskManager..renderSpinnerIcon"></a>

### features/TaskManager.renderSpinnerIcon()
determines what the spinner icon to show(green-for success), red-fail, blue normal based on the active
tasks in list and renders. IF the active tasks has already  been notified, it wont notify again.

**Kind**: inner method of [<code>features/TaskManager</code>](#module_features/TaskManager)  
<a name="module_features/TaskManager..addNewTask"></a>

### features/TaskManager.addNewTask(taskTitle, message, [iconHTML], [options]) ⇒ <code>TaskObject</code>
The addNewTask is designed for adding new tasks to the task management system. This function is central to
managing long-running tasks, providing a way to visually represent task progress, status, and control actions
directly from the UI in the status bar.

**Kind**: inner method of [<code>features/TaskManager</code>](#module_features/TaskManager)  
**Returns**: <code>TaskObject</code> - Returns a task object with methods for updating the task's state and UI representation,
such as `setProgressPercent`, `setMessage`, `setSucceeded`, `setFailed`, and control visibility methods
like `showStopIcon`, `hideStopIcon`, etc.  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| taskTitle | <code>string</code> |  | The title of the task. This is a mandatory parameter and is displayed in the UI. |
| message | <code>string</code> |  | A message or status associated with the task. Displayed as additional information in the UI. |
| [iconHTML] | <code>string</code> | <code>null</code> | Optional HTML string for the task's icon. Used to visually represent the task in the UI. |
| [options] | <code>Object</code> |  | Optional settings and callbacks for the task. |
| [options.onPauseClick] | <code>function</code> |  | Callback function triggered when the pause button is clicked. |
| [options.onPlayClick] | <code>function</code> |  | Callback function triggered when the play button is clicked. |
| [options.onStopClick] | <code>function</code> |  | Callback function triggered when the stop button is clicked. |
| [options.onRetryClick] | <code>function</code> |  | Callback function triggered when the retry button is clicked. |
| [options.onSelect] | <code>function</code> |  | Callback function triggered when the task is selected from the dropdown. |
| [options.progressPercent] | <code>number</code> |  | Initial progress percentage of the task. |
| [options.noSpinnerNotification] | <code>boolean</code> |  | If set to true, will not show the task spinners for this task.         This can be used for silent background tasks where user attention is not needed. |

**Example**  
```js
// Example: Adding a new task with initial progress and attaching event handlers
const task = TaskManager.addNewTask(
  'Data Processing',
  'Processing data...',
  '<i class="fa fa-spinner fa-spin"></i>',
  {
    onPauseClick: () => console.log('Task paused'),
    onPlayClick: () => console.log('Task resumed'),
    onStopClick: () => console.log('Task stopped'),
    onRetryClick: () => console.log('Task retried'),
    onSelect: () => console.log('Task selected'),
    progressPercent: 20
  }
);

// Updating task progress
task.setProgressPercent(60);

// Updating task message
task.setMessage('60% completed');

// Marking task as succeeded
task.setSucceeded();
```
<a name="module_features/TaskManager..TaskObject"></a>

### features/TaskManager.TaskObject : <code>Object</code>
Methods for managing the task's state and UI representation in the TaskManager.

**Kind**: inner typedef of [<code>features/TaskManager</code>](#module_features/TaskManager)  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| show | <code>function</code> | Shows the task popup in the ui. |
| close | <code>function</code> | Closes the task and removes it from the UI. |
| setTitle | <code>function</code> | Sets the task's title. |
| getTitle | <code>function</code> | Returns the task's title. |
| setMessage | <code>function</code> | Sets the task's message. |
| getMessage | <code>function</code> | Returns the task's message. |
| setProgressPercent | <code>function</code> | Sets the task's progress percentage. |
| getProgressPercent | <code>function</code> | Returns the task's current progress percentage. |
| setFailed | <code>function</code> | Marks the task as failed. |
| isFailed | <code>function</code> | Returns true if the task is marked as failed. |
| setSucceded | <code>function</code> | Marks the task as succeeded. |
| isSucceded | <code>function</code> | Returns true if the task is marked as succeeded. |
| showStopIcon | <code>function</code> | Shows the stop icon with an optional tooltip message. |
| hideStopIcon | <code>function</code> | Hides the stop icon. |
| showPlayIcon | <code>function</code> | Shows the play icon with an optional tooltip message. |
| hidePlayIcon | <code>function</code> | Hides the play icon. |
| showPauseIcon | <code>function</code> | Shows the pause icon with an optional tooltip message. |
| hidePauseIcon | <code>function</code> | Hides the pause icon. |
| showRestartIcon | <code>function</code> | Shows the restart (retry) icon with an optional tooltip message. |
| hideRestartIcon | <code>function</code> | Hides the restart (retry) icon. |
| flashSpinnerForAttention | <code>function</code> | briefly flashes the task spinner icon for attention. |

