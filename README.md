# Modem Utilities

Backup and flash modem partitions on Qin F21 Pro.

## Features
- Backup modem partitions (md1img_a, nvcfg, nvdata, nvram)
- Flash USA or Stock modem configurations
- Mobile-optimized UI for 480x640 screens
- Web interface and CLI support

## Installation
1. Flash module in KernelSU/APatch/Magisk
2. Reboot device
3. Access via WebUI

## Usage
### Web Interface
- View partitions in 2x2 grid
- Choose USA or Stock folder
- Backup or flash configurations

### CLI
```bash
partition -l          # List partitions
partition -b -f USA   # Backup to USA folder
partition -b -f Stock # Backup to Stock folder
```

## Directory Structure
```
/sdcard/bands/
├── USA/    # USA modem files
└── Stock/  # Stock modem files
```

## Warning
⚠️ This modifies critical system partitions. Backup first!

## Credits
- **Author**: @ars18-JTechForums
- **Forked from**: rhythmcache/partition-backup