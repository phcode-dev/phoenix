const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const args = process.argv.slice(2); // Skip the first two elements
const appdataDir = args[0];

if(!appdataDir) {
    process.exit(1);
}
const extractPath = path.join(appdataDir, 'installer', "extracted");
const dirContents = fs.readdirSync(extractPath);
console.log("extracted dir contents: ", dirContents);
let exePath;
if(dirContents.length === 1){
    exePath = path.join(extractPath, dirContents[0]);
    if(!exePath.endsWith(".exe")){
        console.error("Cannot resolve upgrade installer exe in: ", extractPath);
        process.exit(1);
    }
} else {
    console.error("Cannot resolve upgrade installer exe in: ", extractPath);
    process.exit(1);
}
const child = spawn(`${exePath}`, ['/P'], {
    detached: true, // This allows the child process to run independently of its parent.
    stdio: 'ignore' // This is often used in conjunction with detached to avoid keeping the parent's stdio open.
});
child.unref();
process.exit(0);
