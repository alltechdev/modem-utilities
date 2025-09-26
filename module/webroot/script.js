// Modern Mobile Bands Flasher - Optimized for 480x640
let isEnvironmentSupported = false;
let partitionsFound = [];
let selectedFolder = 'USA';
let saveMD5 = localStorage.getItem('saveMD5') === 'true';
let backupLocation = '/sdcard/bands';

const targetPartitions = ['md1img_a', 'nvcfg', 'nvdata', 'nvram'];

// Utility Functions
function getUniqueCallbackName(prefix) {
    return `${prefix}_${Math.random().toString(36).substr(2, 9)}`;
}

async function exec(command) {
    return new Promise((resolve, reject) => {
        const callbackName = getUniqueCallbackName('exec');
        window[callbackName] = (errno, stdout, stderr) => {
            resolve({
                errno,
                stdout: stdout.trim(),
                stderr
            });
            delete window[callbackName];
        };
        try {
            ksu.exec(command, '{}', callbackName);
        } catch (error) {
            reject(error);
            delete window[callbackName];
        }
    });
}

// UI Management
function showModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function hideModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

function showConfirm(title, message, onConfirm) {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;
    
    const confirmBtn = document.getElementById('confirmOk');
    const cancelBtn = document.getElementById('confirmCancel');
    
    // Remove existing event listeners
    confirmBtn.replaceWith(confirmBtn.cloneNode(true));
    cancelBtn.replaceWith(cancelBtn.cloneNode(true));
    
    // Add new event listeners
    document.getElementById('confirmOk').onclick = () => {
        hideModal('confirmModal');
        onConfirm();
    };
    
    document.getElementById('confirmCancel').onclick = () => {
        hideModal('confirmModal');
    };
    
    showModal('confirmModal');
}

function updateProgress(title, text, progress = 0, details = '') {
    document.getElementById('progressTitle').textContent = title;
    document.getElementById('progressText').textContent = text;
    document.getElementById('progressFill').style.width = `${progress}%`;
    document.getElementById('progressDetails').textContent = details;
}

function showProgress(title, text, details = '') {
    updateProgress(title, text, 0, details);
    showModal('progressModal');
}

function hideProgress() {
    hideModal('progressModal');
}

// Partition Management
async function findBootPartitionLocation() {
    const locations = [
        '/dev/block/by-name',
        '/dev/block/bootdevice/by-name'
    ];
    
    for (const location of locations) {
        try {
            const { stdout: exists } = await exec(`[ -d "${location}" ] && echo "yes" || echo "no"`);
            if (exists.trim() === "yes") {
                const { stdout: hasPartitions } = await exec(`ls -1 ${location} | head -1`);
                if (hasPartitions.trim()) {
                    return location;
                }
            }
        } catch (error) {
            console.warn(`Failed to check ${location}:`, error);
        }
    }
    
    // Fallback: search in platform directories
    try {
        const { stdout: platformPath } = await exec('find /dev/block/platform -name "by-name" 2>/dev/null | head -1');
        if (platformPath.trim()) {
            return platformPath.trim();
        }
    } catch (error) {
        console.warn('Platform search failed:', error);
    }
    
    return null;
}

async function getPartitions(basePath) {
    if (!basePath) return [];
    
    const result = [];
    
    for (const partitionName of targetPartitions) {
        try {
            const partitionPath = `${basePath}/${partitionName}`;
            const { stdout: exists } = await exec(`[ -e "${partitionPath}" ] && echo "yes" || echo "no"`);
            
            if (exists.trim() === "yes") {
                const { stdout: realPath } = await exec(`readlink -f "${partitionPath}"`);
                const { stdout: size } = await exec(`blockdev --getsize64 "${realPath}" 2>/dev/null || echo "0"`);
                
                const sizeInMB = parseInt(size) / (1024 * 1024);
                const formattedSize = sizeInMB >= 1024 
                    ? `${(sizeInMB / 1024).toFixed(1)} GB` 
                    : `${sizeInMB.toFixed(1)} MB`;
                
                result.push({
                    name: partitionName,
                    path: realPath.trim(),
                    size: formattedSize,
                    sizeBytes: size,
                    found: true
                });
            } else {
                result.push({
                    name: partitionName,
                    path: 'NOT FOUND',
                    size: 'N/A',
                    sizeBytes: '0',
                    found: false
                });
            }
        } catch (error) {
            console.warn(`Error checking partition ${partitionName}:`, error);
            result.push({
                name: partitionName,
                path: 'ERROR',
                size: 'N/A',
                sizeBytes: '0',
                found: false
            });
        }
    }
    
    return result;
}

