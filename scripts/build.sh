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

# Rewrite build/package.json for publishing from the build/ directory:
# - strip prepublishOnly (not needed when publishing from build/)
# - rewrite files and node-red.nodes paths from build/nodes -> nodes
#   so `npm publish build/` and `npm publish` from root produce the same layout
jq '
  del(.scripts.prepublishOnly) |
  .files = ["icons","nodes"] |
  ."node-red".nodes |= with_entries(.value |= ltrimstr("build/"))
' ${BUILD_DIR}/package.json > ${BUILD_DIR}/package.json.tmp
mv ${BUILD_DIR}/package.json.tmp ${BUILD_DIR}/package.json

exit 0;