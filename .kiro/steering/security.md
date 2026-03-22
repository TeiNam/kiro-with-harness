# Security Rules

## Required Security Checks (Verify Before Every Commit)

- [ ] No hardcoded secrets (API keys, passwords, tokens)
- [ ] All user input validated and sanitized
- [ ] SQL injection prevention (parameterized queries / prepared statements only)
- [ ] XSS prevention (HTML sanitized)
- [ ] CSRF protection enabled
- [ ] Authentication/authorization verified
- [ ] Rate limiting on all endpoints
- [ ] Error handling on critical paths
- [ ] No sensitive data exposed in error messages

## Secret Management

- Never hardcode secrets in source code
- Always use environment variables or a secret manager
- Validate required secrets exist at startup
- Rotate exposed secrets immediately

## OWASP Top 10 Checklist

1. **Injection** — Queries parameterized? Prepared statements used? User input sanitized?
2. **Broken Authentication** — Passwords hashed (bcrypt/argon2)? JWT validated? Sessions secure?
3. **Sensitive Data Exposure** — HTTPS enforced? Secrets in env vars? PII encrypted? Logs sanitized?
4. **XXE** — XML parser secured? External entities disabled?
5. **Broken Access Control** — Auth checks on all routes? CORS configured properly?
6. **Security Misconfiguration** — Default credentials changed? Debug mode disabled in production? Security headers set?
7. **XSS** — Output escaped? CSP configured? Framework auto-escaping enabled?
8. **Insecure Deserialization** — User input deserialized safely?
9. **Known Vulnerabilities** — Dependencies up to date? npm audit / cargo audit clean?
10. **Insufficient Logging** — Security events logged? Alerts configured?

## Code Patterns to Flag Immediately

| Pattern | Severity | Fix |
|---------|----------|-----|
| Hardcoded secrets | CRITICAL | Use `process.env` or environment variables |
| Shell command with user input | CRITICAL | Use safe API or execFile |
| String-concatenated SQL | CRITICAL | Use parameterized queries / prepared statements |
| `innerHTML = userInput` | HIGH | Use `textContent` or DOMPurify |
| `fetch(userProvidedUrl)` | HIGH | Whitelist allowed domains |
| Plaintext password comparison | CRITICAL | Use `bcrypt.compare()` |
| No auth check on route | CRITICAL | Add auth middleware |
| Balance check without lock | CRITICAL | Use `FOR UPDATE` in transaction |
| No rate limiting | HIGH | Add `express-rate-limit` etc. |
| Logging passwords/secrets | MEDIUM | Sanitize log output |

## Core Security Principles

1. **Defense in Depth** — Multiple security layers
2. **Least Privilege** — Grant only the minimum required permissions
3. **Fail Securely** — Errors must not expose data
4. **Distrust Input** — Validate and sanitize everything
5. **Regular Updates** — Keep dependencies up to date

## Pre-Deployment Security Checklist

- [ ] Secrets: No hardcoding, all in environment variables
- [ ] Input validation: All user input validated
- [ ] SQL injection: All queries use parameterized queries / prepared statements
- [ ] XSS: User content sanitized
- [ ] CSRF: Protection enabled
- [ ] Authentication: Proper token handling
- [ ] Authorization: Role checks enforced
- [ ] Rate limiting: Enabled on all endpoints
- [ ] HTTPS: Enforced in production
- [ ] Security headers: CSP, X-Frame-Options configured
- [ ] Error handling: No sensitive data in errors
- [ ] Logging: No sensitive data logged
- [ ] Dependencies: Up to date, no vulnerabilities
- [ ] CORS: Properly configured
- [ ] Backups: Scheduled and verified
