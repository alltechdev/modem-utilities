ui_print "- Modem Utilities"
sleep 0.5
ui_print "- Utility to backup and flash modem partitions on the Qin F21 Pro"
sleep 0.5
ui_print "- $([ -f "${MODPATH}/module.prop" ] && grep -E "^version=" "${MODPATH}/module.prop") "
sleep 0.5


if [ "${APATCH}" ]; then
    bin_dir="/data/adb/ap/bin"
    rm -f "${MODPATH}/action.sh"
elif [ "${KSU}" ]; then
    bin_dir="/data/adb/ksu/bin"
    rm -f "${MODPATH}/action.sh"
elif [ "${MAGISK_VER_CODE}" ]; then
    bin_dir="/data/adb/magisk"
fi    

mkdir -p "${MODPATH}/system/bin"
            

if [ -f "${bin_dir}/busybox" ]; then
  busybox="${bin_dir}/busybox"
fi

[ ! -f "/system/bin/blockdev" ] && ln -s "${busybox}" "${MODPATH}/system/bin/blockdev"

[ ! -f "/system/bin/dd" ] && ln -s "${busybox}" "${MODPATH}/system/bin/dd"


cp "${MODPATH}/bins/partition-$(getprop ro.product.cpu.abi)" "${MODPATH}/system/bin/partition"
rm -rf "${MODPATH}/bins"

set_perm_recursive "${MODPATH}" 0 0 0755 0644
chmod +x "${MODPATH}/system/bin/partition"
