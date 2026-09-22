# artifacts/

Planning and working documents for `mc-mod`. Read in this order:

| File | What it's for |
|---|---|
| [progress.md](progress.md) | Phase checklist + session log. **Source of truth for "what's next".** |
| [architecture.md](architecture.md) | System design: layout, modules, domain model, algorithms, security |
| [zod-contract.md](zod-contract.md) | Zod-everywhere rules + shared API contract pattern (`defineEndpoint` / `route` / `call`) |
| [api-spec.md](api-spec.md) | Endpoint table (summary of the contract code) |
| [ui-spec.md](ui-spec.md) | Views, layout, components |
| [instance-detection.md](instance-detection.md) | How we detect version/loader and parse jar metadata |
| [external-apis.md](external-apis.md) | Modrinth + CurseForge endpoints and quirks |
| [setup-commands.md](setup-commands.md) | Official init commands for every package |
| [releasing.md](releasing.md) | Versions, the release workflow, npm and binary publishing |
| [decisions.md](decisions.md) | ADR log |
| [open-questions.md](open-questions.md) | Unresolved choices with the defaults assumed |
