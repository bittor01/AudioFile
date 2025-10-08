const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, execFile } = require('child_process');

const ffmpegPath = require('ffmpeg-static');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 800,
    height: 850,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- Helper Functions ---

function formatETR(ms) {
    if (!ms || ms <= 0 || !isFinite(ms)) return '';
    const totalSeconds = Math.round(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    let parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
    return `ETR: ${parts.join(' ')}`;
}

function findFiles(dir, extensions) {
    let files = [];
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
            if (item.name !== 'normbackup') {
                files = files.concat(findFiles(fullPath, extensions));
            }
        } else if (extensions.includes(path.extname(item.name).toLowerCase())) {
            files.push(fullPath);
        }
    }
    return files;
}

// --- IPC Handlers ---

ipcMain.handle('select-dir', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openDirectory']
  });
  return canceled ? null : filePaths[0];
});

ipcMain.on('run-tools', async (event, options) => {
    const { directory, convertToWav, deleteSourceFiles, normalizeWav, useBackups, updateLnk } = options;
    const sendProgress = (data) => win.webContents.send('progress-update', data);
    const sendFinished = () => win.webContents.send('processing-finished');

    try {
        const ffmpegAvailable = await checkFfmpeg();
        if (!ffmpegAvailable) {
            sendProgress({ statusMessage: 'FFmpeg check failed. Aborting.' });
            return;
        }

        // --- Define All Potential Tasks ---
        const allTasks = [];
        if (convertToWav) {
            const files = findFiles(directory, ['.mp3', '.ogg']).filter(f => !fs.existsSync(path.join(path.dirname(f), `${path.parse(f).name}.wav`)));
            if (files.length > 0) allTasks.push({ name: 'Convert to .wav', files, action: convertFileToWav, extra: { deleteSourceFiles } });
        }
        if (normalizeWav) {
            const logFilePath = path.join(directory, '.normalized_files.log');
            let normalizedFiles = new Set();
            if (fs.existsSync(logFilePath)) {
                const logContent = fs.readFileSync(logFilePath, 'utf-8').split('\n').filter(Boolean);
                const cleanedLog = logContent.filter(fs.existsSync);
                cleanedLog.forEach(f => normalizedFiles.add(f));
                if (cleanedLog.length < logContent.length) fs.writeFileSync(logFilePath, cleanedLog.join('\n') + '\n');
            }
            const files = findFiles(directory, ['.wav']).filter(f => !normalizedFiles.has(f));
            if (files.length > 0) allTasks.push({ name: 'Normalize .wav volume', files, action: normalizeFile, extra: { logFilePath, useBackups } });
        }
        if (updateLnk) {
            const linkFiles = findFiles(directory, ['.lnk']);
            if (linkFiles.length > 0) {
                 allTasks.push({ name: 'Update .lnk shortcuts', files: [directory], action: runUpdateLnkScript });
            }
        }

        if (allTasks.length === 0) {
            sendProgress({ statusMessage: 'No files to process.' });
            return;
        }

        sendProgress({
            statusMessage: 'Starting processing...',
            overallProgress: 0,
            overallCount: 0,
            overallTotal: allTasks.length,
            taskName: 'Waiting...',
            taskProgress: 0,
            taskCount: 0,
            taskTotal: 0,
            taskETR: ''
        });

        let tasksStarted = 0;

        for (const task of allTasks) {
            tasksStarted++;
            const overallPayload = {
                overallProgress: (tasksStarted / allTasks.length) * 100,
                overallCount: tasksStarted,
                overallTotal: allTasks.length,
                taskName: task.name,
                taskTotal: task.files.length,
            };
            sendProgress(overallPayload);

            const taskTimes = [];
            let taskFilesStarted = 0;

            for (const file of task.files) {
                taskFilesStarted++;

                const progressPayload = {
                    ...overallPayload,
                    taskProgress: (taskFilesStarted / task.files.length) * 100,
                    taskCount: taskFilesStarted,
                };

                sendProgress({
                    ...progressPayload,
                    statusMessage: `Starting: ${path.basename(file)}`,
                    taskETR: '',
                });

                const fileStart = Date.now();
                try {
                    const statusMessage = await task.action(file, directory, task.extra);
                    const fileEnd = Date.now();
                    taskTimes.push(fileEnd - fileStart);

                    const avgTaskTime = taskTimes.reduce((a, b) => a + b, 0) / taskTimes.length;
                    const taskETR = formatETR((task.files.length - taskFilesStarted) * avgTaskTime);

                    sendProgress({
                        ...progressPayload,
                        statusMessage: `${path.basename(file)}: ${statusMessage}`,
                        taskETR: taskETR,
                    });
                } catch (error) {
                    sendProgress({
                        ...progressPayload,
                        statusMessage: `ERROR processing ${path.basename(file)}: ${error.message}`
                    });
                }
            }
        }

        sendProgress({ statusMessage: 'All tasks complete.' });

    } catch (error) {
        sendProgress({ statusMessage: `A critical error occurred: ${error.message}` });
    } finally {
        sendFinished();
    }
});


