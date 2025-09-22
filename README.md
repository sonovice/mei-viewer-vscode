# MEI Viewer

Live preview of MEI files rendered with Verovio.

## Features

- Open `.mei` files with the custom preview (Command: “Open MEI Preview”).
- Live updates as you edit the MEI source.
- Click elements in the preview to jump to the corresponding `xml:id` in the source.
- Highlight selection from the editor in the preview.
- Zoom controls; settings are persisted between sessions.
- Project-specific Verovio settings via `.vscode/mei-viewer.config.js`.

## Quick start

Open an `.mei` file and run “Open MEI Preview” (from the title bar or Command Palette).

## Project settings (Verovio)

1. Click the “Options…” button in the preview toolbar to create/open the project settings.
2. Edit the generated file to adjust engraving/layout options. Save to apply — all open previews reload automatically.

- Some layout-related options are handled automatically by the viewer and ignored from this file:
  - `pageWidth`, `pageHeight`, `pageMarginTop`, `pageMarginBottom`, `pageMarginLeft`, `pageMarginRight`, `scaleToPageSize`, `adjustPageHeight`, `scale`.

## Commands

- `mei-viewer.openPreview`: Opens the MEI preview for the current file.

## Settings

- `meiViewer.enableDebugLogging` (boolean): Enables verbose logging for troubleshooting.

## License

MIT
