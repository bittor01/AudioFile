const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, execFile } = require('child_process');

const ffmpegPath = require('ffmpeg-static');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // Enforce security best practices
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// --- IPC Handlers ---

ipcMain.handle('select-dir', async () => {
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory']
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.on('run-tools', async (event, options) => {
    const { directory, convertToWav, normalizeWav, updateLnk } = options;
    const sendStatus = (message) => win.webContents.send('status-update', message);

    try {
        sendStatus('Checking for FFmpeg...');
        const ffmpegAvailable = await checkFfmpeg();
        if (!ffmpegAvailable) {
            sendStatus('FFmpeg check failed. Aborting.');
            return;
        }
        sendStatus('FFmpeg found.');

        if (convertToWav) {
            await runConvertToWav(directory, sendStatus);
        }
        if (normalizeWav) {
            await runNormalizeWav(directory, sendStatus);
        }
        if (updateLnk) {
            await runUpdateLnk(directory, sendStatus);
        }
        sendStatus('All tasks complete.');
    } catch (error) {
        sendStatus(`Error: ${error.message}`);
    }
});


// --- Tool Implementations ---

function checkFfmpeg() {
    return new Promise((resolve) => {
        exec(`"${ffmpegPath}" -version`, (error) => {
            if (error) {
                dialog.showErrorBox(
                    'FFmpeg Not Found',
                    'FFmpeg is required for this application to work. Please install it from the official website.'
                );
                shell.openExternal('https://ffmpeg.org/download.html');
                resolve(false);
            } else {
                resolve(true);
            }
        });
    });
}

async function runConvertToWav(directory, sendStatus) {
    sendStatus('Starting: Convert to .wav');
    const files = findFiles(directory, ['.mp3', '.ogg']);
    for (const file of files) {
        const wavFile = path.join(path.dirname(file), `${path.parse(file).name}.wav`);
        if (!fs.existsSync(wavFile)) {
            sendStatus(`Converting ${file} to .wav`);
            await new Promise((resolve, reject) => {
                execFile(ffmpegPath, ['-i', file, wavFile], (error) => {
                    if (error) reject(error);
                    else resolve();
                });
            });
        } else {
            sendStatus(`Skipping ${wavFile} (already exists)`);
        }
    }
    sendStatus('Finished: Convert to .wav');
}

async function runNormalizeWav(directory, sendStatus) {
    sendStatus('Starting: Normalize .wav volume');
    const backupRoot = path.join(directory, 'normbackup');
    if (!fs.existsSync(backupRoot)) {
        fs.mkdirSync(backupRoot, { recursive: true });
    }

    const files = findFiles(directory, ['.wav']);
    for (const file of files) {
        if (path.dirname(file).includes(backupRoot)) continue;

        sendStatus(`Processing ${file}`);
        const relPath = path.relative(directory, path.dirname(file));
        const backupDir = path.join(backupRoot, relPath);
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }

        const backupFile = path.join(backupDir, path.basename(file));
        fs.renameSync(file, backupFile);

        await new Promise((resolve, reject) => {
            const args = ['-i', backupFile, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', file];
            execFile(ffmpegPath, args, (error) => {
                if (error) {
                    fs.renameSync(backupFile, file);
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    }
    sendStatus('Finished: Normalize .wav volume');
}

async function runUpdateLnk(directory, sendStatus) {
    sendStatus('Starting: Update .lnk shortcuts');
    const scriptPath = path.join(__dirname, 'example', 'linktowav.ps1');

    if (!fs.existsSync(scriptPath)) {
        throw new Error(`PowerShell script not found at ${scriptPath}. Ensure it is included in the build.`);
    }

    await new Promise((resolve, reject) => {
        const ps = exec(`powershell.exe -ExecutionPolicy Bypass -File "${scriptPath}" -Path "${directory}"`);

        ps.stdout.on('data', (data) => {
            sendStatus(data.toString());
        });
        ps.stderr.on('data', (data) => {
            sendStatus(`ERROR: ${data.toString()}`);
        });
        ps.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`PowerShell script exited with code ${code}`));
            } else {
                resolve();
            }
        });
    });
    sendStatus('Finished: Update .lnk shortcuts');
}

function findFiles(dir, extensions) {
    let files = [];
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
            if (item.name === 'normbackup' && path.resolve(dir) === path.resolve(path.dirname(fullPath), '..')) continue;
            files = files.concat(findFiles(fullPath, extensions));
        } else if (extensions.includes(path.extname(item.name).toLowerCase())) {
            files.push(fullPath);
        }
    }
    return files;
}