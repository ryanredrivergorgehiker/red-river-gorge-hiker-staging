# Red River Gorge Hiker — Staging

This repository hosts the browser-based staging/UAT deployment for Red River Gorge Hiker.

Production source repository: `ryanredrivergorgehiker/red-river-gorge-hiker`

Production site: `https://redrivergorgehiker.com/`

Staging site: `https://ryanredrivergorgehiker.github.io/red-river-gorge-hiker-staging/`

The staging workflow builds a selected branch or commit from the production source repository with staging URL/base overrides, injects `noindex` directives into generated HTML, and publishes only to the staging GitHub Pages site. It does not deploy to the production domain.
