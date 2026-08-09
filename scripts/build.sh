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

# The source package.json has a prepublishOnly guard that prevents publishing
# from the repository root (which would ship .ts source files). Remove that guard
# from the build artifact so npm publish --access public can run from build/.
if command -v jq >/dev/null 2>&1; then
    jq 'del(.scripts.prepublishOnly)' ${BUILD_DIR}/package.json > ${BUILD_DIR}/package.json.tmp
    mv ${BUILD_DIR}/package.json.tmp ${BUILD_DIR}/package.json
fi

exit 0;