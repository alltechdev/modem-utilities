#include "partition.h"

void print_usage(const char *program_name) {
    printf("Usage: %s [OPTIONS]\n", basename((char *)program_name));
    printf("Options:\n");
    printf("  -b, --backup                Backup modem partitions (md1img_a, nvcfg, nvdata, nvram)\n");
    printf("  -f, --folder FOLDER         Backup to specific folder (USA or Stock)\n");
    printf("  -l, --list                  List target modem partitions\n");
    printf("  -h, --help                  Show help\n");
    printf("\nTarget modem partitions: md1img_a, nvcfg, nvdata, nvram\n");
    printf("Default backup location: /sdcard/bands/\n");
}

int parse_arguments(int argc, char *argv[], program_args_t *args) {
    int c;
    static struct option long_options[] = {
        {"backup", no_argument, 0, 'b'},
        {"folder", required_argument, 0, 'f'},
        {"list", no_argument, 0, 'l'},
        {"help", no_argument, 0, 'h'},
        {0, 0, 0, 0}
    };

    memset(args, 0, sizeof(program_args_t));
    strcpy(args->backup_dir, "/sdcard/bands");
    
    // Set target partitions
    const char *target_partitions[] = {"md1img_a", "nvcfg", "nvdata", "nvram"};
    int num_targets = sizeof(target_partitions) / sizeof(target_partitions[0]);
    
    for (int i = 0; i < num_targets; i++) {
        strncpy(args->partitions[i], target_partitions[i], MAX_PARTITION_NAME - 1);
        args->partitions[i][MAX_PARTITION_NAME - 1] = '\0';
    }
    args->partition_count = num_targets;

    while ((c = getopt_long(argc, argv, "bf:lh", long_options, NULL)) != -1) {
        switch (c) {
            case 'b':
                args->backup_mode = 1;
                break;
            case 'f':
                if (strcmp(optarg, "USA") == 0 || strcmp(optarg, "Stock") == 0) {
                    snprintf(args->backup_dir, MAX_PATH_LEN, "/sdcard/bands/%s", optarg);
                } else {
                    printf("Error: Folder must be either 'USA' or 'Stock'\n");
                    return -2;
                }
                break;
            case 'l':
                args->list_mode = 1;
                break;
            case 'h':
                return -1;
            case '?':
                return -2;
            default:
                return -2;
        }
    }

    if (!args->backup_mode && !args->list_mode) {
        printf("Error: Must specify either --backup or --list option\n");
        return -2;
    }

    return 0;
}

void format_size(off_t size_bytes, char *output, size_t output_size) {
    if (size_bytes <= 0) {
        snprintf(output, output_size, "0 B");
        return;
    }
    
    double size = (double)size_bytes;
    
    if (size < 1024) {
        snprintf(output, output_size, "%.0f B", size);
    } else if (size < 1024 * 1024) {
        snprintf(output, output_size, "%.1f KB", size / 1024);
    } else if (size < 1024 * 1024 * 1024) {
        snprintf(output, output_size, "%.1f MB", size / (1024 * 1024));
    } else {
        snprintf(output, output_size, "%.2f GB", size / (1024 * 1024 * 1024));
    }
}

int get_terminal_width(void) {
    struct winsize ws;
    
    if (ioctl(STDOUT_FILENO, TIOCGWINSZ, &ws) != -1 && ws.ws_col > 0) {
        return ws.ws_col;
    }
    
    char *cols_env = getenv("COLUMNS");
    if (cols_env != NULL) {
        int cols = atoi(cols_env);
        if (cols > 0) {
            return cols;
        }
    }
    
    return DEFAULT_TERMINAL_WIDTH;
}

void print_truncated(const char *str, int max_width) {
    if (max_width <= 0) return;
    
    int len = strlen(str);
    if (len <= max_width) {
        printf("%-*s", max_width, str);
    } else {
        if (max_width >= 4) {
            printf("%.*s...", max_width - 3, str);
            for (int i = len + 3; i < max_width; i++) {
                printf(" ");
            }
        } else {
            printf("%.*s", max_width, str);
        }
    }
}

void print_separator_line(int width) {
    for (int i = 0; i < width && i < 200; i++) {
        printf("=");
    }
    printf("\n");
}

char *find_partition_directory(void) {
    static char partition_dir[MAX_PATH_LEN];
    
    if (search_partition_in_dir("/dev/block/by-name", "boot")) {
        strcpy(partition_dir, "/dev/block/by-name");
        return partition_dir;
    }
    
    if (search_partition_in_dir("/dev/block/bootdevice/by-name", "boot")) {
        strcpy(partition_dir, "/dev/block/bootdevice/by-name");
        return partition_dir;
    }
    
    if (search_partition_recursive("/dev/block/platform", "boot", partition_dir)) {
        return partition_dir;
    }
    
    const char *fallback_partitions[] = {"system", "vendor", "super", NULL};
    
    for (int i = 0; fallback_partitions[i] != NULL; i++) {
        if (search_partition_in_dir("/dev/block/by-name", fallback_partitions[i])) {
            strcpy(partition_dir, "/dev/block/by-name");
            return partition_dir;
        }
        
        if (search_partition_in_dir("/dev/block/bootdevice/by-name", fallback_partitions[i])) {
            strcpy(partition_dir, "/dev/block/bootdevice/by-name");
            return partition_dir;
        }
        
        if (search_partition_recursive("/dev/block/platform", fallback_partitions[i], partition_dir)) {
            return partition_dir;
        }
    }
    
    return NULL;
}

