const selectDirBtn = document.getElementById('select-dir');
const runBtn = document.getElementById('run-tools');
const selectedDirElem = document.getElementById('selected-dir');
const statusOutput = document.getElementById('status-output');

// Progress elements
const overallProgress = document.getElementById('overall-progress');
const overallCount = document.getElementById('overall-count');
const overallProgressLabel = document.querySelector('label[for="overall-progress"]');
const taskProgress = document.getElementById('task-progress');
const taskEtr = document.getElementById('task-etr');
const taskCount = document.getElementById('task-count');
const taskProgressLabel = document.querySelector('label[for="task-progress"]');

let logMessages = [];
const MAX_LOG_LINES = 8;

// Local storage key for saving UI settings
const SETTINGS_STORAGE_KEY = 'audioFileToolsSettings';

function loadSettings() {
    try {
        const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
        if (saved) {
            const settings = JSON.parse(saved);
            if (settings.convertToTarget !== undefined) {
                document.getElementById('convert-to-target').checked = settings.convertToTarget;
            }
            if (settings.outputFormat !== undefined) {
                document.getElementById('output-format').value = settings.outputFormat;
            }
            if (settings.deleteSourceFiles !== undefined) {
                document.getElementById('delete-source-files').checked = settings.deleteSourceFiles;
            }
            if (settings.normalizeAudio !== undefined) {
                document.getElementById('normalize-audio').checked = settings.normalizeAudio;
            }
            if (settings.useBackups !== undefined) {
                document.getElementById('use-backups').checked = settings.useBackups;
            }
            if (settings.updateLnk !== undefined) {
                document.getElementById('update-lnk').checked = settings.updateLnk;
            }
        }
    } catch (e) {
        console.error('Error loading settings from localStorage:', e);
    }
}

function saveSettings() {
    try {
        const settings = {
            convertToTarget: document.getElementById('convert-to-target').checked,
            outputFormat: document.getElementById('output-format').value,
            deleteSourceFiles: document.getElementById('delete-source-files').checked,
            normalizeAudio: document.getElementById('normalize-audio').checked,
            useBackups: document.getElementById('use-backups').checked,
            updateLnk: document.getElementById('update-lnk').checked,
        };
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
        console.error('Error saving settings to localStorage:', e);
    }
}

// Restore saved settings on initial load and attach listeners
loadSettings();
['convert-to-target', 'output-format', 'delete-source-files', 'normalize-audio', 'use-backups', 'update-lnk'].forEach(id => {
    const elem = document.getElementById(id);
    if (elem) {
        elem.addEventListener('change', saveSettings);
    }
});

selectDirBtn.addEventListener('click', async () => {
    const path = await window.electronAPI.selectDir();
    if (path) {
        selectedDirElem.innerText = path;
    }
});

runBtn.addEventListener('click', () => {
    saveSettings();
    const options = {
        convertToTarget: document.getElementById('convert-to-target').checked,
        outputFormat: document.getElementById('output-format').value,
        deleteSourceFiles: document.getElementById('delete-source-files').checked,
        normalizeAudio: document.getElementById('normalize-audio').checked,
        useBackups: document.getElementById('use-backups').checked,
        updateLnk: document.getElementById('update-lnk').checked,
        directory: selectedDirElem.innerText
    };

    if (!options.directory) {
        statusOutput.textContent = 'Please select a directory first.';
        return;
    }

    // Disable button to prevent multiple runs
    runBtn.disabled = true;
    runBtn.innerText = 'Processing...';

    // Reset UI
    logMessages = [];
    statusOutput.textContent = '';
    overallProgress.value = 0;
    taskProgress.value = 0;
    taskEtr.innerText = '';
    overallCount.innerText = '';
    taskCount.innerText = '';
    overallProgressLabel.innerText = 'Overall Progress';
    taskProgressLabel.innerText = 'Task Progress';

    window.electronAPI.runTools(options);
});

window.electronAPI.onProgressUpdate((data) => {
    const {
        statusMessage,
        overallProgress: overallProgressData,
        overallCount: overallCountData,
        overallTotal,
        taskProgress: taskProgressData,
        taskETR,
        taskCount: taskCountData,
        taskTotal,
        taskName
    } = data;

    if (statusMessage) {
        const timestamp = new Date().toLocaleTimeString();
        logMessages.push(`[${timestamp}] ${statusMessage}`);
        if (logMessages.length > MAX_LOG_LINES) {
            logMessages.shift();
        }
        statusOutput.textContent = logMessages.join('\n');
    }

    if (overallProgressData !== undefined) {
        overallProgress.value = overallProgressData;
    }
    if (overallCountData !== undefined && overallTotal !== undefined) {
        overallCount.innerText = `${overallCountData} of ${overallTotal}`;
    }
    if (taskProgressData !== undefined) {
        taskProgress.value = taskProgressData;
    }
    if (taskCountData !== undefined && taskTotal !== undefined) {
        taskCount.innerText = `${taskCountData} of ${taskTotal}`;
    }
    if (taskETR !== undefined) {
        taskEtr.innerText = taskETR;
    }
    if (taskName) {
        overallProgressLabel.innerText = `Overall Progress: ${taskName} (Task ${overallCountData || 0} of ${overallTotal || 0})`;
    }
});

window.electronAPI.onProcessingFinished(() => {
    runBtn.disabled = false;
    runBtn.innerText = 'Run';
    overallProgressLabel.innerText = 'Overall Progress: Done';
    taskProgressLabel.innerText = 'Task Progress';
});