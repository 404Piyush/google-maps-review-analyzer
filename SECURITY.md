# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.2.x   | Yes                |
| 1.1.x   | Yes                |
| < 1.1.0 | No                 |

## Reporting a Vulnerability

**Please don't open public GitHub issues for security bugs.**

Email: **piyushutkar123@gmail.com**

Include:
- Affected version (commit SHA if possible)
- Reproduction steps
- Impact assessment

I aim to acknowledge within 48 hours and patch within 7 days for critical issues.

## Threat Model Notes

This project intentionally bypasses Google's anti-bot protections. Users should:

- **Use dedicated rotating proxies** — never your home IP
- **Respect Google's ToS** — see the Ethics & ToS section in the README
- **Keep `proxies.txt` and `.env` out of git** — both are in `.gitignore`
- **Rotate proxy credentials** if shared publicly

Dependencies are tracked via Dependabot (`.github/dependabot.yml`); critical updates are released as patch versions.
