# Phoenix Desktop Login Service Integration

This document provides comprehensive documentation for integrating with the Phoenix login service in desktop applications. For browser application authentication, see `readme-login-browser-no_dist.md`.

## Overview

The Phoenix desktop application uses a fundamentally different authentication approach compared to browser applications. Instead of session cookies, desktop apps use API keys with enhanced security measures to prevent phishing attacks and ensure secure credential storage.

**Key Files:**
- `src/services/login-desktop.js` - Main desktop login implementation
- `readme-login-desktop-no_dist.md` - This documentation file
- `readme-login-browser-no_dist.md` - Browser authentication documentation
- Kernel Mode Trust files - For secure credential storage (referenced for further reading)

## Architecture Overview

### Core Differences from Browser Authentication

| Feature | Desktop Application | Browser Application |
|---------|-------------------|-------------------|
| **Authentication Method** | API Keys | Session Cookies |
| **Storage** | System Keychain via Tauri APIs | Browser cookies |
| **Security Layer** | Kernel Mode Trust | Domain-based security |
| **Phishing Protection** | Verification Codes | Domain validation |
| **Cross-window sync** | Preference-based notifications | Shared domain cookies |

## Desktop Authentication Flow

### 1. API Key-Based Authentication

Desktop applications do **NOT** use session cookies. Instead, they use API keys that are:

- Obtained through a secure authentication flow
- Stored securely in the system keychain via Tauri APIs
- Inaccessible to browser extensions due to Kernel Mode Trust security posture
- Required with every API request

### 2. Verification Code Security System

To prevent phishing attacks where malicious users could send authentication URLs to unsuspecting victims, the desktop app implements a verification code system:

**The Attack Vector:**
- Malicious user generates an authentication URL
- Sends it to victim via email/message
- Victim clicks and logs in, unknowingly giving access to malicious user

**The Protection:**
- Desktop app generates a unique verification code for each login session
- User must enter this verification code to complete authentication
- Even if a victim logs in with a malicious URL, they cannot provide the verification code

### 3. Auto-Verification Flow

For improved user experience, the desktop app includes an automatic verification system:

**Components:**
- **Local Node.js Server:** Started by desktop app on a dynamically detected free port (port 0)
- **Random URL Security:** Auto auth endpoint uses randomly generated URL path (`/AutoAuth${randomNonce(8)}`) for security
- **Account Service Integration:** account.phcode.dev/auth communicates with the secure localhost endpoint
- **Automatic Code Exchange:** Verification code automatically provided if on same machine

**Browser Compatibility:**
- ✅ **Chrome/Chromium:** Full auto-verification support
- ✅ **Firefox:** Full auto-verification support  
- ❌ **Safari:** Auto-verification **BLOCKED** - Safari's security policy prevents HTTPS sites from connecting to localhost
- ⚠️ **Other Browsers:** May vary based on security policies

**Flow:**
1. Desktop app starts local Node.js server on a dynamically detected free port 
2. Random secure auto auth URL is generated: `http://localhost:{port}/AutoAuth{randomNonce}`
3. User initiates login, gets verification code and auto auth URL
4. Desktop app sends verification code to local server via `setVerificationCode()`
5. User clicks "Open in Browser" → goes to account.phcode.dev/auth
6. Account service attempts GET to `{autoAuthURL}/autoVerifyCode` endpoint
7. **If successful (Chrome/Firefox):** verification code automatically retrieved and used
8. Account service calls `{autoAuthURL}/appVerified` to notify desktop app
9. **If failed (Safari/blocked):** user manually enters verification code

## Secure Credential Storage

### Kernel Mode Trust Integration

Desktop applications leverage Kernel Mode Trust for secure credential management:

- **API Key Storage:** Securely stored in system keychain via Tauri APIs
- **Extension Isolation:** External extensions cannot access credentials
- **Integrated Extensions Only:** Only integrated extensions have access to Kernel Mode Trust
- **Cross-Platform Security:** Tauri provides secure storage across Windows, Mac, Linux

