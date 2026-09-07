# Security policy

HaalKhata handles money between friends, so a security report is the most
useful contribution anyone can make. Thank you for taking the time.

## Reporting a vulnerability

Please do not open a public issue for anything security-related.

Use GitHub's private reporting instead: open the **Security** tab of this
repository and choose **Report a vulnerability**. Only the maintainer can
read what you submit. You will get a reply once the report has been read,
and you will be kept informed as the fix progresses. If a report turns out
not to be a vulnerability, you will hear that too, with the reasoning.

A good report includes:

- what you found and where (a URL, an RPC name, or a file and line),
- steps to reproduce it, ideally against a local instance,
- what an attacker could do with it,
- anything you already know about a fix.

## Scope

In scope:

- the hosted service at `haalkhata.app`, including its API under
  `/api/connect`,
- the code in this repository: the web app, the API, the mobile app, and
  the deployment configuration under `ops/` and the compose files.

Out of scope:

- volume-based denial of service or load testing against `haalkhata.app`,
- social engineering of the maintainer or of users,
- issues in third-party services HaalKhata relies on (Google sign-in,
  Twilio, the receipt AI provider, Let's Encrypt), which should go to those
  vendors,
- reports that only restate output from an automated scanner without a
  reproducible impact.

## Testing safely

Please test against your own local instance whenever you can. The
[Getting started](docs/getting-started.md) guide brings one up in a few
minutes with a mock receipt scanner and no API keys. On `haalkhata.app`,
use only accounts you created and never interact with other people's data.
If you stumble on someone else's data while testing, stop, note what you
saw, and include it in the report.

Research carried out in good faith and within this policy is welcome. The
maintainer will not pursue action against you for it.

## Disclosure

Fixes ship in the next release, and `haalkhata.app` runs the latest
release, so a fix reaches every user at once. Once a fix is live, the
report can be disclosed. You are welcome to be credited by name in the
security advisory, or to stay anonymous, whichever you prefer. There is no
bug bounty at this time.

## Supported versions

Only the latest release is supported, and it is what `haalkhata.app` runs.
If you self-host, keep up with releases to receive security fixes.
