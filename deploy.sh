#!/bin/bash

##
#   Deploy.sh
#   Deploys the Freya nodes to your development device on your
#   local network (using sshpass).
##

ROOTDIR="/opt/Freya/nodered"
PACKAGE="node-red-contrib-freya"

DEFAULT_USER=spuq
DEFAULT_HOST=192.168.1.113

# empty the terminal
clear;

# Check whether sshpass is installed
if [[ -z $(which sshpass) ]]; then
    echo "install sshpass to continue. (sudo apt install sshpass)"
    exit 1;
fi

# Remote access credentials
echo -e '\e[0;33m-------------------------------------- \e[m'
echo -e '\e[0;33m For accessing the remote device, the  \e[m'
echo -e '\e[0;33m login credentials are required.       \e[m'
echo -e '\e[0;33m-------------------------------------- \e[m'
# Enter the IP address of the Edgeberry device
read -e -i "$DEFAULT_HOST" -p "Hostname: " HOST
if [[ -z "$HOST" ]]; then
    HOST=$DEFAULT_HOST
fi
# Enter the remote user name
read -e -i "$DEFAULT_USER" -p "User: " USER
if [[ -z "$USER" ]]; then
    USER=$DEFAULT_USER
fi
# Enter the remote user password
# note: character display disabled
stty -echo
read -p "Password: " PASSWORD
stty -echo
echo ''
echo ''

# Uninstall the previous version of the package
echo -e "\e[0;32mRemoving the previous version of this package $PACKAGE... \e[m"
sshpass -p ${PASSWORD} ssh -o StrictHostKeyChecking=no ${USER}@${HOST} "cd $ROOTDIR; npm uninstall $PACKAGE"

# Create a temporary directory on the device for copying the package files to
echo -e '\e[0;32mCreating temporary directory for the package... \e[m'
sshpass -p ${PASSWORD} ssh -o StrictHostKeyChecking=no ${USER}@${HOST} "mkdir ~/$PACKAGE-temp"

# Copy the relevant project files to the device
echo -e '\e[0;32mCopying project to device...\e[m'
sshpass -p ${PASSWORD} scp -r ./package.json ./nodes ./icons ${USER}@${HOST}:${PACKAGE}-temp/

# Install the new version of the package
echo -e "\e[0;32mInstalling the new version of this package $PACKAGE... \e[m"
sshpass -p ${PASSWORD} ssh -o StrictHostKeyChecking=no ${USER}@${HOST} "cd $ROOTDIR; npm install file:~/$PACKAGE-temp/"

# Remove our temporary directory
echo -e "\e[0;32mRemoving temporary directory... \e[m"
sshpass -p ${PASSWORD} ssh -o StrictHostKeyChecking=no ${USER}@${HOST} "rm -rf $PACKAGE-temp/"

# Restart Node-RED
echo -e "\e[0;32mRestarting Node-RED... \e[m"
sshpass -p ${PASSWORD} ssh -o StrictHostKeyChecking=no ${USER}@${HOST} "sudo systemctl restart nodered.service"

exit 0;