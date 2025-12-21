# Security Audit Report

**Project:** ArchiTect Hub
**Date:** December 21, 2025
**Auditor:** Claude Security Review
**Severity Levels:** Critical | High | Medium | Low | Informational

---

## Executive Summary

This security audit reviewed the ArchiTect Hub application, a React + Firebase collaboration platform for architecture teams. The application handles document management, user authentication, team collaboration, and guest uploads. Several security concerns were identified ranging from critical XSS vulnerabilities to informational recommendations.

### Risk Summary

| Severity | Count |
|----------|-------|
| Critical | 1 |
| High | 3 |
| Medium | 5 |
| Low | 4 |
| Informational | 4 |

---

## Critical Issues

### 1. Cross-Site Scripting (XSS) via `dangerouslySetInnerHTML` in Comments

**Location:** `src/components/CommentText.tsx:46`

**Description:**
The `CommentText` component uses `dangerouslySetInnerHTML` to render user-provided comment text with highlighted mentions. The `formatTextWithMentions` function in `src/utils/textUtils.ts` directly interpolates user input into HTML without sanitization.

```typescript
// CommentText.tsx:46
dangerouslySetInnerHTML={{ __html: formattedText }}

// textUtils.ts:176 - User input directly inserted
result += `<span class="text-blue-500 font-medium">${usernameText}</span>`;
```

**Impact:**
An attacker could inject malicious JavaScript through comment text or mention usernames, potentially stealing session tokens, performing actions on behalf of users, or defacing the application.

**Recommendation:**
- Use a sanitization library like DOMPurify to sanitize HTML before rendering
- Consider using React components instead of raw HTML injection
- Escape special HTML characters in user input before insertion

---

## High Severity Issues

### 2. Vulnerable Dependencies with Known CVEs

**Location:** `package.json`

**Description:**
The npm audit reveals several vulnerable dependencies:

| Package | Severity | Issue |
|---------|----------|-------|
| `axios@1.6.7` | High | DoS attack via lack of data size check (CVE-2024-XXXXX) |
| `firebase@10.8.0` (undici) | Moderate | Multiple Firebase sub-packages affected |
| `@eslint/plugin-kit` | Low | ReDoS vulnerability |

**Recommendation:**
- Update `axios` to version 1.12.0 or later
- Update `firebase` to the latest version
- Run `npm audit fix` to automatically resolve compatible updates

---

### 3. Upload Token Publicly Readable Without Authentication

**Location:** `firestore.rules:316-318`

**Description:**
Upload tokens in the `uploadTokens` collection are readable by anyone (no authentication required):

```javascript
match /uploadTokens/{tokenId} {
  // Allow anyone (including guests) to read tokens
  allow read: if true;
```

While this is intentional for guest uploads, the token data may contain sensitive metadata (projectId, folderId, folder names, creator ID).

**Impact:**
Attackers could enumerate all upload tokens and discover internal project structure, folder organization, and user IDs.

**Recommendation:**
- Only expose minimal necessary fields publicly
- Consider using Firebase callable functions to validate tokens server-side instead of client-side reads
- Add rate limiting to token lookups

---

### 4. Console Logging of Security Tokens

**Location:** Multiple files

**Description:**
Security tokens are logged to the browser console in production code:

```typescript
// src/components/SharedContent.tsx:39-44
console.log('Original token from URL:', token);
console.log('Trimmed token:', token?.trim());
console.log('Normalized token:', normalizedToken);

// src/services/shareService.ts:46,61
console.log('Looking for token:', tokenId);
console.log('Found token data:', tokenData);
```

**Impact:**
Tokens and token data are visible in browser developer tools, potentially exposing them to attackers with physical access or via malware that captures console output.

**Recommendation:**
- Remove all token-related console.log statements or wrap in development-only conditions
- Use a proper logging library with log levels
- Never log sensitive data in production

---

## Medium Severity Issues

### 5. Missing Token Expiration Validation in Share Links

**Location:** `src/services/shareService.ts:43-78`

**Description:**
The `validateShareToken` function checks if a token exists but does not verify if the token has expired:

```typescript
export const validateShareToken = async (tokenId: string) => {
  // ... fetches token
  const expiresAt = tokenData.expiresAt?.toDate?.()
    ? tokenData.expiresAt.toDate()
    : new Date(tokenData.expiresAt);

  // Returns token without checking if expiresAt < new Date()
  return {
    ...tokenData,
    expiresAt
  } as ShareToken;
```

**Impact:**
Expired share tokens may still grant access to shared content.

**Recommendation:**
- Add expiration check: `if (expiresAt < new Date()) return null;`
- Consistent with `validateUploadToken` which correctly checks expiration

---

### 6. Overly Permissive CORS Configuration

**Location:** `cors.json`

**Description:**
CORS allows all HTTP methods including DELETE from configured origins:

```json
{
  "origin": ["https://architect-hub-test.netlify.app", "http://localhost:3000", "http://localhost:5173"],
  "method": ["GET", "HEAD", "PUT", "POST", "DELETE"],
  ...
}
```

**Impact:**
If any of the allowed origins are compromised, attackers could perform destructive operations on Cloud Storage.

**Recommendation:**
- Remove `DELETE` method unless absolutely necessary
- Consider separate CORS configurations for production and development
- Remove localhost origins in production deployment

---

### 7. innerHTML Usage in Dynamic Content

**Location:** `src/components/DocumentList.tsx:4238`

**Description:**
Direct innerHTML assignment creates modals dynamically:

```typescript
modal.innerHTML = `
  <div class="bg-white rounded-lg shadow-lg p-6 w-full max-w-2xl">
    ...
`;
```

While the content appears to be static HTML, this pattern is prone to XSS if any dynamic data is later added.

**Recommendation:**
- Use React Portal or a modal component library
- Avoid direct DOM manipulation with innerHTML

---

### 8. Password Minimum Length of Only 6 Characters

**Location:** `functions/src/createUser.ts:27-32`

**Description:**
The Cloud Function accepts passwords with minimum 6 characters:

```typescript
if (!data.password || typeof data.password !== 'string' || data.password.length < 6) {
  throw new functions.https.HttpsError(
    'invalid-argument',
    'password is required and must be at least 6 characters'
  );
}
```

**Impact:**
Weak passwords are more susceptible to brute-force attacks.

**Recommendation:**
- Increase minimum password length to 12+ characters
- Require password complexity (uppercase, lowercase, numbers, special characters)
- Integrate with a password strength library

---

### 9. No Rate Limiting on Authentication Endpoints

**Location:** `src/contexts/AuthContext.tsx`

**Description:**
While Firebase Auth has some built-in protection (`auth/too-many-requests`), there's no application-level rate limiting on login attempts.

**Impact:**
Attackers can attempt credential stuffing or brute force attacks until Firebase's rate limiting kicks in.

**Recommendation:**
- Implement client-side rate limiting with exponential backoff
- Consider implementing CAPTCHA after failed attempts
- Monitor and alert on unusual login patterns

---

## Low Severity Issues

### 10. Storage Rules Deny All Access

**Location:** `storage.rules`

**Description:**
Cloud Storage rules deny all read/write access:

```javascript
match /{allPaths=**} {
  allow read, write: if false;
}
```

While the application functions (likely using signed URLs), this means:
- Profile picture uploads in `AuthContext.tsx` may fail
- Document uploads may rely solely on admin SDK or signed URLs

**Recommendation:**
- Verify all upload/download flows work correctly
- If signed URLs are used, ensure they have appropriate expiration
- Consider adding explicit rules for authenticated users if needed

---

### 11. Client-Side Permission Checks

**Location:** `src/contexts/AuthContext.tsx:292-355`

**Description:**
Permission checks (`canUploadDocuments()`, `canDeleteDocuments()`, etc.) are implemented client-side only:

```typescript
const canDeleteDocuments = () => {
  return isStaffOnly();
};
```

While Firestore security rules provide server-side enforcement, relying on client-side checks can lead to inconsistencies.

**Recommendation:**
- Ensure all permission logic is mirrored in Firestore security rules
- Consider centralizing permission definitions
- Document the dual-enforcement approach

---

### 12. Hardcoded Default Password in Test Code

**Location:** `src/services/cloudFunctionService.ts:134`

**Description:**
A hardcoded password appears in test/example code:

```typescript
password: "12345678"
```

