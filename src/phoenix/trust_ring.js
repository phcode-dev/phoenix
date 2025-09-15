/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License along
 * with this program. If not, see https://opensource.org/licenses/AGPL-3.0.
 *
 */

/**
 * KernalModeTrust is a security mechanism in Phoenix that provides a trust base for core components before any
 * extensions are loaded. It establishes a secure communication channel between core modules and the Tauri shell,
 * preventing unauthorized access to sensitive information by extensions or other potentially malicious code.
 *
 * ## Purpose
 *
 * The primary purposes of KernalModeTrust are:
 *
 * 1. **Secure Boot Process**: Ensures that the application can only boot with a properly initialized trust ring.
 * 2. **Secure Communication**: Enables core modules to communicate securely without worrying about interception by
 *    extensions.
 * 3. **API Key Management**: Provides secure storage and retrieval of Phoenix API keys.
 * 4. **Security Boundary**: Creates a clear security boundary between trusted core components and potentially untrusted
 *    extensions.
 *
 * ## Implementation Details
 *
 * ### Trust Ring Initialization
 *
 * The trust ring is initialized at boot time before any extensions are loaded:
 *
 * 1. Random AES-256 keys and initialization vectors (IV) are generated using the Web Crypto API.
 * 2. These cryptographic materials are stored in the `window.KernalModeTrust` object.
 * 3. The trust relationship is established with the Tauri backend via the `initTrustRing()` function.
 *
 * The trust ring has several important security characteristics:
 *
 * 1. **Memory-Only Storage**: The random AES key-based trust ring is only kept in memory and never persisted to disk.
 * 2. **One-Time Use**: The trust ring is designed for one-time use and is discarded after serving its purpose.
 * 3. **Session Lifetime**: It is maintained in memory only until the end of the Phoenix session.
 * 4. **Tauri Communication**: The trust keys are communicated to the Tauri shell at boot time.
 * 5. **API Response Encryption**: Once an AES key is trusted by the Tauri shell, all sensitive API responses will be
 *   encrypted with this key. This means extensions can still call sensitive APIs but will receive only encrypted
 *   garbage responses without access to the trust key.
 *
 * ### Security Model
 *
 * KernalModeTrust implements a strict security model:
 *
 * 1. **Boot-time Only Access**: The trust ring is only available to code that loads before any extensions.
 * 2. **One-time Trust**: For a given Tauri window, the trust ring can only be set once.
 * 3. **Deliberate Removal**: Before extensions are loaded, `window.KernalModeTrust` is deleted to prevent extensions
 *    from accessing it.
 * 4. **Dismantling Before Restart**: The trust ring must be dismantled before restarting the application. This is a
 *    critical security requirement. If not dismantled, the old trust keys will still be in place when the page reloads,
 *    but the application will lose access to them (as they were only stored in memory). As a result, the Tauri shell
 *    will not trust any sensitive API calls from the reloaded page, as these calls will rely on the old keys that the
 *    new page instance cannot access. This security measure intentionally prevents any page reload from maintaining
 *    trust without explicitly dismantling the old trust ring first, ensuring that malicious code cannot bypass
 *    security by simply reloading the window.
 *
 * ### Cryptographic Implementation
 *
 * KernalModeTrust uses strong cryptography:
 *
 * 1. **AES-256 Encryption**: Uses AES-256 in GCM mode for secure encryption/decryption.
 * 2. **Random Key Generation**: Cryptographically secure random number generation for keys and IVs.
 * 3. **Secure Key Storage**: Keys are stored securely in the Tauri backend(which is stored in OS keychain).
 *
 * ## Security Considerations
 *
 * 1. **Extension Isolation**: Extensions should never have access to KernalModeTrust to prevent potential security
 *    breaches.
 *
 * 2. **One-time Trust**: The trust ring can only be set once per Tauri window, preventing malicious code from replacing
 *    it.
 *
 * 3. **Complete Dismantling**: When dismantling the keyring, it's recommended to reload the page immediately to prevent
 *    any potential exploitation of the system.
 *
 * 4. **Test Environment Handling**: Special handling exists for test environments to ensure tests can run properly
 *    without compromising security.
 *
 * ## Conclusion
 *
 * KernalModeTrust is a critical security component in Phoenix that establishes a trust boundary between core components
 * and extensions. By providing secure communication channels and API key management, it helps maintain the overall
 * security posture of the application.
 * */

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

const CRED_KEY_API = "API_KEY";
const CRED_KEY_PROMO = "PROMO_GRANT_KEY";
const SIGNATURE_SALT_KEY = "SIGNATURE_SALT_KEY";
const { key, iv } = _selectKeys();
// this key is set at boot time as a truct base for all the core components before any extensions are loaded.
// just before extensions are loaded, this key is blanked. This can be used by core modules to talk with other
// core modules securely without worrying about interception by extensions.
// KernalModeTrust should only be available within all code that loads before the first default/any extension.
window.KernalModeTrust = {
    CRED_KEY_API,
    CRED_KEY_PROMO,
    SIGNATURE_SALT_KEY,
    aesKeys: { key, iv },
    setCredential,
    getCredential,
    removeCredential,
    AESDecryptString,
    generateRandomKeyAndIV,
    dismantleKeyring
};
if(Phoenix.isSpecRunnerWindow){
    window.specRunnerTestKernalModeTrust = window.KernalModeTrust;
}
// key is 64 hex characters, iv is 24 hex characters

async function setCredential(credKey, secret) {
    if(!window.__TAURI__){
        throw new Error("Phoenix API key can only be set in tauri shell!");
    }
    if(!credKey){
        throw new Error("credKey is required to set credential!");
    }
    return window.__TAURI__.tauri.invoke("store_credential", {scopeName: credKey, secretVal: secret});
}

async function getCredential(credKey) {
    if(!window.__TAURI__){
        throw new Error("Phoenix API key can only be get in tauri shell!");
    }
    if(!credKey){
        throw new Error("credKey is required to get credential!");
    }
    const encryptedKey = await window.__TAURI__.tauri.invoke("get_credential", {scopeName: credKey});
    if(!encryptedKey){
        return null;
    }
    return AESDecryptString(encryptedKey, key, iv);
}

async function removeCredential(credKey) {
    if(!window.__TAURI__){
        throw new Error("Phoenix API key can only be set in tauri shell!");
    }
    if(!credKey){
        throw new Error("credKey is required to remove credential!");
    }
    return window.__TAURI__.tauri.invoke("delete_credential", {scopeName: credKey});
}

let _dismatled = false;
async function dismantleKeyring() {
    if(_dismatled){
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
