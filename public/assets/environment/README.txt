GENERATED FILES - do not put downloads here.

These optimised environment kits (trees, rocks, grass, mountains, sand) are built by
    npm run build:env
from the original downloads in  Assets/environment-source/<category>/ .

To add a new asset:
  1. Put the downloaded .glb in Assets/environment-source/<rocks|trees|grass|mountains|sand>/
  2. Add it to the KITS list in scripts/build-environment.mjs (which objects to extract,
     how much to simplify) and run  npm run build:env
  3. Use its prototype names in src/environment/environmentConfig.js (scale, placement)
  4. Credit the author in src/environment/credits.js and CREDITS.md (CC BY requires it)