function renderPartitions() {
    const grid = document.getElementById('partitionGrid');
    const foundCount = partitionsFound.filter(p => p.found).length;
    
    document.getElementById('partitionsFound').textContent = `${foundCount}/${targetPartitions.length}`;
    
    grid.innerHTML = '';
    
    partitionsFound.forEach(partition => {
        const card = document.createElement('div');
        card.className = `partition-card ${partition.found ? 'found' : 'missing'}`;
        
        card.innerHTML = `
            <div class="partition-name">${partition.name}</div>
            <div class="partition-size">${partition.size}</div>
            <div class="partition-status ${partition.found ? 'status-found' : 'status-missing'}">
                ${partition.found ? 'Found' : 'Missing'}
            </div>
        `;
        
        if (partition.found) {
            card.onclick = () => {
                showConfirm(
                    'Backup Single Partition',
                    `Backup ${partition.name} to ${selectedFolder} folder?`,
                    () => backupSinglePartition(partition)
                );
            };
        }
        
        grid.appendChild(card);
    });
}

// Backup Functions
async function backupSinglePartition(partition) {
    if (!partition.found || partition.path === 'NOT FOUND') {
        alert(`Partition ${partition.name} not found on device`);
        return;
    }
    
    try {
        showProgress('Backing up...', `Preparing ${partition.name}`, 'Initializing backup process');
        
        // Create directory structure
        await exec('mkdir -p "/sdcard/bands"');
        await exec('mkdir -p "/sdcard/bands/USA"');
        await exec('mkdir -p "/sdcard/bands/Stock"');
        
        const finalBackupLocation = `${backupLocation}/${selectedFolder}`;
        await exec(`mkdir -p "${finalBackupLocation}"`);
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = `${finalBackupLocation}/${partition.name}_${timestamp}.img`;
        
        updateProgress('Backing up...', `Copying ${partition.name}`, 25, 'Starting backup...');
        
        const ddCommand = `dd if="${partition.path}" of="${backupFile}" bs=8M conv=fsync,noerror`;
        const result = await exec(ddCommand);
        
        if (result.errno === 0) {
            updateProgress('Backing up...', `Finalizing ${partition.name}`, 75, 'Backup completed');
            
            if (saveMD5) {
                updateProgress('Backing up...', 'Generating MD5...', 90, 'Creating checksum');
                const md5Command = `md5sum "${backupFile}" | awk '{print $1}' > "${backupFile}.md5"`;
                await exec(md5Command);
            }
            
            updateProgress('Success!', `${partition.name} backed up`, 100, `Saved to ${selectedFolder} folder`);
            
            setTimeout(() => {
                hideProgress();
                updateStorageInfo();
                updateLastBackup();
            }, 1500);
        } else {
            throw new Error(`Backup failed: ${result.stderr}`);
        }
    } catch (error) {
        console.error('Backup failed:', error);
        updateProgress('Failed!', 'Backup error', 0, error.message);
        setTimeout(() => hideProgress(), 3000);
    }
}

