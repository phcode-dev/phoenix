const lmdb= require("lmdb");
const path= require("path");
const fs= require("fs");
const { execFileSync } = require("child_process");
const NodeConnector = require("./node-connector");

const STORAGE_NODE_CONNECTOR = "ph_storage";
const EXTERNAL_CHANGE_POLL_INTERVAL = 800;
const DB_DUMP_INTERVAL = 30000;
const EVENT_CHANGED = "change";
const nodeConnector = NodeConnector.createNodeConnector(STORAGE_NODE_CONNECTOR, exports);
const watchExternalKeys = {};
let changesToDumpAvailable = false;

let storageDB,
    dumpFileLocation;
/**
 * Validates LMDB database integrity by attempting to open it in a child process.
 * If the DB is corrupted, lmdb.open() can SIGSEGV the process (a native crash that
 * try/catch cannot intercept). By running the check in a subprocess, we detect the
 * crash without taking down the main phnode process.
 *
 * @param {string} lmdbDir - Path to the storageDB directory
 * @returns {boolean} true if DB is valid or doesn't exist, false if corrupted
 */
function _validateDBIntegrity(lmdbDir) {
    const dataFile = path.join(lmdbDir, "data.mdb");
    if (!fs.existsSync(dataFile)) {
        return true; // No DB yet, fresh start
    }
    try {
        // Run a child process that opens the DB and reads a key.
        // If the DB is corrupt, lmdb.open() can SIGSEGV the process — a native crash that
        // try/catch cannot intercept. By running in a subprocess, we detect the crash safely.
        const script = `
            const lmdb = require("lmdb");
            const db = lmdb.open({ path: ${JSON.stringify(lmdbDir)}, compression: false, readOnly: true });
            db.getKeys({ limit: 1 }).next();
            db.close();
        `;
        execFileSync(process.execPath, ["-e", script], {
            timeout: 10000,
            stdio: "pipe",
            cwd: __dirname
        });
        return true;
    } catch (err) {
        console.error("storageDB: Database integrity check failed:", err.status, err.signal);
        return false;
    }
}

function _deleteCorruptDBFiles(lmdbDir) {
    const dataFile = path.join(lmdbDir, "data.mdb");
    const lockFile = path.join(lmdbDir, "lock.mdb");
    try {
        if (fs.existsSync(dataFile)) {
            fs.unlinkSync(dataFile);
            console.log("storageDB: Deleted corrupted data.mdb");
        }
        if (fs.existsSync(lockFile)) {
            fs.unlinkSync(lockFile);
            console.log("storageDB: Deleted stale lock.mdb");
        }
    } catch (deleteErr) {
        console.error("storageDB: Failed to delete corrupted DB files:", deleteErr);
    }
}

async function _restoreFromDump(lmdbDir) {
    const dumpFile = path.join(lmdbDir, "storageDBDump.json");
    if (!fs.existsSync(dumpFile)) {
        console.warn("storageDB: No dump file found to restore from. Starting with empty database.");
        return;
    }
    try {
        const dumpData = JSON.parse(fs.readFileSync(dumpFile, "utf8"));
        const keys = Object.keys(dumpData);
        for (const key of keys) {
            await storageDB.put(key, dumpData[key]);
        }
        await storageDB.flushed;
        console.log(`storageDB: Restored ${keys.length} keys from dump file.`);
    } catch (restoreErr) {
        console.error("storageDB: Failed to restore from dump file:", restoreErr);
    }
}

async function openDB(lmdbDir) {
    // see LMDB api docs in https://www.npmjs.com/package/lmdb?activeTab=readme
    lmdbDir = path.join(lmdbDir, "storageDB");
    dumpFileLocation = path.join(lmdbDir, "storageDBDump.json");

    const needsRecovery = !_validateDBIntegrity(lmdbDir);
    if (needsRecovery) {
        console.error("storageDB: Corrupt database detected, deleting and recreating from dump.");
        _deleteCorruptDBFiles(lmdbDir);
    }

    storageDB = lmdb.open({
        path: lmdbDir,
        compression: false
    });

    if (needsRecovery) {
        await _restoreFromDump(lmdbDir);
    }

    console.log("storageDB location is :", lmdbDir);
}

async function flushDB() {
    if(!storageDB){
        throw new Error("LMDB flushDB operation called before openDB call");
    }
    await storageDB.flushed; // wait for disk write complete
}


