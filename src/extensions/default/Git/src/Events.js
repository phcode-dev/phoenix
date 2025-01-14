define(function (require, exports) {

    /**
     * List of Events to be used in the extension.
     * Events should be structured by file who emits them.
     */

    // Brackets events
    exports.BRACKETS_CURRENT_DOCUMENT_CHANGE = "brackets_current_document_change";
    exports.BRACKETS_PROJECT_CHANGE = "brackets_project_change";
    exports.BRACKETS_PROJECT_REFRESH = "brackets_project_refresh";
    exports.BRACKETS_DOCUMENT_SAVED = "brackets_document_saved";
    exports.BRACKETS_FILE_CHANGED = "brackets_file_changed";

    // Git events
    exports.GIT_PROGRESS_EVENT = "git_progress";
    exports.GIT_USERNAME_CHANGED = "git_username_changed";
    exports.GIT_EMAIL_CHANGED = "git_email_changed";
    exports.GIT_COMMITED = "git_commited";
    exports.GIT_NO_BRANCH_EXISTS = "git_no_branch_exists";
    exports.GIT_CHANGE_USERNAME = "git_change_username";
    exports.GIT_CHANGE_EMAIL = "git_change_email";

    // Gerrit events
    exports.GERRIT_TOGGLE_PUSH_REF = "gerrit_toggle_push_ref";
    exports.GERRIT_PUSH_REF_TOGGLED = "gerrit_push_ref_toggled";

    // Startup events
    exports.REFRESH_ALL = "git_refresh_all";
    exports.GIT_ENABLED = "git_enabled";
    exports.GIT_DISABLED = "git_disabled";
    exports.REBASE_MERGE_MODE = "rebase_merge_mode";

    // Panel.js
    exports.HANDLE_GIT_INIT = "handle_git_init";
    exports.HANDLE_GIT_CLONE = "handle_git_clone";
    exports.HANDLE_GIT_COMMIT = "handle_git_commit";
    exports.HANDLE_FETCH = "handle_fetch";
    exports.HANDLE_PUSH = "handle_push";
    exports.HANDLE_PULL = "handle_pull";
    exports.HANDLE_REMOTE_PICK = "handle_remote_pick";
    exports.HANDLE_REMOTE_DELETE = "handle_remote_delete";
    exports.HANDLE_REMOTE_CREATE = "handle_remote_create";
    exports.HANDLE_FTP_PUSH = "handle_ftp_push";
    exports.HISTORY_SHOW_FILE = "history_showFile";
    exports.HISTORY_SHOW_GLOBAL = "history_showGlobal";
    exports.REFRESH_COUNTERS = "refresh_counters";
    exports.REFRESH_HISTORY = "refresh_history";

    // Git results
    exports.GIT_STATUS_RESULTS = "git_status_results";

    // Remotes.js
    exports.GIT_REMOTE_AVAILABLE = "git_remote_available";
    exports.GIT_REMOTE_NOT_AVAILABLE = "git_remote_not_available";
    exports.REMOTES_REFRESH_PICKER = "remotes_refresh_picker";
    exports.FETCH_STARTED = "remotes_fetch_started";
    exports.FETCH_COMPLETE = "remotes_fetch_complete";
});
