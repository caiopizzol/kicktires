# Changelog

## [0.8.0](https://github.com/caiopizzol/kicktires/compare/v0.7.0...v0.8.0) (2026-10-01)


### Features

* **worker:** run hub runners on one worker concurrently ([#66](https://github.com/caiopizzol/kicktires/issues/66)) ([657c97a](https://github.com/caiopizzol/kicktires/commit/657c97a451073936bccf072510e70ac39580c4cb))

## [0.7.0](https://github.com/caiopizzol/kicktires/compare/v0.6.2...v0.7.0) (2026-09-30)


### Features

* **codex:** pin CLI 0.159.2 and default to gpt-6.1-sol ([#64](https://github.com/caiopizzol/kicktires/issues/64)) ([9ba3a97](https://github.com/caiopizzol/kicktires/commit/9ba3a979a24a621e32d0b61912fd9c3559260ac6))


### Bug Fixes

* **codex:** correct a final report sent before any tool ran ([#63](https://github.com/caiopizzol/kicktires/issues/63)) ([6f44af9](https://github.com/caiopizzol/kicktires/commit/6f44af922b187e34377b83acf93490ef63c214d8))
* **review:** keep missing toolchains and unread Action source out of gaps ([#61](https://github.com/caiopizzol/kicktires/issues/61)) ([65b73bc](https://github.com/caiopizzol/kicktires/commit/65b73bc5b966d0a7fab67c94f3ec45e754ded81b))

## [0.6.2](https://github.com/caiopizzol/kicktires/compare/v0.6.1...v0.6.2) (2026-09-28)


### Bug Fixes

* **codex:** retry model calls that fail for transient provider reasons ([#59](https://github.com/caiopizzol/kicktires/issues/59)) ([d130346](https://github.com/caiopizzol/kicktires/commit/d1303469c9c3740be6be3ee121a46e52969e9f55))

## [0.6.1](https://github.com/caiopizzol/kicktires/compare/v0.6.0...v0.6.1) (2026-09-28)


### Bug Fixes

* **github:** accept a review GitHub creates while answering 422 ([#56](https://github.com/caiopizzol/kicktires/issues/56)) ([5e838dc](https://github.com/caiopizzol/kicktires/commit/5e838dc1cb935d7316c65f0098afcf5410a2e622))
* **review:** ignore diff anchors cited as finding evidence ([#54](https://github.com/caiopizzol/kicktires/issues/54)) ([701cec0](https://github.com/caiopizzol/kicktires/commit/701cec0f70f17a50dd88708a6920da81a44f2a99))

## [0.6.0](https://github.com/caiopizzol/kicktires/compare/v0.5.2...v0.6.0) (2026-09-28)


### Features

* **sandbox:** include poppler in the review image ([#50](https://github.com/caiopizzol/kicktires/issues/50)) ([2cde2c2](https://github.com/caiopizzol/kicktires/commit/2cde2c2704b5d4d451a901f0552ed919fae89405))


### Bug Fixes

* **github:** retry incomplete reviews on rerun ([#48](https://github.com/caiopizzol/kicktires/issues/48)) ([d303811](https://github.com/caiopizzol/kicktires/commit/d303811763efc179a25ef7c8cf98db160b0e18ce))

## [0.5.2](https://github.com/caiopizzol/kicktires/compare/v0.5.1...v0.5.2) (2026-09-27)


### Bug Fixes

* **agent:** raise the per-review output token limit to 64000 ([#46](https://github.com/caiopizzol/kicktires/issues/46)) ([bbcf4c4](https://github.com/caiopizzol/kicktires/commit/bbcf4c497a22c500c790f8c2ec613043ec500443))

## [0.5.1](https://github.com/caiopizzol/kicktires/compare/v0.5.0...v0.5.1) (2026-09-27)


### Bug Fixes

* **github:** let reviews use their full reviewSeconds on workers ([#44](https://github.com/caiopizzol/kicktires/issues/44)) ([95dc9e2](https://github.com/caiopizzol/kicktires/commit/95dc9e24c04950ecfaa8b3357c7bb4fb110cafe1))

## [0.5.0](https://github.com/caiopizzol/kicktires/compare/v0.4.0...v0.5.0) (2026-09-25)


### Features

* **github:** let writers decline findings in their threads ([#43](https://github.com/caiopizzol/kicktires/issues/43)) ([e829971](https://github.com/caiopizzol/kicktires/commit/e829971ec2a5b12a5a9bc3dc51148586dbe2f859))


### Bug Fixes

* **github:** trust only the configured reviewer's review on the head ([#41](https://github.com/caiopizzol/kicktires/issues/41)) ([f41cdc3](https://github.com/caiopizzol/kicktires/commit/f41cdc3a94c177b4331fdbcdd04b7751a1b0dfe5))

## [0.4.0](https://github.com/caiopizzol/kicktires/compare/v0.3.0...v0.4.0) (2026-09-24)


### Features

* **setup:** default reviews to gpt-6-sol at xhigh ([#40](https://github.com/caiopizzol/kicktires/issues/40)) ([99e3ed2](https://github.com/caiopizzol/kicktires/commit/99e3ed2826302be8f89a24644e95dc81b43f6849))


### Bug Fixes

* **agent:** restrict skill loading to trusted catalog ([de6d610](https://github.com/caiopizzol/kicktires/commit/de6d6103bb610447e308d7f80be24234a7be491c))
* **codex:** configure response deadlines ([#35](https://github.com/caiopizzol/kicktires/issues/35)) ([638aa6f](https://github.com/caiopizzol/kicktires/commit/638aa6f60a4dea941a60d911797d6a3f922cb201))
* **codex:** isolate reviewer skill catalogs ([#37](https://github.com/caiopizzol/kicktires/issues/37)) ([728ef47](https://github.com/caiopizzol/kicktires/commit/728ef476f40f78563682a2274f384086e4b11481))
* **codex:** pin CLI 0.156.1 for current model catalog ([#38](https://github.com/caiopizzol/kicktires/issues/38)) ([28525c2](https://github.com/caiopizzol/kicktires/commit/28525c2a5813143c5b2d6f52f7f814b9728a36ff))

## [0.3.0](https://github.com/caiopizzol/kicktires/compare/v0.2.0...v0.3.0) (2026-09-12)


### ⚠ BREAKING CHANGES

* **config:** simplify Codex profiles ([#26](https://github.com/caiopizzol/kicktires/issues/26))

### Features

* **setup:** guide GitHub and worker onboarding ([#33](https://github.com/caiopizzol/kicktires/issues/33)) ([7b0d2ec](https://github.com/caiopizzol/kicktires/commit/7b0d2ec6562bdaf8f870fbfe8cd876167ffb1919))


### Code Refactoring

* **config:** simplify Codex profiles ([#26](https://github.com/caiopizzol/kicktires/issues/26)) ([f220a9b](https://github.com/caiopizzol/kicktires/commit/f220a9bc079d5e8462c0cde7ef570060e969fc17))

## [0.2.0](https://github.com/caiopizzol/kicktires/compare/v0.1.0...v0.2.0) (2026-09-11)


### Features

* **release:** automate version PRs and add release badge ([#22](https://github.com/caiopizzol/kicktires/issues/22)) ([75bc3d1](https://github.com/caiopizzol/kicktires/commit/75bc3d1781f4a4b146f6842dacded91f3b6d370c))


### Bug Fixes

* **release:** derive Codex client version from package ([#25](https://github.com/caiopizzol/kicktires/issues/25)) ([93b14af](https://github.com/caiopizzol/kicktires/commit/93b14af520415213114a998d5c4284efb9c094a1))
* **release:** preserve generated changelog formatting ([#24](https://github.com/caiopizzol/kicktires/issues/24)) ([b3d395f](https://github.com/caiopizzol/kicktires/commit/b3d395fab6fb5c9e3f677b244b9ee92d62987f56))
