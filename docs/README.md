# HaalKhata documentation

| Page | What it covers |
| --- | --- |
| [Getting started](getting-started.md) | Run the web app and the mobile app locally; configuration; receipt AI providers |
| [Self-hosting](self-hosting.md) | The production Docker stack, Apple/Google sign-in, phone verification, what to check before pointing a domain at it |
| [App Store release handoff](mobile-app-store-readiness.md) | Implemented release changes and the ordered Apple/Expo/backend/TestFlight checklist |
| [Original mobile audit](audits/mobile-ios-2026-10-05.md) | Historical findings before the release implementation |
| [Build security patches](build-security-patches.md) | The fail-closed dependency gate, how build-tool advisories were resolved, and how to add or remove a local mitigation |
| [Development](development.md) | Architecture and layering, schema migrations, the quality gates CI runs |
| [Find friends from contacts](contact-discovery.md) | Who can be found, what is stored, limits, and how to run and verify contact matching locally |
| [iPhone and iPad welcome and onboarding](mobile-onboarding.md) | The signed-out welcome screen, who sees which setup step, the App Review rules they follow, and how to run and verify them |
| [Backend services](backend/README.md) | Service-by-service reference for the eleven ConnectRPC services |
| [`ops/README.md`](../ops/README.md) | Server runbook: bootstrap, secret rotation, encrypted backups, restore drill |
| [`AGENTS.md`](../AGENTS.md) | Conventions every contributor and AI agent follows |
