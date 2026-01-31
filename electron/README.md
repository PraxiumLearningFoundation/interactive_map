# Praxium Map Editor - Desktop Application

This folder contains the Electron configuration for packaging the admin editor as a standalone desktop application.

## Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run the application in development mode:
   ```bash
   npm start
   ```

## Building Distributables

Build installers for different platforms:

```bash
# Build for current platform
npm run dist

# Build for specific platforms
npm run dist:win    # Windows (.exe installer)
npm run dist:mac    # macOS (.dmg)
npm run dist:linux  # Linux (.AppImage)
```

Built packages will be output to the `dist/` folder.

## Application Features

- **File Menu**: Open, Save, and Save As for JSON organization data
- **Load Sample Data**: Quickly load the bundled sample dataset
- **Native File Dialogs**: Uses system file dialogs for opening/saving
- **Cross-Platform**: Works on Windows, macOS, and Linux

## Icons

Place application icons in the `icons/` folder:
- `icon.png` - 512x512 PNG (used for Linux and as source)
- `icon.ico` - Windows icon
- `icon.icns` - macOS icon

You can generate these from a PNG using tools like:
- [electron-icon-maker](https://www.npmjs.com/package/electron-icon-maker)
- [IconConverter](https://iconverticons.com/)
