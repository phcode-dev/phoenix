#!/usr/bin/env bash
# SAMPLE / REFERENCE ONLY - a fake linux installer for testing the admin update override.
#
# The real linux update runs:  wget -qO- "$UPDATE_URL" | bash -s -- --upgrade
# so this stands in for updates.phcode.io/linux/installer.sh and installs nothing.
#
# Point app_update_linux_installer_url at it in phoenix_override_config.json (see
# localOverride.json in this folder), with the dev server serving the repo on :8000:
#   http://localhost:8000/src/extensionsIntegrated/appUpdater/unit-tests/linux-local-update-override-script.sh
#
# Phoenix spawns this in an external terminal at app quit and waits for a keypress, so you
# get to read the output before the window closes.

echo "================================================"
echo " update done"
echo "================================================"
echo "This is the LOCAL OVERRIDE installer, not the real one."
echo "If you are seeing this, app_update_linux_installer_url was honoured."
echo
echo "args passed by phoenix : $*"
echo "user                   : $(id -un)"
echo "date                   : $(date)"
echo
echo "Nothing was installed or changed."

exit 0
