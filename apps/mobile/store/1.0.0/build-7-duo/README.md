# iPhone Duo screenshots for build 7

Six English (U.S.) screenshots for the iPhone Duo slot of HaalKhata 1.0. Use the numbered PNGs in [screenshots](screenshots/) in filename order. [Preview all six](preview.png). The [manifest](manifest.json) lists the display, pixel dimensions and SHA-256 digest of each export.

The native views in [native](native/) were captured on the iPhone Duo iOS 27.2 simulator from the Duo code merged in PR #85. The outer screen used the phone layout; the inner screen was captured upright or wide. The demo data came from a disposable local copy of the store fixture, including the San Francisco dinner, Tahoe trip and Oakland brunch. No real payment or invitation was sent. Developer controls outside the source crops are not part of the exported artwork.

To reproduce the PNGs from the repository root with workspace dependencies installed:

    node scripts/app-store/render-duo-screenshots.mjs

The renderer reads the previously approved copy and receipt illustration, crops the new native views, then verifies pixel dimensions and opacity. The October 31 build 6 submission record is historical; the presence of these files does not establish that Apple has received build 7.
