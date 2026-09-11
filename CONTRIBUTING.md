# Development

Keep the `isr_gui` and `isr_mission_planning` folders alongside each other: the optional evidence exporter uses that layout. Run commands from the indicated project directory. No environment variables are required for normal local use.

## Checks

GUI (Node.js 22.6+, recommended Node 22 via the root `.nvmrc`):

```bash
cd isr_gui
npm ci
npm run check
```

Planner (uv selects Python 3.12 from `.python-version`):

```bash
cd isr_mission_planning
uv sync --locked --extra dev
uv run --locked pytest
uv run --locked isr-mission-planning solve --scenario data/scenarios/small/small_seed_42.json --solver greedy --no-figures
uv build
```

GitHub Actions runs these checks on pushes and pull requests. Three native ORBIT integration tests skip when the optional SDK/simulator are absent. The default CI checks the portable baseline; optional native integrations must also be checked in an environment with access to those packages.

Commit both dependency manifests and their lockfiles when changing dependencies. Update `uv.lock` using `uv lock` and `package-lock.json` using npm. Keep generated outputs and local environment files out of commits. Retain source scenarios and evidence provenance when updating recorded results.

## Publishing to GitHub

From the repository root, inspect `git status --short` and the files to be included before creating the initial commit. Create an empty GitHub repository, then replace the URL below with its actual URL:

```bash
git add .
git diff --cached --stat
git commit -m "Prepare ISR mission planning workspace"
git remote add origin https://github.com/OWNER/REPOSITORY.git
git push -u origin main
```

Choose the repository's visibility and license with the project owner. No remote URL or license is assumed by the setup.

## Troubleshooting

- `npm ci` fails: check the Node version and registry access. Use the committed lockfile.
- Build fails downloading fonts: allow access to Google Fonts; `src/app/layout.tsx` uses `next/font/google`.
- Port 3000 is occupied: use `npm run dev -- --port 3001`.
- ORBIT unavailable: use `--solver greedy`, or follow the optional SDK setup in the planner README.
- Missing evidence-export inputs: normal GUI startup does not run the exporter. See the GUI README before regenerating evidence.
- Incorrect notebook kernel: register and select the project kernel as described in the planner README.