**For detailed technical implementation of Kernel Mode Trust security architecture, refer to the Kernel Mode Trust source files (out of scope for this document).**

## Authentication Endpoints and APIs

### Key API Endpoints

#### Authentication Session Management
```javascript
// Get app authentication session
GET ${Phoenix.config.account_url}getAppAuthSession?autoAuthPort=${authPortURL}&appName=${appName}
// Response: {"isSuccess":true,"appSessionID":"uuid...","validationCode":"SWXP07"}
```

#### API Key Resolution
```javascript
// Resolve API key with verification code
GET ${Phoenix.config.account_url}resolveAppSessionID?appSessionID=${apiKey}&validationCode=${validationCode}
// Response: User profile details if valid
```

#### Session Logout
```javascript
// Logout session
POST ${Phoenix.config.account_url}logoutSession
// Body: {"appSessionID": "api_key"}
```

#### Auto-Verification Endpoints (Local Server)

The desktop app creates a local Node.js server with secure auto-authentication endpoints:

```javascript
// Auto auth base URL (generated with random nonce for security)
// Example: http://localhost:43521/AutoAuthDI0zAUJo
const autoAuthURL = KernalModeTrust.localAutoAuthURL;

// Get verification code endpoint
GET {autoAuthURL}/autoVerifyCode
// Response: {"code": "SWXP07"} or 404 if no code available
// Headers: Access-Control-Allow-Origin: https://account.phcode.dev

// App verified notification endpoint  
GET {autoAuthURL}/appVerified
// Response: "ok"
// Triggers desktop app to check login status
```

**Security Features:**
- **Random URL Path:** `/AutoAuth{randomNonce(8)}` makes URL unguessable
- **Origin Restrictions:** Only `https://account.phcode.dev` allowed
- **One-time Use:** Verification code returned only once, then cleared
- **Localhost Only:** Server binds to localhost interface only

### API Request Authentication

Unlike browser applications that rely on automatic cookie transmission, desktop applications must explicitly include the API key with every request:

```javascript
// Every API call must include the API key
const userProfile = await KernalModeTrust.getCredential(KernalModeTrust.CRED_KEY_API);
const apiKey = JSON.parse(userProfile).apiKey;
// Include apiKey in request headers or parameters
```

## Implementation Details

### Login Process

1. **Initiate Login:**
   ```javascript
   const appAuthSession = await _getAppAuthSession();
   const {appSessionID, validationCode} = appAuthSession;
   ```

2. **Setup Auto-Verification:**
   ```javascript
   await setAutoVerificationCode(validationCode);
   ```

3. **Show Verification Dialog:**
   - Display verification code to user
   - Provide "Open in Browser" button
   - Allow manual code entry if auto-verification fails

4. **Monitor Authentication Status:**
   ```javascript
   const resolveResponse = await _resolveAPIKey(appSessionID, validationCode);
   if(resolveResponse.userDetails) {
       // Authentication successful
       userProfile = resolveResponse.userDetails;
       await KernalModeTrust.setCredential(KernalModeTrust.CRED_KEY_API, JSON.stringify(userProfile));
   }
   ```

### Credential Management

#### Storing Credentials
```javascript
// Store API key securely in system keychain
await KernalModeTrust.setCredential(KernalModeTrust.CRED_KEY_API, JSON.stringify(userProfile));
```

#### Retrieving Credentials
```javascript
// Retrieve stored credentials
const savedUserProfile = await KernalModeTrust.getCredential(KernalModeTrust.CRED_KEY_API);
const userProfile = JSON.parse(savedUserProfile);
```

#### Removing Credentials (Logout)
```javascript
// Remove credentials from keychain
await KernalModeTrust.removeCredential(KernalModeTrust.CRED_KEY_API);
```

## Multi-Window Synchronization

Desktop applications handle multi-window authentication synchronization through preferences:

```javascript
const PREF_USER_PROFILE_VERSION = "userProfileVersion";

// Notify other windows of login state changes
PreferencesManager.stateManager.set(PREF_USER_PROFILE_VERSION, crypto.randomUUID());

// Listen for changes in other windows
const pref = PreferencesManager.stateManager.definePreference(PREF_USER_PROFILE_VERSION, 'string', '0');
pref.watchExternalChanges();
pref.on('change', _verifyLogin);
```

