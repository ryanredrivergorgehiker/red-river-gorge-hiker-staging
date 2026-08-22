# Red River Gorge Hiker — Staging

This repository hosts the browser-based staging/UAT deployment for Red River Gorge Hiker.

Production source repository: `ryanredrivergorgehiker/red-river-gorge-hiker`

Production site: `https://redrivergorgehiker.com/`

Staging site: `https://ryanredrivergorgehiker.github.io/red-river-gorge-hiker-staging/`

The staging workflow builds an exact branch, tag, or commit from the production source repository with staging URL/base overrides, injects `noindex` directives into generated HTML, and publishes only to the staging GitHub Pages site. It does not deploy to the production domain.

## Normal staging deployment path

ChatGPT should normally deploy staging without requiring Ryan to use the GitHub Actions interface.

1. Build and verify one clean UAT candidate in `ryanredrivergorgehiker/red-river-gorge-hiker`.
2. Record the exact candidate commit SHA.
3. Update `.staging-source-ref` in this repository. The first line must be the exact source commit SHA. Additional lines may record request metadata such as timestamp or purpose.
4. A push affecting `.staging-source-ref` automatically runs `Deploy staging preview`.
5. The workflow resolves the first line of `.staging-source-ref`, checks out that exact source SHA, runs the normal repository checks, builds with the staging URL/base, verifies staging safeguards, and deploys GitHub Pages.
6. ChatGPT verifies the staging deployment before asking Ryan for UAT review.

Ryan should not normally need to click **Run workflow** for staging deployments.

## Emergency/manual fallback

The workflow retains `workflow_dispatch` so a human can still supply a source branch, tag, or commit SHA manually if the automated control-file path is unavailable. This is a fallback, not the normal operating procedure.

## Production boundary

A staging deployment never authorizes or performs a production deployment. Production promotion occurs only after Ryan explicitly approves the tested UAT candidate. The normal production promotion path is to fast-forward production `main` to the exact approved UAT SHA when it remains a clean fast-forward, allowing the existing production GitHub Pages workflow to deploy automatically.