int search_partition_in_dir(const char *dir_path, const char *target) {
    DIR *dp;
    struct dirent *entry;
    
    dp = opendir(dir_path);
    if (dp == NULL) {
        return 0;
    }
    
    while ((entry = readdir(dp)) != NULL) {
        if (strncasecmp(entry->d_name, target, strlen(target)) == 0) {
            closedir(dp);
            return 1;
        }
    }
    
    closedir(dp);
    return 0;
}

int search_partition_recursive(const char *base_path, const char *target, char *found_path) {
    DIR *dp;
    struct dirent *entry;
    struct stat statbuf;
    char full_path[MAX_PATH_LEN];
    
    dp = opendir(base_path);
    if (dp == NULL) {
        return 0;
    }
    
    while ((entry = readdir(dp)) != NULL) {
        if (strcmp(entry->d_name, ".") == 0 || strcmp(entry->d_name, "..") == 0) {
            continue;
        }
        
        snprintf(full_path, sizeof(full_path), "%s/%s", base_path, entry->d_name);
        
        if (stat(full_path, &statbuf) == 0 && S_ISDIR(statbuf.st_mode)) {
            if (search_partition_in_dir(full_path, target)) {
                strcpy(found_path, full_path);
                closedir(dp);
                return 1;
            }
            
            if (search_partition_recursive(full_path, target, found_path)) {
                closedir(dp);
                return 1;
            }
        }
    }
    
    closedir(dp);
    return 0;
}

int list_partitions(const char *partition_dir) {
    char full_path[MAX_PATH_LEN];
    char real_path[MAX_PATH_LEN];
    char size_str[16];
    off_t size;
    
    const char *target_partitions[] = {"md1img_a", "nvcfg", "nvdata", "nvram"};
    int num_targets = sizeof(target_partitions) / sizeof(target_partitions[0]);
    
    int terminal_width = get_terminal_width();
    
    int size_col_width = 10;
    int spacing = 4;
    int available_width = terminal_width - size_col_width - spacing;
    
    int partition_col_width, path_col_width;
    
    if (terminal_width < 60) {
        partition_col_width = available_width;
        path_col_width = 0;
        
        printf("%-*s %s\n", partition_col_width, "Partition", "Size");
        print_separator_line(terminal_width);
    } else if (terminal_width < 100) {
        partition_col_width = available_width * 0.4;
        path_col_width = available_width * 0.6;
        
        printf("%-*s %-*s %s\n", partition_col_width, "Partition", path_col_width, "Path", "Size");
        print_separator_line(terminal_width);
    } else {
        partition_col_width = 24;
        path_col_width = available_width - partition_col_width;
        
        printf("%-*s %-*s %s\n", partition_col_width, "Partition", path_col_width, "Path", "Size");
        print_separator_line(terminal_width);
    }
    
    for (int i = 0; i < num_targets; i++) {
        snprintf(full_path, sizeof(full_path), "%s/%s", partition_dir, target_partitions[i]);
        
        if (!file_exists(full_path)) {
            printf("%-*s %s\n", partition_col_width, target_partitions[i], "NOT FOUND");
            continue;
        }
        
        ssize_t len = readlink(full_path, real_path, sizeof(real_path) - 1);
        if (len != -1) {
            real_path[len] = '\0';
        } else {
            strcpy(real_path, "N/A");
        }
        
        size = get_partition_size(full_path);
        format_size(size, size_str, sizeof(size_str));
        
        if (path_col_width == 0) {
            print_truncated(target_partitions[i], partition_col_width);
            printf(" %s\n", size_str);
        } else {
            print_truncated(target_partitions[i], partition_col_width);
            printf(" ");
            print_truncated(real_path, path_col_width);
            printf(" %s\n", size_str);
        }
    }
    
    return 0;
}

int backup_partitions(const program_args_t *args, const char *partition_dir) {
    // Create /sdcard/bands directory structure
    create_directory_if_not_exists("/sdcard/bands");
    create_directory_if_not_exists("/sdcard/bands/USA");
    create_directory_if_not_exists("/sdcard/bands/Stock");
    
    // Create the specific backup directory
    create_directory_if_not_exists(args->backup_dir);
    
    printf("Modem Utilities - Backing up to: %s\n", args->backup_dir);
    
    for (int i = 0; i < args->partition_count; i++) {
        if (backup_single_partition(args->partitions[i], partition_dir, args->backup_dir) != 0) {
            printf("Failed: %s\n", args->partitions[i]);
            return -1;
        }
    }
    
    return 0;
}

