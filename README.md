# Modem Utilities - F21 Pro

Backup and flash modem partitions on Qin F21 Pro. This is useful when traveling. Best time to use this module is when opening a new box, as you will have stock partitions with your IMEI, WiFi MAC, and BT address.

## Features

* Backup modem partitions (md1img_a, nvcfg, nvdata, nvram)
* Flash USA or Stock modem configurations from your backups on the fly

## Installation
**[Download Module](https://github.com/alltechdev/modem-utilities/releases/download/v1.0.0/f21_pro_modem_utilities.zip)**

1. Flash module
2. Reboot device
3. Access via WebUI (KSU WebUI or MMRL)

## Usage

* Choose USA or Stock folder for backups
* Flash either configuration

https://vimeo.com/1122534776?fl=pl&fe=sh

**This module expects *.img* partitions. Just change the extension of your backups when placing in either USA or Stock folder.**

## Directory Structure

```
/sdcard/bands/
├── USA/    # USA modem files
└── Stock/  # Stock modem files
```

## Warning

⚠️ This modifies critical system partitions. Backup first!

**Forked from**: [rhythmcache/partition-backup](https://github.com/rhythmcache/partition-backup)

https://github.com/alltechdev/modem-utilities
