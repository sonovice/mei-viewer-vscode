# Changelog

All notable changes to the "mei-viewer" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0]

### Added
- Project settings for Verovio via `.vscode/mei-viewer.config.js` (per workspace).
- "Options…" button in the MEI Preview toolbar to create/open the settings file.
- The preview automatically reloads all open scores when you save the settings file.

### Notes
- Some layout options are managed by the viewer for best results and are ignored from the settings file:
  - `pageWidth`, `pageHeight`, `pageMarginTop`, `pageMarginBottom`, `pageMarginLeft`, `pageMarginRight`, `scaleToPageSize`, `adjustPageHeight`, `scale`.

## [1.0.0] - 2025-09-22

### Added
- Initial release.