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

// --- Task Runner for file-based tasks ---
async function runFileTask(task, directory, sendProgress) {
    const taskTimes = [];
    let taskFilesProcessed = 0;

    for (const file of task.files) {
        const fileStart = Date.now();
        try {
            const statusMessage = await task.action(file, directory, task.extra);
            taskFilesProcessed++;
            const fileEnd = Date.now();
            taskTimes.push(fileEnd - fileStart);

            const avgTaskTime = taskTimes.reduce((a, b) => a + b, 0) / taskTimes.length;
            const taskETR = formatETR((task.files.length - taskFilesProcessed) * avgTaskTime);

            sendProgress({
                statusMessage: `${path.basename(file)}: ${statusMessage}`,
                taskProgress: (taskFilesProcessed / task.files.length) * 100,
                taskETR,
                taskCount: taskFilesProcessed,
                taskTotal: task.files.length,
            });
        } catch (error) {
            sendProgress({ statusMessage: `ERROR processing ${path.basename(file)}: ${error.message}` });
        }
    }
}

// --- IPC Handlers ---

ipcMain.handle('select-dir', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openDirectory']
  });
  return canceled ? null : filePaths[0];
});

ipcMain.on('run-tools', async (event, options) => {
    const { directory, convertToWav, deleteSourceFiles, normalizeWav, updateLnk } = options;
    const sendProgress = (data) => win.webContents.send('progress-update', data);
    const sendFinished = () => win.webContents.send('processing-finished');

    try {
        const ffmpegAvailable = await checkFfmpeg();
        if (!ffmpegAvailable) {
            sendProgress({ statusMessage: 'FFmpeg check failed. Aborting.' });
            return;
        }

        // --- Define File-Based Tasks ---
        const fileTasks = [];
        if (convertToWav) {
            const files = findFiles(directory, ['.mp3', '.ogg']).filter(f => !fs.existsSync(path.join(path.dirname(f), `${path.parse(f).name}.wav`)));
            if (files.length > 0) fileTasks.push({ name: 'Convert to .wav', files, action: convertFileToWav, extra: { deleteSourceFiles } });
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
            if (files.length > 0) fileTasks.push({ name: 'Normalize .wav volume', files, action: normalizeFile, extra: { logFilePath } });
        }

        // --- Determine Total Tasks ---
        let totalTasks = fileTasks.length + (updateLnk ? 1 : 0);
        if (totalTasks === 0) {
            sendProgress({ statusMessage: 'No files to process.' });
            return;
        }

        // --- Send Initial Progress ---
        sendProgress({
            statusMessage: 'Starting processing...',
            overallProgress: 0,
            overallCount: 0,
            overallTotal: totalTasks,
            taskName: 'Waiting...',
            taskProgress: 0,
            taskCount: 0,
            taskTotal: 0,
            taskETR: ''
        });

        let tasksCompleted = 0;

        // --- Run File-Based Tasks ---
        for (const task of fileTasks) {
            sendProgress({ taskName: task.name, taskProgress: 0, taskCount: 0, taskTotal: task.files.length, taskETR: '' });
            await runFileTask(task, directory, sendProgress);
            tasksCompleted++;
            sendProgress({
                overallProgress: (tasksCompleted / totalTasks) * 100,
                overallCount: tasksCompleted,
                overallTotal: totalTasks,
            });
        }

        // --- Defer Link Task Planning and Execution ---
        if (updateLnk) {
            const linkFiles = findFiles(directory, ['.lnk']);
            if (linkFiles.length > 0) {
                sendProgress({ taskName: 'Update .lnk shortcuts', taskProgress: 0, taskCount: 0, taskTotal: 1, taskETR: '' });
                try {
                    const statusMessage = await runUpdateLnkScript(directory);
                    sendProgress({ statusMessage, taskProgress: 100, taskCount: 1, taskTotal: 1, taskETR: '' });
                } catch (error) {
                    sendProgress({ statusMessage: `ERROR running task Update .lnk shortcuts: ${error.message}` });
                }
            } else {
                sendProgress({ statusMessage: 'Skipping shortcut update: No .lnk files found.'});
                totalTasks--; // Decrement total since this task was skipped
            }
            tasksCompleted++;
            sendProgress({
                overallProgress: (tasksCompleted / totalTasks) * 100,
                overallCount: tasksCompleted,
                overallTotal: totalTasks,
            });
        }

        sendProgress({ statusMessage: 'All tasks complete.' });

    } catch (error) {
        sendProgress({ statusMessage: `A critical error occurred: ${error.message}` });
    } finally {
        sendFinished(); // Always re-enable the UI
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
    return new Promise((resolve, reject) => {
        const { logFilePath } = extra;
        const backupRoot = path.join(directory, 'normbackup');
        const relPath = path.relative(directory, path.dirname(file));
        const backupDir = path.join(backupRoot, relPath);
        if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

        const backupFile = path.join(backupDir, path.basename(file));
        fs.renameSync(file, backupFile);

        const args = ['-i', backupFile, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', file];
        execFile(ffmpegPath, args, (error) => {
            if (error) {
                fs.renameSync(backupFile, file); // Restore on failure
                reject(error);
            } else {
                fs.appendFileSync(logFilePath, file + '\n');
                resolve('Normalized');
            }
        });
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