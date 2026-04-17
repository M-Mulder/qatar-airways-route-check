# Security

This project talks to **your own** database and optional third-party services (e.g. Serper, Google CSE) using secrets you configure. Never commit real API keys, `CRON_SECRET`, or production `DATABASE_URL` values.

## Reporting a vulnerability

- Prefer **[GitHub private vulnerability reporting](https://docs.github.com/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)** for this repository if it is enabled.
- Otherwise open a **minimal** public issue describing impact and reproduction, without embedding live credentials.

We will treat valid reports seriously and coordinate a fix and disclosure timeline when possible.
