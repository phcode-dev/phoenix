const NodeConnector = require("./node-connector");
let openModule;

const UTILS_NODE_CONNECTOR = "ph_utils";
NodeConnector.createNodeConnector(UTILS_NODE_CONNECTOR, exports);

async function getURLContent({url, options}) {
    options = options || {
        redirect: "follow",
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36",
            "Cache-Control": "no-cache"
        }
    };
    const fetchResponse = await fetch(url, options);
    const bufferContents = await fetchResponse.arrayBuffer();
    return {
        buffer: bufferContents
    };
}

async function setLocaleStrings(localStrings) {
    exports.Strings = localStrings;
}

async function openURLInDefaultBrowser(url) {
    if(!openModule){
        openModule = await import('open');
    }
    if(url.startsWith("http://") || url.startsWith("https://")){
        await openModule.default(url);
    }
    throw new Error("Only HTTP/S protocol is supported", url);
}

exports.getURLContent = getURLContent;
exports.setLocaleStrings = setLocaleStrings;
exports.openURLInDefaultBrowser = openURLInDefaultBrowser;
