# Phoenix Browser Login Service Integration

This document provides comprehensive documentation for integrating with the Phoenix login service in browser applications specifically. For desktop application authentication, see `readme-login-desktop-no_dist.md`.

## Overview

The Phoenix browser application uses a login service to authenticate users across the phcode.dev domain ecosystem. The login service handles user authentication, session management, and provides secure API endpoints for login operations.

**Key Features:**
- Domain-wide session management using session cookies
- Secure user profile display via iframe integration
- Proxy server support for localhost development

**Key Files:**
- `src/services/login-browser.js` - Main browser login implementation
- `serve-proxy.js` - Proxy server for localhost development
- `readme-login-browser-no_dist.md` - This documentation file for detailed integration guide
- `readme-login-desktop-no_dist.md` - Desktop authentication documentation

## Architecture

### Production Environment

In production, the browser application uses `https://account.phcode.dev` as the login service endpoint.

**Domain-Wide Session Management:**
- Login service sets a `session` cookie at the `.phcode.dev` domain level
- This cookie is automatically shared across all subdomains:
  - `phcode.dev`
  - `dev.phcode.dev`
  - `*.phcode.dev` (any subdomain)
- Users login once and stay authenticated across the entire ecosystem

**Communication Flow:**
```
Browser App (*.phcode.dev) → account.phcode.dev
                           ← session cookie set for .phcode.dev
```

### Development Environment (localhost:8000)

**Challenge:** 
localhost:8000 doesn't share the `.phcode.dev` domain, so session cookies from account.phcode.dev are not automatically available.

**Solution:** 
Manual session cookie copying with proxy server routing.

#### Proxy Server Architecture

The `serve-proxy.js` server handles API routing for localhost development:

```
Browser (localhost:8000) → /proxy/accounts/* → serve-proxy.js → https://account.phcode.dev/*
                                                             ← Response with cookies
                        ← Cookies forwarded back to browser
```

**Key Function in login-browser.js:**
```javascript
function _getAccountBaseURL() {
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
        return '/proxy/accounts';  // Use proxy for localhost
    }
    return Phoenix.config.account_url.replace(/\/$/, ''); // Direct URL for production
}
```

## Development Setup Instructions

### Standard Development (localhost:8000 → account.phcode.dev)

1. **Login to Production Account Service:**
   - Open browser and navigate to `https://account.phcode.dev`
   - Login with your credentials
   - Account service sets `session` cookie for `.phcode.dev` domain

2. **Copy Session Cookie to Localhost:**
   - Open Chrome DevTools (F12) on `https://account.phcode.dev`
   - Go to Application → Cookies → `https://account.phcode.dev`
   - Find the `session` cookie and copy its value
   
3. **Set Cookie in Localhost App:**
   - Navigate to `http://localhost:8000/src/`
   - Open Chrome DevTools (F12)
   - Go to Application → Cookies → `http://localhost:8000`
   - Create new cookie:
     - **Name:** `session`
     - **Value:** [paste copied value]
     - **Domain:** `localhost`
     - **Path:** `/`
     - **HttpOnly:** ✓ (check if available)

4. **Verify Integration:**
   - Refresh `http://localhost:8000/src/`
   - Login should work automatically using the copied session

### Custom Login Server Development (localhost:5000)

For testing with a local account server instance:

1. **Configure Proxy Server:**
   - Edit `serve-proxy.js`
   - **Comment out:** `const ACCOUNT_SERVER = 'https://account.phcode.dev'; // Production`
   - **Uncomment:** `const ACCOUNT_SERVER = 'http://localhost:5000'; // Local development`

2. **Setup Local Account Server:**
   - Start your local account development stack on `localhost:5000`
   - Ensure all login endpoints are properly configured

Now just visit login server at `http://localhost:5000` and login. It should work with phoenix code dev server
at https://localhost:8000/src when you run phoenix code dev server via `npm run serve`. This works without any
manual cookie copy needed as the dev server sets cookies localhost wide. But if that didnt work, please see
manual cookie copy instructions below.
    
1. **Login and Copy Session:**
   - Navigate to `http://localhost:5000` in browser
   - Login with test credentials
   - Copy `session` cookie value from DevTools

2. **Set Cookie in Phoenix App:**
   - Navigate to `http://localhost:8000/src/`
   - Open Chrome DevTools → Application → Cookies
   - Create `session` cookie with copied value (same process as above)

3. **Verify Local Integration:**
   - API calls from localhost:8000 now route through serve-proxy.js to localhost:5000
   - Authentication should work with local account server

## API Endpoints

The login service provides these key endpoints:

### Authentication
- `POST /signOutPost` - Sign out user (new endpoint with proper JSON handling)
- `GET /resolveBrowserSession` - Validate and resolve current session (returns masked user data for security)
- `GET /signOut` - Legacy signout endpoint (deprecated for browser use)

### User Profile Display
- `GET /getUserDetailFrame` - Returns HTML iframe with full user details for secure display
  - Query parameters for styling: `includeName`, `nameFontSize`, `emailFontSize`, `nameColor`, `emailColor`, `backgroundColor`
  - CSP-protected to only allow embedding in trusted domains
  - Cross-origin communication via postMessage when loaded

### Session Management
- Session validation through `session` cookie
- Automatic session invalidation on logout
- Session sharing across domain ecosystem

## Communication Paths

### Production (phcode.dev subdomains):
```
Browser App → Direct HTTPS → account.phcode.dev
           ← Session cookie for .phcode.dev ←
```

### Development (localhost):
```
Browser (localhost:8000) → /proxy/accounts/* → serve-proxy.js
                                             ↓
                                           account.phcode.dev (or localhost:5000)
                                             ↓
                          ← API response ← serve-proxy.js
```

## Troubleshooting

### Common Issues

**1. "No session found" errors:**
- Verify `session` cookie is set correctly in browser
- Check cookie domain and path settings
- Ensure cookie hasn't expired

**2. CORS errors in development:**
- Verify serve-proxy.js is running on port 8000
- Check proxy configuration in serve-proxy.js
- Confirm account server URL is correct

**3. Login popup doesn't appear:**
- Check if popup blockers are enabled
- Verify account service URL is accessible
- Check browser console for JavaScript errors

**4. Session not persisting:**
- Ensure cookie is set with correct domain
- Check if HttpOnly flag is properly configured
- Verify account service is responding correctly

### Development Tips

1. **Always use Chrome DevTools** to inspect cookies and network requests
2. **Monitor Network tab** to see actual API calls and responses
3. **Check Console** for authentication-related errors
4. **Verify proxy routing** by checking serve-proxy.js logs
5. **Test both login and logout flows** to ensure complete functionality

## Security Considerations

- Session cookies are HttpOnly and secure in production
- Always use HTTPS in production environments
- Local development should never use production user credentials in local account servers
- Session cookies should have appropriate expiration times
- Logout should properly invalidate sessions on both client and server

### User Data Security
- **Masked API Data**: The `resolveBrowserSession` endpoint returns masked user data (e.g., "J***", "j***@g***.com") to prevent exposure to browser extensions
- **Secure iframe Display**: Full user details are displayed via iframe from trusted account server
- **CSP Protection**: iframe is protected by Content Security Policy headers restricting embedding domains
- **Cross-Origin Safety**: iframe communication uses secure postMessage protocol

---

For browser implementation details, see the source code in `src/services/login-browser.js` and related files. For desktop authentication, see `src/services/login-desktop.js` and `readme-login-desktop-no_dist.md`.
