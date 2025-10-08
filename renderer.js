const selectDirBtn = document.getElementById('select-dir');
const runBtn = document.getElementById('run-tools');
const selectedDirElem = document.getElementById('selected-dir');
const statusOutput = document.getElementById('status-output');

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
        statusOutput.innerText = 'Please select a directory first.';
        return;
    }

    statusOutput.innerText = 'Starting...';
    window.electronAPI.runTools(options);
});

window.electronAPI.onStatusUpdate((message) => {
    statusOutput.innerText += `\n${message}`;
});