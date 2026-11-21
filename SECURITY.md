# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| `2.5.x` | Yes       |
| `< 2.5` | Please upgrade to the latest release |

## Security Practices

- **Local Credentials Storage**: Live MySQL connection profiles are saved locally in `data/connections.json`, which is ignored by `.gitignore` and `.dockerignore`. Never commit your `data/` directory to a public repository.
- **API Masking**: `/api/mysql/status` and `/api/mysql/profiles` never return raw database passwords back to the browser UI (`hasPassword: true/false` only).
- **Cloud Deployments**: When deploying EKONI SQL Studio to a public cloud host (Render, Railway, Fly.io), protect your instance behind authentication/VPN if connecting it to production databases.

## Reporting a Vulnerability

If you discover a security vulnerability, please **do not** open a public issue. Instead, report it privately via GitHub Security Advisories (**Security → Advisories → Report a vulnerability**) with reproduction steps.