async function backupAllPartitions() {
    const availablePartitions = partitionsFound.filter(p => p.found);
    
    if (availablePartitions.length === 0) {
        alert('No partitions available for backup');
        return;
    }
    
    showConfirm(
        'Backup Partitions',
        `Backup ${availablePartitions.length} modem partitions to ${selectedFolder} folder?`,
        async () => {
            try {
                showProgress('Backing up all...', 'Preparing...', 'Setting up directories');
                
                // Create directory structure
                await exec('mkdir -p "/sdcard/bands"');
                await exec('mkdir -p "/sdcard/bands/USA"');
                await exec('mkdir -p "/sdcard/bands/Stock"');
                
                const finalBackupLocation = `${backupLocation}/${selectedFolder}`;
                await exec(`mkdir -p "${finalBackupLocation}"`);
                
                const sortedPartitions = [...availablePartitions].sort((a, b) =>
                    parseInt(a.sizeBytes) - parseInt(b.sizeBytes)
                );
                
                for (let i = 0; i < sortedPartitions.length; i++) {
                    const partition = sortedPartitions[i];
                    const progress = ((i + 1) / sortedPartitions.length) * 100;
                    
                    updateProgress(
                        'Backing up all...',
                        `Processing ${partition.name}`,
                        progress,
                        `${i + 1} of ${sortedPartitions.length}`
                    );
                    
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                    const backupFile = `${finalBackupLocation}/${partition.name}_${timestamp}.img`;
                    
                    const ddCommand = `dd if="${partition.path}" of="${backupFile}" bs=8M conv=fsync,noerror`;
                    const result = await exec(ddCommand);
                    
                    if (result.errno !== 0) {
                        throw new Error(`Failed to backup ${partition.name}: ${result.stderr}`);
                    }
                    
                    if (saveMD5) {
                        const md5Command = `md5sum "${backupFile}" | awk '{print $1}' > "${backupFile}.md5"`;
                        await exec(md5Command);
                    }
                }
                
                updateProgress('Success!', 'All modem partitions backed up', 100, `Saved to ${selectedFolder} folder`);
                
                setTimeout(() => {
                    hideProgress();
                    updateStorageInfo();
                    updateLastBackup();
                }, 2000);
                
            } catch (error) {
                console.error('Backup failed:', error);
                updateProgress('Failed!', 'Backup error', 0, error.message);
                setTimeout(() => hideProgress(), 3000);
            }
        }
    );
}

// Delete Functions
async function getFolderInfo(folderType) {
    const folderPath = `/sdcard/bands/${folderType}`;
    try {
        const { stdout: exists } = await exec(`[ -d "${folderPath}" ] && echo "yes" || echo "no"`);
        if (exists.trim() !== 'yes') {
            return { exists: false, fileCount: 0, size: '0 B' };
        }
        
        const { stdout: fileCount } = await exec(`find "${folderPath}" -name "*.img" -type f 2>/dev/null | wc -l`);
        const { stdout: sizeOutput } = await exec(`du -sh "${folderPath}" 2>/dev/null | cut -f1 || echo "0"`);
        
        return {
            exists: true,
            fileCount: parseInt(fileCount.trim()) || 0,
            size: sizeOutput.trim() || '0 B'
        };
    } catch (error) {
        console.error(`Error getting info for ${folderType}:`, error);
        return { exists: false, fileCount: 0, size: '0 B' };
    }
}

