# q514168795/token-radar-entry

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/q514168795/token-radar-entry/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/q514168795/token-radar-entry/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A comparables-priced token launch radar built for make.fun's "Build the best token launch radar" bounty ($1,325 in USDC). `main.ts` reads the sealed DefiLlama snapshot, prices every pre-token protocol against traded peers in the same category, adjusts for seven-day TVL flow and the time it has tracked without a token, applies risk haircuts, and writes a ranked board and an offline dashboard with a detail view and a six-step farm plan for each row. It copies the pre-rendered screenshots/ from the repository into the output and validates their size and dimensions. Traded protocols stay in a separate comparables table; no protocol name is special-cased.

The dashboard is plain HTML, CSS and JavaScript with no network access: it reads a local data script that `main.ts` writes from the same figures as `board.json`. Rerun the program against a newer snapshot to refresh the whole artifact.

## Run it

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
# open out/dashboard/index.html in a browser
```

The grader mounts the snapshot at `/input/snapshot.json` and reads `/output`; the same program writes there with no flags.

## How the value is built

`TVL × category peer cap/TVL × (1 + 0.45 × clamped 7d%) × (0.70 + 0.30 × log tenure) × risk haircut × data confidence`. Peer multiples, growth, tenure and flags all come from the snapshot itself. Every implied value is this dashboard's own estimate, not a prediction that a token will be issued and not investment advice.

---

<sub>Entered on [make.fun](https://make.fun/?ref=93fa4mdc&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
