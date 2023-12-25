const lmdb= require("lmdb");
const path= require("path");
const fs= require("fs");
const NodeConnector = require("./node-connector");

const STORAGE_NODE_CONNECTOR = "ph_storage";
NodeConnector.createNodeConnector(STORAGE_NODE_CONNECTOR, exports);

let storageDB,
    dumpFileLocation;
async function openDB(lmdbDir) {
    // see LMDB api docs in https://www.npmjs.com/package/lmdb?activeTab=readme
    lmdbDir = path.join(lmdbDir, "storageDB");
    storageDB = lmdb.open({
        path: lmdbDir,
        compression: false
    });
    console.log("storageDB location is :", lmdbDir);
    dumpFileLocation = path.join(lmdbDir, "storageDBDump.json");
}

function flushDB() {
    if(!storageDB){
        throw new Error("LMDB Storage operation called before openDB call");
    }
    return storageDB.flushed; // wait for disk write complete
}


async function dumpDBToFile() {
    if(!storageDB){
        throw new Error("LMDB Storage operation called before openDB call");
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
    return dumpFileLocation;
}

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
        throw new Error("LMDB Storage operation called before openDB call");
    }
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
        throw new Error("LMDB Storage operation called before openDB call");
    }
    return storageDB.get(key);
}

exports.openDB = openDB;
exports.dumpDBToFile = dumpDBToFile;
exports.dumpDBToFileAndCloseDB = dumpDBToFileAndCloseDB;
exports.putItem = putItem;
exports.getItem = getItem;
exports.flushDB = flushDB;