async function showDeleteFolderDialog() {
    showModal('deleteFolderModal');
    
    // Update folder info
    document.getElementById('usaFolderInfo').textContent = 'Checking...';
    document.getElementById('stockFolderInfo').textContent = 'Checking...';
    
    try {
        const [usaInfo, stockInfo] = await Promise.all([
            getFolderInfo('USA'),
            getFolderInfo('Stock')
        ]);
        
        // Update USA folder info
        const usaBtn = document.getElementById('deleteUSAChoice');
        const usaInfoElement = document.getElementById('usaFolderInfo');
        
        if (usaInfo.exists && usaInfo.fileCount > 0) {
            usaInfoElement.textContent = `${usaInfo.fileCount} files (${usaInfo.size})`;
            usaBtn.classList.remove('disabled');
            usaBtn.onclick = () => confirmDeleteFolder('USA', usaInfo);
        } else {
            usaInfoElement.textContent = 'No files found';
            usaBtn.classList.add('disabled');
            usaBtn.onclick = null;
        }
        
        // Update Stock folder info
        const stockBtn = document.getElementById('deleteStockChoice');
        const stockInfoElement = document.getElementById('stockFolderInfo');
        
        if (stockInfo.exists && stockInfo.fileCount > 0) {
            stockInfoElement.textContent = `${stockInfo.fileCount} files (${stockInfo.size})`;
            stockBtn.classList.remove('disabled');
            stockBtn.onclick = () => confirmDeleteFolder('Stock', stockInfo);
        } else {
            stockInfoElement.textContent = 'No files found';
            stockBtn.classList.add('disabled');
            stockBtn.onclick = null;
        }
        
    } catch (error) {
        console.error('Error checking folder info:', error);
        document.getElementById('usaFolderInfo').textContent = 'Error checking';
        document.getElementById('stockFolderInfo').textContent = 'Error checking';
    }
}

function confirmDeleteFolder(folderType, folderInfo) {
    hideModal('deleteFolderModal');
    
    showConfirm(
        `Delete ${folderType} Backups`,
        `⚠️ This will permanently delete ${folderInfo.fileCount} backup files (${folderInfo.size}) from the ${folderType} folder. This action cannot be undone!\n\nAre you sure you want to continue?`,
        () => deleteFolder(folderType)
    );
}

async function deleteFolder(folderType) {
    const folderPath = `/sdcard/bands/${folderType}`;
    
    try {
        showProgress('Deleting...', `Removing ${folderType} backups`, 'Preparing deletion...');
        
        // Check if folder exists
        const { stdout: exists } = await exec(`[ -d "${folderPath}" ] && echo "yes" || echo "no"`);
        if (exists.trim() !== 'yes') {
            throw new Error(`${folderType} folder does not exist`);
        }
        
        updateProgress('Deleting...', `Removing ${folderType} files`, 25, 'Deleting backup files...');
        
        // Delete all .img and .md5 files in the folder
        await exec(`find "${folderPath}" -name "*.img" -type f -delete 2>/dev/null || true`);
        await exec(`find "${folderPath}" -name "*.md5" -type f -delete 2>/dev/null || true`);
        
        updateProgress('Deleting...', 'Cleaning up', 75, 'Removing empty directories...');
        
        // Remove the folder if it's empty
        await exec(`rmdir "${folderPath}" 2>/dev/null || true`);
        
        updateProgress('Success!', `${folderType} backups deleted`, 100, 'Deletion completed');
        
        setTimeout(() => {
            hideProgress();
            updateStorageInfo();
            updateLastBackup();
        }, 1500);
        
    } catch (error) {
        console.error('Delete failed:', error);
        updateProgress('Failed!', 'Delete error', 0, error.message);
        setTimeout(() => hideProgress(), 3000);
    }
}

// Flash Functions
async function findLatestImageFile(folderPath, partitionName) {
    try {
        const { stdout: files } = await exec(`find "${folderPath}" -name "${partitionName}*.img" -type f 2>/dev/null | sort -r | head -1`);
        return files.trim();
    } catch (error) {
        console.error(`Error finding image for ${partitionName}:`, error);
        return null;
    }
}

async function checkFlashFiles(folderType) {
    const folderPath = `/sdcard/bands/${folderType}`;
    const results = [];
    
    for (const partitionName of targetPartitions) {
        const imagePath = await findLatestImageFile(folderPath, partitionName);
        results.push({
            partition: partitionName,
            imagePath: imagePath,
            found: !!imagePath
        });
    }
    
    return results;
}

