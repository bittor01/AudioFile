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

selectDirBtn.addEventListener('click', async () => {
    const path = await window.electronAPI.selectDir();
    if (path) {
        selectedDirElem.innerText = path;
    }
});

runBtn.addEventListener('click', () => {
    const options = {
        convertToWav: document.getElementById('convert-to-wav').checked,
        deleteSourceFiles: document.getElementById('delete-source-files').checked,
        normalizeWav: document.getElementById('normalize-wav').checked,
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