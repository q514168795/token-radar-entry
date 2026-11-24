# token-radar-01

[![make.fun](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/q514168795/token-radar-entry/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard)
[![reward](https://make.fun/badge/token-radar-01/q514168795/token-radar-entry/reward.svg)](https://make.fun/bounty/token-radar-01)

A token launch radar: every pre-token protocol on the sealed DefiLlama snapshot, ranked by an implied
value derived only from that snapshot's own figures — TVL, its seven-day change, how many chains it runs
on, and how long it has carried TVL without issuing a token.

`node main.ts` reads `/input/snapshot.json` and writes `board.json`, `data.js`, copies `dashboard/` and
`screenshots/`, and writes the dossier. Run it locally with
`mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>`.