async function showFlashPreview(folderType) {
    document.getElementById('flashModalTitle').textContent = `Flash ${folderType} Modem`;
    document.getElementById('flashModalMessage').textContent = `Modem files to flash from ${folderType} folder:`;
    
    const fileList = document.getElementById('flashFileList');
    fileList.innerHTML = '<div style="text-align: center; padding: 20px;">Checking files...</div>';
    
    showModal('flashModal');
    
    try {
        const files = await checkFlashFiles(folderType);
        const foundFiles = files.filter(f => f.found);
        
        fileList.innerHTML = '';
        
        files.forEach(file => {
            const item = document.createElement('div');
            item.className = 'file-item';
            
            item.innerHTML = `
                <span class="file-name">${file.partition}</span>
                <span class="file-status ${file.found ? 'file-found' : 'file-missing'}">
                    ${file.found ? 'Found' : 'Missing'}
                </span>
            `;
            
            fileList.appendChild(item);
        });
        
        const confirmBtn = document.getElementById('confirmFlash');
        
        if (foundFiles.length === 0) {
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'No Files Found';
            confirmBtn.style.opacity = '0.5';
        } else {
            confirmBtn.disabled = false;
            confirmBtn.textContent = `Flash ${foundFiles.length} File${foundFiles.length > 1 ? 's' : ''}`;
            confirmBtn.style.opacity = '1';
            
            confirmBtn.onclick = () => {
                hideModal('flashModal');
                flashAllBands(folderType, foundFiles);
            };
        }
        
    } catch (error) {
        fileList.innerHTML = `<div style="color: var(--danger); text-align: center; padding: 20px;">Error checking files: ${error.message}</div>`;
    }
}