int backup_single_partition(const char *partition_name, const char *partition_dir, const char *backup_dir) {
    char partition_path[MAX_PATH_LEN];
    char real_path[MAX_PATH_LEN];
    char backup_path[MAX_PATH_LEN];
    char timestamp[32];
    char size_str[16];
    time_t now = time(NULL);
    struct tm *tm_info = localtime(&now);
    
    snprintf(partition_path, sizeof(partition_path), "%s/%s", partition_dir, partition_name);
    
    if (!file_exists(partition_path)) {
        printf("Error: %s not found\n", partition_name);
        return -1;
    }
    
    ssize_t len = readlink(partition_path, real_path, sizeof(real_path) - 1);
    if (len == -1) {
        perror("readlink");
        return -1;
    }
    real_path[len] = '\0';
    
    strftime(timestamp, sizeof(timestamp), "%Y%m%d_%H%M%S", tm_info);
    snprintf(backup_path, sizeof(backup_path), "%s/%s_%s.img", 
             backup_dir, partition_name, timestamp);
    
    format_size(get_partition_size(partition_path), size_str, sizeof(size_str));
    printf("Backing up %s (%s) -> %s\n", partition_name, size_str, basename(backup_path));
    
    return copy_partition(real_path, backup_path);
}

off_t get_partition_size(const char *device_path) {
    int fd;
    off_t size = 0;
    
    fd = open(device_path, O_RDONLY);
    if (fd < 0) {
        return -1;
    }
    
    if (ioctl(fd, BLKGETSIZE64, &size) < 0) {
        struct stat st;
        if (fstat(fd, &st) == 0) {
            size = st.st_size;
        }
    }
    
    close(fd);
    return size;
}

int copy_partition(const char *source, const char *dest) {
    int src_fd, dest_fd;
    char buffer[BUFFER_SIZE];
    ssize_t bytes_read, bytes_written;
    off_t total_bytes = 0;
    off_t total_size;
    int terminal_width = get_terminal_width();
    
    src_fd = open(source, O_RDONLY);
    if (src_fd < 0) {
        perror("open source");
        return -1;
    }
    
    total_size = get_partition_size(source);
    if (total_size <= 0) {
        printf("Warning: Could not determine partition size\n");
        close(src_fd);
        return -1;
    }
    
    dest_fd = open(dest, O_WRONLY | O_CREAT | O_TRUNC, 0644);
    if (dest_fd < 0) {
        perror("open destination");
        close(src_fd);
        return -1;
    }
    
    while ((bytes_read = read(src_fd, buffer, sizeof(buffer))) > 0) {
        bytes_written = write(dest_fd, buffer, bytes_read);
        if (bytes_written != bytes_read) {
            perror("write");
            close(src_fd);
            close(dest_fd);
            unlink(dest);
            return -1;
        }
        total_bytes += bytes_written;
        
        int progress = (int)((total_bytes * 100) / total_size);
        
        int progress_bar_width = terminal_width - 22;
        if (progress_bar_width < 10) progress_bar_width = 10;
        if (progress_bar_width > 50) progress_bar_width = 50;
        
        int bars = (progress * progress_bar_width) / 100;
        
        printf("\r[");
        for (int i = 0; i < progress_bar_width; i++) {
            if (i < bars) {
                printf("=");
            } else if (i == bars && progress < 100) {
                printf(">");
            } else {
                printf(" ");
            }
        }
        printf("] %d%% (%.1f MB)", progress, (double)total_bytes / (1024 * 1024));
        fflush(stdout);
    }
    
    if (bytes_read < 0) {
        perror("read");
        close(src_fd);
        close(dest_fd);
        unlink(dest);
        return -1;
    }
    
    close(src_fd);
    close(dest_fd);
    
    printf("\n");
    return 0;
}

int file_exists(const char *path) {
    return access(path, F_OK) == 0;
}

int is_directory(const char *path) {
    struct stat statbuf;
    return stat(path, &statbuf) == 0 && S_ISDIR(statbuf.st_mode);
}

void create_directory_if_not_exists(const char *path) {
    if (!is_directory(path)) {
        if (mkdir(path, 0755) != 0 && errno != EEXIST) {
            perror("mkdir");
            exit(1);
        }
    }
}

int main(int argc, char *argv[]) {
    program_args_t args;
    char *partition_dir;
    
    int parse_result = parse_arguments(argc, argv, &args);
    if (parse_result == -1) {
        print_usage(argv[0]);
        return 0;
    } else if (parse_result == -2) {
        print_usage(argv[0]);
        return 1;
    }
    
    partition_dir = find_partition_directory();
    if (partition_dir == NULL) {
        printf("Error: Could not find partition directory\n");
        return 1;
    }
    
    if (args.list_mode) {
        return list_partitions(partition_dir);
    }
    
    if (args.backup_mode) {
        return backup_partitions(&args, partition_dir);
    }
    
    return 0;
}