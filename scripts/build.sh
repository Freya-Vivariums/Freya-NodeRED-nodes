#!/bin/bash

##
#   build.sh
#   Build the node-red-contrib-freya package
#
#

BUILD_DIR=build

# Remove the old build folder
echo -e "Removing folder '$BUILD_DIR'";
rm -rf $BUILD_DIR/;

# Convert the TypeScript to JavaScript
tsc;

# Copy all the nodes their html files to their right sub-folder in the build/ folder
rsync -av --include='*/' --include='*.html' --exclude='*' nodes/ ${BUILD_DIR}/nodes/

# Copy all required files to the build folder
cp -r icons/ package.json README.md LICENSE.txt ${BUILD_DIR}/;

exit 0;