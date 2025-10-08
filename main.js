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
    const { directory, convertToWav, deleteSourceFiles, normalizeWav, updateLnk } = options;
    const sendProgress = (data) => win.webContents.send('progress-update', data);

    try {
        const ffmpegAvailable = await checkFfmpeg();
        if (!ffmpegAvailable) {
            sendProgress({ statusMessage: 'FFmpeg check failed. Aborting.' });
            return;
        }

        sendProgress({ statusMessage: 'Planning tasks...', overallProgress: 0, taskProgress: 0, taskName: 'Planning' });

        const tasks = [];
        if (convertToWav) {
            const files = findFiles(directory, ['.mp3', '.ogg']).filter(f => !fs.existsSync(path.join(path.dirname(f), `${path.parse(f).name}.wav`)));
            if (files.length > 0) tasks.push({ name: 'Convert to .wav', files, action: convertFileToWav, extra: { deleteSourceFiles } });
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
            if (files.length > 0) tasks.push({ name: 'Normalize .wav volume', files, action: normalizeFile, extra: { logFilePath } });
        }
        if (updateLnk) {
            const files = findFiles(directory, ['.lnk']);
            if (files.length > 0) tasks.push({ name: 'Update .lnk shortcuts', files: [directory], action: runUpdateLnkScript });
        }

        const totalTasks = tasks.length;
        if (totalTasks === 0) {
            sendProgress({ statusMessage: 'No files to process.' });
            return;
        }

        let tasksCompleted = 0;

        for (const task of tasks) {
            const taskTimes = [];
            let taskFilesProcessed = 0;

            // Initial progress update for the current task
            sendProgress({
                overallProgress: (tasksCompleted / totalTasks) * 100,
                overallCount: tasksCompleted,
                overallTotal: totalTasks,
                taskName: task.name,
                taskProgress: 0,
                taskCount: 0,
                taskTotal: task.files.length,
            });

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
            tasksCompleted++;
        }
        sendProgress({
            statusMessage: 'All tasks complete.',
            overallProgress: 100,
            overallCount: totalTasks,
            overallTotal: totalTasks,
            taskProgress: 100,
            taskName: 'Done',
            taskETR: '',
        });
    } catch (error) {
        sendProgress({ statusMessage: `A critical error occurred: ${error.message}` });
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