## Security Considerations

### Phishing Attack Prevention
- **Verification Code System:** Prevents unauthorized access even if user logs in with malicious URL
- **Time-Limited Sessions:** Authentication sessions expire after 5 minutes
- **Local Verification:** Auto-verification only works on same machine

### Secure Storage
- **System Keychain:** Credentials stored in OS-provided secure storage
- **Tauri Security:** Leverages Tauri's security model for cross-platform protection
- **Extension Isolation:** External extensions cannot access stored credentials

### API Key Management
- **Unique Per Session:** Each authentication generates new API key
- **Server-Side Validation:** All API keys validated server-side
- **Proper Logout:** Server-side session invalidation on logout

## Development and Testing

### Testing with Local Login Server

For testing desktop authentication with a local account server:

1. **Configure Proxy Server:**
    - use `npm run serveLocalAccount` to serve phoenix repo server, instead of using npm run serve command.
    - use `npm run serveStagingAccount` to use the staging endpoint. To get access to staging server, contact team.

2. **Setup Local Account Server:**
    - Start your local account development stack on `localhost:5000`
    - Ensure all login endpoints are properly configured

3. **Test Desktop Authentication:**
   - Desktop app will now use your local/staging server for all authentication calls
   - Verification codes and API key resolution will go through your local/staging server
   - Auto-verification will attempt to connect to your local account service

**Note:** Like browser testing which requires proxy server configuration, desktop apps also use the proxy server
for communication with backend.

## Troubleshooting

### Common Issues

**1. "No savedUserProfile found" errors:**
- Check if Kernel Mode Trust is properly initialized
- Verify Tauri keychain access permissions
- Ensure credentials weren't cleared by system security policies

**2. Verification code timeout:**
- Verification codes expire after 5 minutes
- User must restart login process if expired
- Check local Node.js server connectivity for auto-verification

**3. Auto-verification fails:**
- **Safari Browser:** Auto-verification is blocked by Safari's security policies
- **Firewall:** May be blocking localhost communication
- **Local Server Issues:** Server may not be running properly
- **Solution:** Always fall back to manual verification code entry

**4. API key validation failures:**
- Check network connectivity to account service
- Verify API key hasn't been invalidated server-side
- Confirm account service URL configuration

### Development Tips

1. **Monitor Kernel Mode Trust Access:** Ensure proper initialization and access patterns
2. **Test Auto-Verification Flow:** 
   - Test in Chrome/Firefox for full functionality
   - Test in Safari to ensure graceful fallback to manual entry
   - Verify localhost server starts and responds correctly
3. **Browser Testing Strategy:**
   - Chrome/Firefox: Expect auto-verification to work
   - Safari: Always expect manual verification flow
   - Test user experience in both scenarios
4. **Validate Credential Storage:** Check system keychain directly if available
5. **Test Multi-Window Sync:** Verify login state propagates across application windows
6. **Security Testing:** Test phishing protection by attempting malicious URL scenarios

## API Error Handling

### Error Codes
```javascript
const ERR_RETRY_LATER = "retry_later";  // Network/temporary errors
const ERR_INVALID = "invalid";          // API key/verification code invalid
```

### Response Handling
```javascript
const resolveResponse = await _resolveAPIKey(apiKey, validationCode);
if(resolveResponse.userDetails) {
    // Success: use userDetails
} else if(resolveResponse.err === ERR_INVALID) {
    // Invalid credentials: force re-authentication
    await _resetAccountLogin();
} else if(resolveResponse.err === ERR_RETRY_LATER) {
    // Temporary error: retry later
}
```

---

For desktop implementation details, see the source code in `src/services/login-desktop.js`. For browser authentication, see `src/services/login-browser.js` and `readme-login-browser-no_dist.md`.

For deeper understanding of the Kernel Mode Trust security architecture and secure credential storage implementation, refer to the Kernel Mode Trust source files (out of scope for this document).
