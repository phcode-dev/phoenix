const ProcessUtils = require("./processUtils");

/*
var pid = 5064;
ProcessUtils.getChildrenOfPid(pid, function (err, children) {
    console.log(children);
	children.push(pid);
    children.forEach(function (pid) {
        ProcessUtils.killSingleProcess(pid);
    });
});
*/

[
    "git",
    "C:\\Program Files (x86)\\Git\\cmd\\git.exe",
    "C:/Program Files (x86)/Git/cmd/git.exe",
    "C:/Program Files (x86)/Git/cmd/git2.exe",
    "C:/Program Files (x86)/Git/cmd/",
    "C:/Program Files (x86)/Git/cmd",
    "C:\\Program Files (x86)\\Git\\Git Bash.vbs"
].forEach(function (path) {

    ProcessUtils.executableExists(path, function (err, exists, resolvedPath) {
        console.log("ProcessUtils.executableExists for: " + path);
        console.log(" -       exists: " + exists);
        console.log(" - resolvedPath: " + resolvedPath);
    });

});

/*
ProcessUtils.executableExists("git", function (err, result, resolvedPath) {
	console.log("git");
	console.log(result);
});
ProcessUtils.executableExists("C:\\Program Files (x86)\\Git\\cmd\\git.exe", function (err, result) {
	console.log("result for C:\\Program Files (x86)\\Git\\cmd\\git.exe");
	console.log(result);
});
ProcessUtils.executableExists("C:/Program Files (x86)/Git/cmd/git.exe", function (err, result) {
	console.log("result for C:/Program Files (x86)/Git/cmd/git.exe");
	console.log(result);
});

ProcessUtils.executableExists("C:/Program Files (x86)/Git/cmd/git2.exe", function (err, result) {
	console.log("result for C:/Program Files (x86)/Git/cmd/git2.exe");
	console.log(result);
});
ProcessUtils.executableExists("C:/Program Files (x86)/Git/cmd/", function (err, result) {
	console.log("result for C:/Program Files (x86)/Git/cmd/");
	console.log(result);
});
ProcessUtils.executableExists("C:/Program Files (x86)/Git/cmd", function (err, result) {
	console.log("result for C:/Program Files (x86)/Git/cmd");
	console.log(result);
});
*/
