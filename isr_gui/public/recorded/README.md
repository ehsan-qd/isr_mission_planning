# Recorded mission evidence

`mission-evidence.json` is the included, standalone GUI data fixture. Keep it in
Git: the showcase and presentation load it directly from `/recorded/mission-evidence.json`.
The browser game runs its own simulation.

The fixture contains synthetic scenarios, saved plans, independent validations,
benchmark rows for three seeds at each scale, and a historical p-bit/p-dit
comparison. It is software-simulator evidence, not live or hardware execution.

Refresh with `npm run sync:recorded` only after generating all planner inputs.
See the [GUI README](../../README.md#refresh-measured-evidence) for commands and
version/provenance limitations. Normal installation does not require regeneration.
