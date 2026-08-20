# Magic-Link Verification Page Setup & Testing

## Overview

The `/auth/verify` page handles the magic-link sign-in flow for the alcoia extension. It verifies the link against the server and exchanges it for a short-lived handoff code that's sent to the extension.

## Architecture

1. **User receives email** with link: `https://your-domain/auth/verify?token=...&kind=extension`
2. **Page loads** and POSTs token to `/api/auth/magic-link/verify`
3. **Server responds** with: `{ code, kind: 'extension', expiresAt }`
4. **Code stays in memory** (JS variable, never in URL or storage)
5. **Page sends code to extension** via `chrome.runtime.sendMessage(EXTENSION_ID, { code })`
6. **Three states rendered**: verifying → success/failure/no-extension

## Configuration

### Extension ID

The extension ID is configured in `build.js`:

```javascript
const SITE = {
  // ... other config ...
  'extension-id': process.env.EXTENSION_ID || 'LOCAL_DEV_EXTENSION_ID',
};
```

**To set the extension ID:**

1. **Local dev**: 
   - Load the extension (unpacked) in Chrome at `chrome://extensions/`
   - Copy the ID shown under the extension name
   - Set it: `EXTENSION_ID=<your-id> npm run build`

2. **Production (Web Store)**:
   - Use the Web Store extension ID
   - Set during build: `EXTENSION_ID=<store-id> npm run build`

### Server Configuration

The server's magic-link email points to `MAGIC_LINK_BASE_URL`. For local testing:

**In alcoiaServer/.env:**

```
MAGIC_LINK_BASE_URL=http://localhost:8124/auth/verify
PORT=3000
# ... other required env vars ...
```

**Marketing site serve port:**

```bash
npm run build --serve --port 8124
```

## End-to-End Testing Steps

### Prerequisites

1. **Database**: PostgreSQL with alcoia schema (see alcoiaServer/migrations/)
2. **Environment**: alcoiaServer/.env with DATABASE_URL and RECEIPT_SIGNING_SECRET
3. **Email**: Optional - without POSTMARK_TOKEN, emails log to server console
4. **Extension**: Unpacked extension loaded in Chrome (or use LOCAL_DEV_EXTENSION_ID)

### Test Flow

1. **Start the server:**
   ```bash
   cd /c/Users/hp/Desktop/alcoiaServer
   # Set up .env with DATABASE_URL and other required vars
   npm run migrate  # if needed
   npm start
   # Server runs on http://localhost:3000
   ```

2. **Build and serve the marketing site:**
   ```bash
   cd /c/Users/hp/Desktop/alcoiaWeb
   EXTENSION_ID=your-extension-id npm run build --serve --port 8124
   # Site runs on http://localhost:8124
   ```

3. **Trigger a magic-link request** (using curl or direct POST):
   ```bash
   curl -X POST http://localhost:3000/api/auth/magic-link \
     -H "Content-Type: application/json" \
     -d '{
       "email": "test@example.com",
       "kind": "extension"
     }'
   ```
   Server responds with `{ message: "sent" }`

4. **Find the link**:
   - If POSTMARK_TOKEN is set: Check email inbox
   - If not: Check server console for logged email (watch for the URL)

5. **Copy the verify link**: Format is `http://localhost:8124/auth/verify?token=...&kind=extension`

6. **Open the link in browser**: Click or paste into address bar

### Verify All Three States

#### State 1: Verifying
- Page shows spinner and "Verifying your sign-in"
- Lasts ~1-5 seconds while fetching from server

#### State 2: Success
- Shows checkmark (✓) and "You're signed in"
- Extension received the handoff code
- Message: "The verification was successful. You can close this tab and return to the extension."

#### State 3: Failure Cases

**Expired or already-used link:**
- Shows: "Link expired or already used"
- Button: "Request a new sign-in link"
- Happens when:
  - Link is older than TTL (default 15 minutes)
  - Link was already used once before

**No extension installed or ID mismatch:**
- Shows: "Extension not found"
- Button: "Install alcoia on Chrome"
- Happens when:
  - Extension is not installed
  - EXTENSION_ID in build doesn't match installed extension
  - `chrome.runtime` is not available

**Network/server error:**
- Shows: "Something went wrong"
- Message shows specific error
- Button: "Request a new sign-in link"

## Code Security Notes

1. **Handoff code never persists**:
   - Stored only in `let handoffCode` variable
   - Cleared after successful send or timeout
   - Never written to URL, localStorage, or logs

2. **Token handling**:
   - Token is read from URL param only once
   - POSTed to server securely
   - Not stored anywhere after use

3. **Extension communication**:
   - Uses Chrome's native `runtime.sendMessage`
   - No alternative delivery mechanism
   - Extension ID mismatch fails safely (shows "install" state)

4. **Error handling**:
   - No detailed error codes exposed to user
   - User-friendly messages instead of technical details
   - Errors don't log sensitive information

## Testing Without Full Server Setup

You can test the UI states by:

1. **Edit the verification link** to use invalid tokens:
   - `?token=invalid&kind=extension` → "Something went wrong"
   - No query params → "Something went wrong"

2. **Simulate the server response** by modifying the fetch in DevTools
   - Open browser DevTools → Network
   - Refresh the page
   - Watch the fetch to `/api/auth/magic-link/verify`

3. **Test extension communication**:
   - Open DevTools → Console
   - `EXTENSION_ID` will show 'LOCAL_DEV_EXTENSION_ID' or configured value
   - In normal case, `chrome.runtime.sendMessage` waits 5 seconds then shows "no extension" state

## Files Modified

- `build.js`: Added `extension-id` to SITE config
- `src/pages/auth-verify.html`: Complete verification page with all states

## Handoff Code TTL

The handoff code is single-use and short-lived:
- TTL: 2 minutes (120 seconds) by default (see alcoiaServer/src/auth/ttl.js)
- After 2 minutes: expires, must request new magic link
- After used once: consumed, cannot be reused

## Extension Side

This page's only responsibility is: verify → get code → sendMessage.

The extension's responsibilities (not in this repo):
- Receive the code via `chrome.runtime.onMessage`
- POST to `/api/auth/extension-session/exchange` with the code
- Get back the session token
- Store session (in extension storage, not in web pages)

See alcoiaServer/src/http/routes/extension-session.js for the exchange endpoint.
