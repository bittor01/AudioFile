const fs = require('fs');
const path = require('path');
const getShortcutProperties = require('get-windows-shortcut-properties');
const readline = require('readline');

const SHORTLIST_DIR = './shortlist';
const GARBAGE_DIR = './garbagebag';
const ROOT_DIR = '.'; // Assuming we run from the project root
const AUDIO_EXTENSIONS = ['.wav', '.mp3', '.ogg'];

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// --- Helper Functions ---

function findFilesRecursive(dir, extensions) {
    let files = [];
    if (!fs.existsSync(dir)) {
        return [];
    }
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
            // Exclude the garbage directory from the scan
            if (path.resolve(fullPath) === path.resolve(GARBAGE_DIR)) {
                continue;
            }
            files = files.concat(findFilesRecursive(fullPath, extensions));
        } else if (extensions.includes(path.extname(item.name).toLowerCase())) {
            files.push(fullPath);
        }
    }
    return files;
}

async function getShortcutTargets(lnkFiles) {
    const targets = new Set();
    for (const file of lnkFiles) {
        try {
            const properties = await getShortcutProperties(file);
            if (properties && properties.target) {
                targets.add(path.resolve(properties.target));
            }
        } catch (error) {
            console.error(`Could not read shortcut: ${file}`, error);
        }
    }
    return targets;
}

// --- Main Logic ---

async function main() {
    console.log('--- Starting Cleanup Process ---');

    // 1. Build Shortlist
    console.log(`Scanning "${SHORTLIST_DIR}" for shortcut files...`);
    const lnkFiles = findFilesRecursive(SHORTLIST_DIR, ['.lnk']);
    if (lnkFiles.length === 0) {
        console.log('No shortcut files found in shortlist. Aborting.');
        return;
    }
    const shortlistTargets = await getShortcutTargets(lnkFiles);
    console.log(`Found ${shortlistTargets.size} unique tracks in the shortlist.`);

    // 2. Scan for all audio files
    console.log('Scanning for all audio files in the root directory...');
    const allAudioFiles = findFilesRecursive(ROOT_DIR, AUDIO_EXTENSIONS);
    console.log(`Found ${allAudioFiles.length} total audio files.`);

    // 3. Move files not in the shortlist
    const movedFiles = [];
    if (!fs.existsSync(GARBAGE_DIR)) {
        fs.mkdirSync(GARBAGE_DIR, { recursive: true });
    }

    for (const audioFile of allAudioFiles) {
        const resolvedAudioPath = path.resolve(audioFile);
        if (!shortlistTargets.has(resolvedAudioPath)) {
            const relativePath = path.relative(ROOT_DIR, audioFile);
            const destinationPath = path.join(GARBAGE_DIR, relativePath);
            const destinationDir = path.dirname(destinationPath);

            try {
                if (!fs.existsSync(destinationDir)) {
                    fs.mkdirSync(destinationDir, { recursive: true });
                }
                fs.renameSync(audioFile, destinationPath);
                console.log(`Moved: ${relativePath}`);
                movedFiles.push({ from: destinationPath, to: audioFile });
            } catch (error) {
                console.error(`Failed to move ${audioFile}:`, error);
            }
        }
    }

    if (movedFiles.length === 0) {
        console.log('No files to clean up. All audio files are in the shortlist.');
        return;
    }

    console.log(`\n--- Cleanup Complete ---`);
    console.log(`Moved ${movedFiles.length} files to "${GARBAGE_DIR}".`);

    // 4. Interactive Undo
    rl.question('Type "undo" to restore all moved files, or press Enter to exit: ', (answer) => {
        if (answer.toLowerCase() === 'undo') {
            console.log('\nRestoring files...');
            for (const move of movedFiles) {
                try {
                    const originalDir = path.dirname(move.to);
                    if (!fs.existsSync(originalDir)) {
                         fs.mkdirSync(originalDir, { recursive: true });
                    }
                    fs.renameSync(move.from, move.to);
                    console.log(`Restored: ${path.relative(ROOT_DIR, move.to)}`);
                } catch (error) {
                    console.error(`Failed to restore ${move.from}:`, error);
                }
            }
            console.log('All files restored.');
        } else {
            console.log('Exiting. Files remain in the garbagebag.');
        }
        rl.close();
    });
}

main().catch(console.error);