**Recommendation:**
- Remove hardcoded credentials from source code
- Use environment variables for test credentials
- Ensure this code is not callable in production

---

### 13. Route Order Allows Unauthenticated Access

**Location:** `src/App.tsx:111-127`

**Description:**
The route order places `/*` (protected) before `/shared/:token` and `/upload`:

```jsx
<Route path="/*" element={<ProtectedRoute>...} />
<Route path="/shared/:token" element={<SharedContent />} />
<Route path="/upload" element={<TokenUpload />} />
```

React Router v6 handles this correctly, but the order could be confusing and error-prone.

**Recommendation:**
- Place public routes before the catch-all route for clarity
- Document which routes require authentication

---

## Informational Findings

### 14. LocalStorage Used for Annotation Data

**Location:** `src/store/useAnnotationStore.ts`, `src/utils/exportUtils.ts`

**Description:**
Annotations are stored in localStorage as a fallback mechanism. While not a direct vulnerability, localStorage:
- Has a 5-10MB limit
- Is accessible to any JavaScript on the same origin
- Persists after logout

**Recommendation:**
- Consider clearing localStorage on logout
- Document the localStorage usage for users
- Implement size limits to prevent storage exhaustion

---

### 15. Debug Logging in Production Code

**Location:** Multiple files

**Description:**
Extensive console logging exists throughout the codebase that could leak sensitive information:
- User IDs in notification logs
- Token IDs in upload flows
- Folder and document IDs

**Recommendation:**
- Implement a logging utility with environment-aware log levels
- Remove or minimize logging in production builds
- Use Vite's `import.meta.env.DEV` to conditionally log

---

### 16. No Content Security Policy (CSP)

**Location:** `index.html`

**Description:**
No Content Security Policy headers are configured. CSP can help mitigate XSS attacks.

**Recommendation:**
- Add CSP meta tag or configure via hosting platform
- Start with report-only mode to identify violations
- Progressively tighten the policy

---

### 17. Error Messages Reveal Internal Structure

**Location:** Various service files

**Description:**
Error messages sometimes reveal internal details:
- Collection names
- Document structure
- Firebase configuration state

**Recommendation:**
- Use generic error messages for users
- Log detailed errors server-side only
- Implement error boundaries that hide technical details

---

## Security Posture Summary

### Strengths

1. **Firestore Security Rules**: Comprehensive rules with role-based access control
2. **Admin-Only Cloud Functions**: User management operations are properly restricted
3. **Audit Logging**: Access logs are maintained and immutable (no update/delete allowed)
4. **Token Expiration**: Upload tokens have proper expiration handling
5. **Project Membership Checks**: Access requires project membership verification

### Areas for Improvement

1. **Input Sanitization**: Implement consistent input sanitization across the application
2. **Dependency Management**: Establish a process for regular dependency updates
3. **Logging Strategy**: Implement production-appropriate logging
4. **Password Policy**: Strengthen password requirements
5. **Rate Limiting**: Implement application-level rate limiting

---

## Remediation Priority

| Priority | Issue | Effort |
|----------|-------|--------|
| 1 | XSS in CommentText | Low |
| 2 | Update vulnerable dependencies | Low |
| 3 | Remove token console logging | Low |
| 4 | Add share token expiration check | Low |
| 5 | Strengthen password policy | Low |
| 6 | Update CORS configuration | Medium |
| 7 | Implement rate limiting | Medium |
| 8 | Add Content Security Policy | Medium |

---

## Appendix

### Files Reviewed

- `firestore.rules`
- `storage.rules`
- `cors.json`
- `package.json` / `functions/package.json`
- `src/contexts/AuthContext.tsx`
- `src/components/CommentText.tsx`
- `src/utils/textUtils.ts`
- `src/services/shareService.ts`
- `src/services/uploadTokenService.ts`
- `src/components/TokenUpload.tsx`
- `src/components/SharedContent.tsx`
- `src/App.tsx`
- `functions/src/createUser.ts`
- `functions/src/deleteUser.ts`
- `src/lib/firebaseConfig.ts`

### Tools Used

- Static code analysis (grep patterns)
- npm audit
- Manual code review

---

*This report represents findings as of the audit date. Security is an ongoing process, and regular audits are recommended.*
