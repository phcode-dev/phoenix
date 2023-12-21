const lmdb= require("lmdb");
const path= require("path");
const fs= require("fs");
const NodeConnector = require("./node-connector");

const STORAGE_NODE_CONNECTOR = "ph_storage";
NodeConnector.createNodeConnector(STORAGE_NODE_CONNECTOR, exports);

const LMDB_DIR = path.join(__dirname, "storageDB");
const LMDB_DUMP_FILE = path.join(__dirname, "storageDBDump.json");

console.log("storageDB location is :", LMDB_DIR);

// see LMDB api docs in https://www.npmjs.com/package/lmdb?activeTab=readme
const storageDB = lmdb.open({
    path: LMDB_DIR,
    compression: false
});

/**
 * Takes the current state of the storage database, writes it to a file in JSON format,
 * and then closes the database. This is multi-process safe, ie, if multiple processes tries to write the
 * dump file at the same time, only one process will be allowed at a time while the others wait in a critical session.
 *
 * @returns {Promise<string>} - A promise that resolves to the path of the dumped file.
 */
async function dumpDBToFileAndCloseDB() {
    await storageDB.flushed; // wait for disk write complete
    await storageDB.transaction(() => {
        const storageMap = {};
        for(const key of storageDB.getKeys()){
            storageMap[key] = storageDB.get(key);
        }
        // this is a critical session, so its guarenteed that only one file write operation will be done
        // if there are multiple instances trying to dump the file. Multi process safe.
        fs.writeFileSync(LMDB_DUMP_FILE, JSON.stringify(storageMap));
    });
    await storageDB.close();
    return LMDB_DUMP_FILE;
}

/**
 * Puts an item with the specified key and value into the storage database.
 *
 * @param {string} key - The key of the item.
 * @param {*} value - The value of the item.
 * @returns {Promise} - A promise that resolves when the put is persisted to disc.
 */
function putItem(key, value) {
    return storageDB.put(key, value);
}

/**
 * Retrieve an item from the storage database.
 *
 * @param {string} key - The key of the item to retrieve.
 * @returns {Promise<*>} A promise that resolves with the retrieved item.
 */
async function getItem(key) {
    return storageDB.get(key);
}

exports.dumpDBToFileAndCloseDB = dumpDBToFileAndCloseDB;
exports.putItem = putItem;
exports.getItem = getItem;
