#!/bin/zsh
# Run Blender for the Demolition Derby build scripts. Factory settings keep the builds independent of
# Patrick's own preferences and add-ons (and keep the MCP bridge out of it).
exec /Applications/Blender.app/Contents/MacOS/Blender --factory-startup "$@"
