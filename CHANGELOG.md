# [1.1.0](https://github.com/Allan-Nava/nats-lens/compare/v1.0.1...v1.1.0) (2026-07-23)


### Features

* add Marketplace gallery banner and repo metadata ([c35ac85](https://github.com/Allan-Nava/nats-lens/commit/c35ac8562e8bf84dcb1a786fe301b85cfec3023e))

## [1.0.1](https://github.com/Allan-Nava/nats-lens/compare/v1.0.0...v1.0.1) (2026-07-23)


### Bug Fixes

* separate upload-release-asset steps for push-tag and release published events ([0b68c62](https://github.com/Allan-Nava/nats-lens/commit/0b68c6276437113012b30d579ed014cbcb96f0de))

# 1.0.0 (2026-07-23)


### Bug Fixes

* update changelog to include fix for `backlog-sync` workflow using `github.request` ([1fdc443](https://github.com/Allan-Nava/nats-lens/commit/1fdc443bac8f464956d9f3e6d6805f333cdb3fa0))


### Features

* add CI workflow and contributing guidelines ([318b1df](https://github.com/Allan-Nava/nats-lens/commit/318b1df89103eb10ec67fdfe16298618529344de))
* add GitHub Actions workflow to sync BACKLOG.md with Issues and Milestones ([993b1d9](https://github.com/Allan-Nava/nats-lens/commit/993b1d9d0aea9cc98abf49cf82bfc7e0015f09b7))
* add steps to create and upload VSIX release on GitHub ([1be3d40](https://github.com/Allan-Nava/nats-lens/commit/1be3d40f8d4d7adad1688c9088e28852bbc986a7))
* initialize NATS Lens extension with core functionality ([b3847f8](https://github.com/Allan-Nava/nats-lens/commit/b3847f819863685fe9f38af4a075b31a4abb7abe))

# Changelog

## Unreleased

- CI: Fix `backlog-sync` workflow to use `github.request` for listing milestones (prevents TypeError in actions/github-script)

## 0.1.0

- Connections view fed by `nats` CLI contexts (`~/.config/nats/context`), credentials never displayed.
- Connect/disconnect with status-bar indicator.
- JetStream browser: streams (messages, bytes, subjects) and consumers (pending, ack-pending).
- Subscribe with wildcards into per-subject Output channels; JSON pretty-printing, header display, binary detection.
- Publish and request-reply commands with subject validation.
