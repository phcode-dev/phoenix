const { pipeline } = require('stream/promises');
const { Transform } = require('stream');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2); // Skip the first two elements
const {downloadURL, appdataDir} = JSON.parse(args[0]);
console.log("Download URL is: ", downloadURL);
console.log("AppdataDir is: ", appdataDir);

const EVENT_PROGRESS= "progress:";
const EVENT_INSTALL_PATH= "InstallerPath:";

const fileName = path.basename(new URL(downloadURL).pathname);
const installerFolder = path.join(appdataDir, 'installer');
const savePath = path.join(appdataDir, 'installer', fileName);

async function getFileSize(url) {
    try {
        const response = await fetch(url, { method: 'HEAD' });
        if (!response.ok) {
            return 0;
        }

        // Follow redirects by recursively calling getFileSize with the new location
        if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
            console.log(`Redirecting to ${response.headers.get('location')}`);
            return getFileSize(response.headers.get('location'));
        }

        const contentLength = parseInt(response.headers.get('content-length'));

        if (contentLength) {
            console.log(`File size: ${contentLength} bytes`);
            return contentLength;
        } else {
            console.error('Content-Length header is missing');
            return 0;
        }
    } catch (error) {
        console.error(`An error occurred: ${error.message}`);
        return 0;
    }
}

let previousSentProgress = -1;
async function downloadFile(url, outputPath) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    }

    const totalBytes = response.headers.get('content-length');
    let downloadedBytes = 0;

    // Create a Transform stream to monitor download progress
    const progressStream = new Transform({
        transform(chunk, encoding, callback) {
            downloadedBytes += chunk.length;
            const percent = Math.floor(((downloadedBytes / totalBytes) * 100));
            const totalSize = Math.floor(totalBytes/1024/1024);
            if(previousSentProgress !== percent){
                previousSentProgress = percent;
                console.log(`${EVENT_PROGRESS}${percent}:${totalSize}`);
            }
            callback(null, chunk);
        }
    });

    const destinationStream = fs.createWriteStream(outputPath);

    await pipeline(response.body, progressStream, destinationStream);
    console.log(`File has been downloaded and saved to ${outputPath}`);
}

async function downloadFileIfNeeded() {
    try {

        // Ensure the installer directory exists
        fs.mkdirSync(installerFolder, { recursive: true });

        const fileStats = fs.existsSync(savePath) ? fs.statSync(savePath) : null;
        console.log("Existing file stats:", fileStats);

        const totalBytes = await getFileSize(downloadURL);
        console.log("Existing and new file size:", fileStats && fileStats.size, totalBytes);
        if(fileStats && totalBytes && fileStats.size === totalBytes) {
            console.log('File already downloaded and complete.');
            const totalSize = Math.floor(totalBytes/1024/1024);
            console.log(`${EVENT_PROGRESS}${100}:${totalSize}`);
            return;
        }

        // if we are here, then it is a fresh installer download or there is a partial corrupt download or
        // a new version installer has to be downloaded while the old outdated installer exists.
        // we have to clean the installerFolder.
        await fs.promises.rm(installerFolder, { recursive: true, force: true });
        fs.mkdirSync(installerFolder, { recursive: true });
        console.log('Downloading installer...');
        await downloadFile(downloadURL, savePath);

    } catch (error) {
        console.error('An error occurred:', error);
    }
}

downloadFileIfNeeded()
    .then(()=>{
        console.log(`${EVENT_INSTALL_PATH}${savePath}`); // do not change this name
    })
    .catch(()=>process.exit(1));
