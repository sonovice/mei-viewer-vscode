# Changelog

All notable changes to the "mei-viewer" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.3] - 2026-02-13

### Fixed
- Options button not working on Windows due to `import()` failing on Windows file paths.
- SMuFL glyphs in text not rendering due to Content Security Policy blocking base64-embedded fonts.
- Extension disabling XML syntax highlighting in `.mei` files.
- Score not scrollable when taller than the viewport (e.g. orchestral scores).

## [1.2.2] - 2025-09-23

### Fixed
- Packaged extension bundles a vendored `yaml.mjs` to avoid module resolution issues in some environments.

## [1.2.1] - 2025-09-22

### Fixed
- Ensure packaged extension activates reliably; commands are now available after install.

## [1.2.0] - 2025-09-22

### Added
- Highlighting of elements on hover.

### Changed
- File format for settings changed from JS to YAML.

## [1.1.0] - 2025-09-22

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