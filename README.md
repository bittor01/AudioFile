# Audio File Tools

This is a desktop application built with Electron that provides a suite of tools for processing audio files in a selected directory and its subdirectories.

## Features

- **Convert to .wav:** Recursively finds `.mp3` and `.ogg` files and converts them to `.wav` format using `ffmpeg`.
- **Normalize .wav Volume:** Recursively finds `.wav` files and normalizes their volume to a standard level (`I=-16:TP=-1.5:LRA=11`). Original files are backed up in a `normbackup` folder.
- **Update .lnk Shortcuts:** Updates Windows `.lnk` shortcuts that point to `.mp3` files to point to the newly created `.wav` files.
- **Dark Mode UI:** A simple and clean user interface with a dark theme.
- **Packaged for Windows:** The application is configured to be built into a standalone Windows installer.

## How It Works

The tools are designed to run in a specific sequence to ensure correct processing:
1.  **Convert to .wav**
2.  **Normalize .wav Volume**
3.  **Update .lnk Shortcuts**

This order ensures that audio files are first converted to `.wav` before the normalization and shortcut-updating tools attempt to process them.

## Prerequisites

- **FFmpeg:** This application requires `ffmpeg` to be installed on your system and accessible from the command line. If `ffmpeg` is not found, the application will display an error message with a link to the official download page.

## Getting Started

### Running from Source

1.  Clone the repository.
2.  Install the dependencies:
    ```bash
    npm install
    ```
3.  Start the application:
    ```bash
    npm start
    ```

### Building the Application

To create a distributable Windows installer, run the following command. The output will be in the `dist` directory.

```bash
npm run dist
```