async function flashAllBands(folderType, filesToFlash) {
    if (filesToFlash.length === 0) {
        alert('No image files found to flash');
        return;
    }
    
    showConfirm(
        'Flash Warning',
        `⚠️ This will flash ${filesToFlash.length} modem partition(s) from ${folderType} folder. This operation is DANGEROUS and cannot be undone. Continue?`,
        async () => {
            try {
                showProgress('Flashing...', 'Preparing...', 'Starting flash operation');
                
                for (let i = 0; i < filesToFlash.length; i++) {
                    const file = filesToFlash[i];
                    const partition = partitionsFound.find(p => p.name === file.partition);
                    
                    if (!partition || !partition.found) {
                        console.warn(`Partition ${file.partition} not found, skipping`);
                        continue;
                    }
                    
                    const progress = ((i + 1) / filesToFlash.length) * 100;
                    
                    updateProgress(
                        'Flashing...',
                        `Flashing ${file.partition}`,
                        progress,
                        `${i + 1} of ${filesToFlash.length}`
                    );
                    
                    // Verify image exists
                    const { stdout: imageExists } = await exec(`[ -f "${file.imagePath}" ] && echo "yes" || echo "no"`);
                    if (imageExists.trim() !== 'yes') {
                        throw new Error(`Image file not found: ${file.imagePath}`);
                    }
                    
                    // Flash the partition
                    const ddCommand = `dd if="${file.imagePath}" of="${partition.path}" bs=8M conv=fsync,noerror`;
                    const result = await exec(ddCommand);
                    
                    if (result.errno !== 0) {
                        throw new Error(`Failed to flash ${file.partition}: ${result.stderr}`);
                    }
                    
                    // Small delay between flashes
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
                
                updateProgress('Success!', 'All modem partitions flashed', 100, `${folderType} modem installed`);
                
                setTimeout(() => {
                    hideProgress();
                    showConfirm(
                        'Reboot Required',
                        `${folderType} modem has been flashed successfully. Please reboot your device to apply the changes.`,
                        () => {
                            exec('reboot').catch(() => {
                                alert('Please reboot manually to apply changes');
                            });
                        }
                    );
                }, 2000);
                
            } catch (error) {
                console.error('Flash failed:', error);
                updateProgress('Failed!', 'Flash error', 0, error.message);
                setTimeout(() => hideProgress(), 3000);
            }
        }
    );
}

// Info Functions
async function updateStorageInfo() {
    try {
        const { stdout: available } = await exec('df -h /storage/emulated/0 | tail -1 | awk \'{print $4}\'');
        document.getElementById('storageInfo').textContent = available.trim();
    } catch (error) {
        document.getElementById('storageInfo').textContent = 'Error';
    }
}

async function updateLastBackup() {
    try {
        const { stdout: lastBackupFile } = await exec(`find /sdcard/bands -name "*.img" -type f 2>/dev/null | xargs ls -t | head -1`);
        
        if (lastBackupFile.trim()) {
            const { stdout: lastBackupTime } = await exec(`stat -c "%y" "${lastBackupFile.trim()}" | cut -d. -f1`);
            const date = new Date(lastBackupTime.trim());
            document.getElementById('lastBackupInfo').textContent = date.toLocaleString();
        } else {
            document.getElementById('lastBackupInfo').textContent = 'Never';
        }
    } catch (error) {
        document.getElementById('lastBackupInfo').textContent = 'Error';
    }
}

// Initialization
async function init() {
    try {
        // Check environment
        if (typeof ksu === 'undefined' || typeof ksu.exec === 'undefined') {
            alert('KSU environment not available. Please run in KernelSU/APatch/Magisk.');
            return;
        }
        
        isEnvironmentSupported = true;
        
        // Setup event listeners
        setupEventListeners();
        
        // Find partitions
        document.getElementById('loading').style.display = 'flex';
        
        const partitionPath = await findBootPartitionLocation();
        if (!partitionPath) {
            throw new Error('Could not find partition directory');
        }
        
        partitionsFound = await getPartitions(partitionPath);
        
        document.getElementById('loading').style.display = 'none';
        renderPartitions();
        
        // Update info
        await updateStorageInfo();
        await updateLastBackup();
        
        // Set initial values
        document.getElementById('md5Toggle').checked = saveMD5;
        document.getElementById('backupPath').textContent = `/sdcard/bands/${selectedFolder}`;
        
    } catch (error) {
        console.error('Initialization error:', error);
        document.getElementById('loading').innerHTML = `<span style="color: var(--danger);">Error: ${error.message}</span>`;
    }
}

function setupEventListeners() {
    // Settings panel
    document.getElementById('menuBtn').onclick = () => {
        document.getElementById('settingsPanel').classList.add('active');
    };
    
    document.getElementById('closeSettings').onclick = () => {
        document.getElementById('settingsPanel').classList.remove('active');
    };
    
    // Folder selector
    document.getElementById('folderSelect').onchange = (e) => {
        selectedFolder = e.target.value;
        document.getElementById('backupPath').textContent = `/sdcard/bands/${selectedFolder}`;
    };
    
    // MD5 toggle
    document.getElementById('md5Toggle').onchange = function() {
        saveMD5 = this.checked;
        localStorage.setItem('saveMD5', saveMD5);
    };
    
    // Action buttons
    document.getElementById('backupBtn').onclick = backupAllPartitions;
    document.getElementById('flashUSABtn').onclick = () => showFlashPreview('USA');
    document.getElementById('flashStockBtn').onclick = () => showFlashPreview('Stock');
    document.getElementById('deleteBackupsBtn').onclick = showDeleteFolderDialog;
    
    // Modal controls
    document.getElementById('closeFlashModal').onclick = () => hideModal('flashModal');
    document.getElementById('cancelFlash').onclick = () => hideModal('flashModal');
    document.getElementById('closeDeleteFolderModal').onclick = () => hideModal('deleteFolderModal');
    document.getElementById('cancelDeleteFolder').onclick = () => hideModal('deleteFolderModal');
    document.getElementById('cancelProgress').onclick = () => {
        exec('pkill dd').then(() => {
            hideProgress();
        }).catch(() => {
            hideProgress();
        });
    };
    
    // Click outside to close settings
    document.addEventListener('click', (e) => {
        const settingsPanel = document.getElementById('settingsPanel');
        const menuBtn = document.getElementById('menuBtn');
        
        if (!settingsPanel.contains(e.target) && !menuBtn.contains(e.target)) {
            settingsPanel.classList.remove('active');
        }
    });
}

// Start the app
window.addEventListener('load', init);