// --- Tool Implementations ---

function checkFfmpeg() {
    return new Promise((resolve) => {
        exec(`"${ffmpegPath}" -version`, (error) => {
            if (error) {
                dialog.showErrorBox('FFmpeg Not Found', 'FFmpeg is required for this application to work. Please install it from the official website.');
                shell.openExternal('https://ffmpeg.org/download.html');
                resolve(false);
            } else {
                resolve(true);
            }
        });
    });
}

function convertFileToWav(file, directory, extra) {
    const { deleteSourceFiles } = extra;
    return new Promise((resolve, reject) => {
        const wavFile = path.join(path.dirname(file), `${path.parse(file).name}.wav`);
        execFile(ffmpegPath, ['-i', file, wavFile], (error) => {
            if (error) {
                reject(error);
            } else {
                let message = 'Converted to .wav';
                if (deleteSourceFiles) {
                    try {
                        fs.unlinkSync(file);
                        message += ' and source file deleted.';
                    } catch (deleteError) {
                        message += ` but failed to delete source: ${deleteError.message}`;
                    }
                }
                resolve(message);
            }
        });
    });
}

function normalizeFile(file, directory, extra) {
    const { logFilePath, useBackups } = extra;
    const backupFile = useBackups
        ? path.join(directory, 'normbackup', path.relative(directory, file))
        : file + '.tmp_bak';

    const backupDir = path.dirname(backupFile);
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }

    try {
        fs.renameSync(file, backupFile);
    } catch (renameError) {
        return Promise.reject(renameError);
    }

    return new Promise((resolve, reject) => {
        const args = ['-i', backupFile, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', file];
        execFile(ffmpegPath, args, (error) => {
            if (error) {
                try {
                    fs.renameSync(backupFile, file); // Restore on failure
                } catch (restoreError) {
                     console.error(`CRITICAL: Could not restore backup for ${file}`, restoreError);
                }
                reject(error);
            } else {
                fs.appendFileSync(logFilePath, file + '\n');
                resolve('Normalized');
            }
        });
    }).finally(() => {
        if (!useBackups && fs.existsSync(backupFile)) {
            fs.unlinkSync(backupFile);
        }
    });
}

function runUpdateLnkScript(directory) {
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(__dirname, 'example', 'linktowav.ps1');
        if (!fs.existsSync(scriptPath)) {
            return reject(new Error('PowerShell script not found.'));
        }
        const ps = exec(`powershell.exe -ExecutionPolicy Bypass -File "${scriptPath}" -Path "${directory}"`);
        let output = '';
        ps.stdout.on('data', (data) => { output += data; });
        ps.stderr.on('data', (data) => { output += data; });
        ps.on('close', (code) => {
            if (code !== 0) reject(new Error(`PowerShell script failed: ${output}`));
            else resolve('Shortcut update script finished.');
        });
    });
}