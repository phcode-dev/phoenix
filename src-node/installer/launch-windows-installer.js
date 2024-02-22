const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const args = process.argv.slice(2); // Skip the first two elements
const appdataDir = args[0];
function launchInstaller(zipFilePath, absoluteExtractPath) {
    return new Promise((resolve, reject)=>{
        const extractPath = path.join(appdataDir, 'installer', "extracted");
        const dirContents = fs.readdirSync(extractPath);
        console.log("extracted dir contents: ", dirContents);
        let exePath;
        if(dirContents.length === 1){
            exePath = path.join(extractPath, dirContents[0]);
            if(!exePath.endsWith(".exe")){
                reject("Cannot resolve upgrade installer exe in: ", extractPath);
                return;
            }
        } else {
            reject("Cannot resolve upgrade installer exe in: ", extractPath);
            return;
        }

        exec(`"${exePath}" /P`, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error extracting ZIP file: ${error.message}`);
                reject(error.message);
                return;
            }
            if (stderr) {
                console.error(`Error output: ${stderr}`);
                reject(stderr);
                return;
            }
            console.log(`Updater launched successfully to ${absoluteExtractPath}`);
            resolve();
        });
    });
}

if(!appdataDir) {
    process.exit(1);
}
launchInstaller()
    .then(()=>{
        process.exit(0);
    })
    .catch((err)=>{
        console.error(err);
        process.exit(1);
    });
