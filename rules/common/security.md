# Security Guidelines

## Pre-Merge Security Checklist

Before merging to main branch:
- [ ] No hardcoded secrets (API keys, passwords, tokens, connection strings)
- [ ] User inputs validated at system boundaries (API endpoints, form handlers, file uploads)
- [ ] SQL/NoSQL injection prevention (parameterized queries or ORM)
- [ ] XSS prevention (output encoding, context-aware sanitization)
- [ ] Authentication and authorization verified on protected endpoints
- [ ] Error messages don't expose internal details (stack traces, query structure, file paths)

## Secret Management

- NEVER commit secrets to source code or version control
- Use environment variables or a dedicated secret manager (Vault, AWS Secrets Manager, etc.)
- Validate that required secrets are present at application startup — fail fast if missing
- Rotate any secrets that may have been exposed; treat exposure as an incident

## Security Risk Tiers

**CRITICAL — Fix immediately, block merge:**
- Hardcoded secrets or credentials in code
- SQL/NoSQL injection vulnerabilities
- Authentication bypass
- Unvalidated file uploads allowing arbitrary execution

**HIGH — Fix before merge:**
- Missing input validation on user-facing endpoints
- XSS vulnerabilities
- Missing authorization checks on sensitive operations
- Sensitive data logged or exposed in error responses

**MEDIUM — Track and fix promptly:**
- Missing rate limiting on public endpoints
- CSRF protection gaps
- Overly permissive CORS configuration
- Dependencies with known vulnerabilities

## Dependency Security

- Audit dependencies regularly for known vulnerabilities
- Pin dependency versions in production; avoid floating ranges
- Review new dependencies before adding — check maintenance status, download counts, known issues
