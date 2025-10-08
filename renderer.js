const selectDirBtn = document.getElementById('select-dir');
const runBtn = document.getElementById('run-tools');
const selectedDirElem = document.getElementById('selected-dir');
const statusOutput = document.getElementById('status-output');

// Progress elements
const overallProgress = document.getElementById('overall-progress');
const overallEtr = document.getElementById('overall-etr');
const taskProgress = document.getElementById('task-progress');
const taskEtr = document.getElementById('task-etr');
const taskProgressLabel = document.querySelector('label[for="task-progress"]');

selectDirBtn.addEventListener('click', async () => {
    const path = await window.electronAPI.selectDir();
    if (path) {
        selectedDirElem.innerText = path;
    }
});

runBtn.addEventListener('click', () => {
    const options = {
        convertToWav: document.getElementById('convert-to-wav').checked,
        normalizeWav: document.getElementById('normalize-wav').checked,
        updateLnk: document.getElementById('update-lnk').checked,
        directory: selectedDirElem.innerText
    };

    if (!options.directory) {
        statusOutput.value = 'Please select a directory first.';
        return;
    }

    // Disable button to prevent multiple runs
    runBtn.disabled = true;
    runBtn.innerText = 'Processing...';

    // Reset UI
    statusOutput.value = '';
    overallProgress.value = 0;
    taskProgress.value = 0;
    overallEtr.innerText = '';
    taskEtr.innerText = '';
    taskProgressLabel.innerText = 'Task Progress:';

    window.electronAPI.runTools(options);
});

window.electronAPI.onProgressUpdate((data) => {
    const {
        statusMessage,
        overallProgress,
        overallETR,
        taskProgress,
        taskETR,
        taskName
    } = data;

    if (statusMessage) {
        const timestamp = new Date().toLocaleTimeString();
        statusOutput.value += `[${timestamp}] ${statusMessage}\n`;
        // Auto-scroll to the bottom
        statusOutput.scrollTop = statusOutput.scrollHeight;
    }

    if (overallProgress !== undefined) {
        overallProgress.value = overallProgress;
    }
    if (taskProgress !== undefined) {
        taskProgress.value = taskProgress;
    }
    if (overallETR !== undefined) {
        overallEtr.innerText = overallETR;
    }
    if (taskETR !== undefined) {
        taskEtr.innerText = taskETR;
    }
    if (taskName) {
        taskProgressLabel.innerText = `Task Progress (${taskName}):`;
    }

    // Re-enable button if processing is complete
    if (overallProgress >= 100 || statusMessage?.includes('complete') || statusMessage?.includes('Aborting') || statusMessage?.includes('No files to process')) {
        runBtn.disabled = false;
        runBtn.innerText = 'Run';
    }
});