async function dumpDBToFile() {
    if(!storageDB){
        throw new Error("LMDB dumpDBToFile operation called before openDB call");
    }
    await storageDB.flushed; // wait for disk write complete
    await storageDB.transaction(() => {
        const storageMap = {};
        for(const key of storageDB.getKeys()){
            storageMap[key] = storageDB.get(key);
        }
        // this is a critical session, so its guarenteed that only one file write operation will be done
        // if there are multiple instances trying to dump the file. Multi process safe.
        fs.writeFileSync(dumpFileLocation, JSON.stringify(storageMap));
    });
    // changesToDumpAvailable is eventually consistent. Will write a good copy at app quit eventually.
    changesToDumpAvailable = false;
    return dumpFileLocation;
}

let dumpInProgress = false;
setInterval(()=>{
    // this is so that the user won't loose large time of work in case of app crash
    // This should not be called periodically as it's expensive.
    if(changesToDumpAvailable && !dumpInProgress){
        changesToDumpAvailable = false;
        dumpInProgress = true;
        dumpDBToFile()
            .finally(()=>{
                dumpInProgress = false;
            });
    }
}, DB_DUMP_INTERVAL);

/**
 * Takes the current state of the storage database, writes it to a file in JSON format,
 * and then closes the database. This is multi-process safe, ie, if multiple processes tries to write the
 * dump file at the same time, only one process will be allowed at a time while the others wait in a critical session.
 *
 * @returns {Promise<string>} - A promise that resolves to the path of the dumped file.
 */
async function dumpDBToFileAndCloseDB() {
    await dumpDBToFile();
    await storageDB.close();
    return dumpFileLocation;
}

/**
 * Puts an item with the specified key and value into the storage database.
 *
 * @param {string} key - The key of the item.
 * @param {*} value - The value of the item.
 * @returns {Promise} - A promise that resolves when the put is persisted to disc.
 */
function putItem({key, value}) {
    if(!storageDB){
        throw new Error(`LMDB putItem operation called before openDB call: key- ${key}, value: ${JSON.stringify(value)}`);
    }
    if(watchExternalKeys[key] && typeof value === 'object' && value.t) {
        watchExternalKeys[key] = value.t;
    }
    changesToDumpAvailable = true;
    return storageDB.put(key, value);
}

/**
 * Retrieve an item from the storage database.
 *
 * @param {string} key - The key of the item to retrieve.
 * @returns {Promise<*>} A promise that resolves with the retrieved item.
 */
async function getItem(key) {
    if(!storageDB){
        throw new Error(`LMDB getItem operation called before openDB call: key- ${key}`);
    }
    return storageDB.get(key);
}

async function watchExternalChanges({key, t}) {
    if(!storageDB){
        throw new Error(`LMDB watchExternalChanges operation called before openDB call: key- ${key}`);
    }
    watchExternalKeys[key] = t;
}

async function unwatchExternalChanges(key) {
    if(!storageDB){
        throw new Error(`LMDB unwatchExternalChanges operation called before openDB call: key- ${key}`);
    }
    delete watchExternalKeys[key];
}

function updateExternalChangesFromLMDB() {
    const watchedKeys = Object.keys(watchExternalKeys);
    if(!watchedKeys.length) {
        return;
    }
    const changedKV = {};
    let changesPresent = false;
    for(let key of watchedKeys) {
        const t = watchExternalKeys[key];
        const newVal = storageDB.get(key);
        if(newVal && (newVal.t > t)){
            // this is newer
            watchExternalKeys[key]= newVal.t;
            changedKV[key] = newVal;
            changesPresent = true;
        }
    }
    if(changesPresent) {
        nodeConnector.triggerPeer(EVENT_CHANGED, changedKV);
    }
}

setInterval(updateExternalChangesFromLMDB, EXTERNAL_CHANGE_POLL_INTERVAL);

exports.openDB = openDB;
exports.dumpDBToFile = dumpDBToFile;
exports.dumpDBToFileAndCloseDB = dumpDBToFileAndCloseDB;
exports.putItem = putItem;
exports.getItem = getItem;
exports.flushDB = flushDB;
exports.watchExternalChanges = watchExternalChanges;
exports.unwatchExternalChanges = unwatchExternalChanges;

