// Generate random AES-256 key and GCM nonce/IV
function generateRandomKeyAndIV() {
    // Generate 32 random bytes for AES-256 key
    const keyBytes = new Uint8Array(32);
    crypto.getRandomValues(keyBytes);

    // Generate 12 random bytes for AES-GCM nonce/IV
    const ivBytes = new Uint8Array(12);
    crypto.getRandomValues(ivBytes);

    // Convert to hex strings
    const key = Array.from(keyBytes)
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');

    const iv = Array.from(ivBytes)
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');

    return { key, iv };
}

async function AESDecryptString(val, key, iv) {
    // Convert hex strings to ArrayBuffers
    const encryptedData = new Uint8Array(val.length / 2);
    for (let i = 0; i < val.length; i += 2) {
        encryptedData[i / 2] = parseInt(val.substr(i, 2), 16);
    }

    const keyBytes = new Uint8Array(key.length / 2);
    for (let i = 0; i < key.length; i += 2) {
        keyBytes[i / 2] = parseInt(key.substr(i, 2), 16);
    }

    const ivBytes = new Uint8Array(iv.length / 2);
    for (let i = 0; i < iv.length; i += 2) {
        ivBytes[i / 2] = parseInt(iv.substr(i, 2), 16);
    }

    // Import the AES key
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyBytes,
        { name: 'AES-GCM' },
        false,
        ['decrypt']
    );

    // Decrypt the data
    const decryptedBuffer = await crypto.subtle.decrypt(
        {
            name: 'AES-GCM',
            iv: ivBytes
        },
        cryptoKey,
        encryptedData
    );

    // Convert back to string
    return new TextDecoder('utf-8').decode(decryptedBuffer);
}

const TEMP_KV_TRUST_FOR_TESTSUITE = "TEMP_KV_TRUST_FOR_TESTSUITE";
function _selectKeys() {
    if (Phoenix.isTestWindow) {
        // this could be an iframe in a spec runner window or the spec runner window itself.
        const kvj = window.top.sessionStorage.getItem(TEMP_KV_TRUST_FOR_TESTSUITE);
        if(!kvj) {
            const kv = generateRandomKeyAndIV();
            window.top.sessionStorage.setItem(TEMP_KV_TRUST_FOR_TESTSUITE, JSON.stringify(kv));
            return kv;
        }
        try{
            return JSON.parse(kvj);
        } catch (e) {
            console.error("Error parsing test suite trust keyring, defaulting to random which may not work!", e);
        }
    }
    return generateRandomKeyAndIV();
}

const PHCODE_API_KEY = "PHCODE_API_KEY";
const { key, iv } = _selectKeys();
// this key is set at boot time as a truct base for all the core components before any extensions are loaded.
// just before extensions are loaded, this key is blanked. This can be used by core modules to talk with other
// core modules securely without worrying about interception by extensions.
// KernalModeTrust should only be available within all code that loads before the first default/any extension.
window.KernalModeTrust = {
    aesKeys: { key, iv },
    setPhoenixAPIKey,
    getPhoenixAPIKey,
    removePhoenixAPIKey,
    AESDecryptString,
    generateRandomKeyAndIV,
    dismantleKeyring
};
if(Phoenix.isSpecRunnerWindow){
    window.specRunnerTestKernalModeTrust = window.KernalModeTrust;
}
// key is 64 hex characters, iv is 24 hex characters

async function setPhoenixAPIKey(apiKey) {
    if(!window.__TAURI__){
        throw new Error("Phoenix API key can only be set in tauri shell!");
    }
    return window.__TAURI__.tauri.invoke("store_credential", {scopeName: PHCODE_API_KEY, secretVal: apiKey});
}

async function getPhoenixAPIKey() {
    if(!window.__TAURI__){
        throw new Error("Phoenix API key can only be get in tauri shell!");
    }
    const encryptedKey = await window.__TAURI__.tauri.invoke("get_credential", {scopeName: PHCODE_API_KEY});
    if(!encryptedKey){
        return null;
    }
    return AESDecryptString(encryptedKey, key, iv);
}

async function removePhoenixAPIKey() {
    if(!window.__TAURI__){
        throw new Error("Phoenix API key can only be set in tauri shell!");
    }
    return window.__TAURI__.tauri.invoke("delete_credential", {scopeName: PHCODE_API_KEY});
}

let _dismatled = false;
async function dismantleKeyring() {
    if(!_dismatled){
        throw new Error("Keyring can only be dismantled once!");
        // and once dismantled, the next line should be reload page. this is a strict security posture requirement to
        // prevent extensions from stealing sensitive info from system key ring as once the trust in invalidated,
        // the tauri get_system key ring cred apis will work for anyone who does the first call.
    }
    _dismatled = true;
    if(!key || !iv){
        console.error("Invalid kernal keys supplied to shutdown. Ignoring kernal trust reset at shutdown.");
        return;
    }
    if(!window.__TAURI__){
        return;
    }
    return window.__TAURI__.tauri.invoke("remove_trust_window_aes_key", {key, iv});
}

export async function initTrustRing() {
    if(!window.__TAURI__){
        return;
    }
    await window.__TAURI__.tauri.invoke("trust_window_aes_key", {key, iv});
}
