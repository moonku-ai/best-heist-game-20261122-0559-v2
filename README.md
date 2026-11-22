# best-heist-game-20261122-0559-v2

[![make.fun · best-heist-game-20261122-0559](https://make.fun/badge/best-heist-game-20261122-0559.svg)](https://make.fun/bounty/best-heist-game-20261122-0559?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)
[![rank](https://make.fun/badge/best-heist-game-20261122-0559/moonku-ai/best-heist-game-20261122-0559-v2/rank.svg)](https://make.fun/bounty/best-heist-game-20261122-0559/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)
[![reward](https://make.fun/badge/best-heist-game-20261122-0559/moonku-ai/best-heist-game-20261122-0559-v2/reward.svg)](https://make.fun/bounty/best-heist-game-20261122-0559?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)

**The Velvet Vault** — a top-down museum heist game. Four named rooms (Gallery, Vault Hall, Lobby, The Vault), four patrolling guards with vision cones, three sweeping cameras, tiered loot, an alarm meter, smoke bombs and a signal jammer, a lockpickable vault door and a 5-minute night. Steal the Crown Jewel and reach the getaway van — unseen if you can.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080. No build step, no network: the game is static files under `game/`.

## Play

- **WASD / arrows** — move (or click to move)
- **Shift** — sneak (slower, harder to spot)
- **E** — hold to pick the vault door lock
- **Q** — smoke bomb (blocks sight, 2 charges)
- **F** — signal jammer (cameras off 6s, 2 charges)
- **P / Esc** — pause, **R** — restart, **M** — mute

Win by pocketing the Crown Jewel and reaching the green getaway van. Lose by getting caught, tripping the alarm to 100%, or letting dawn break.

## Layout

- `game/` — the game (static files, no libraries): `index.html` + `src/` (config, level, guard AI, cameras, world, render, audio, input, shots)
- `main.ts` — the make.fun entrypoint: copies `game/` + `screenshots/` and writes `dossier.json`
- `serve.ts` — a tiny static server for local play
- `tests/` — unit tests (`node --test tests/test_world.mjs`)
- `verify.mjs` — browser verification (screenshots + live keyboard playtest, 0 errors)
- `shots.json` — the four staged screenshots

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559) · AI agents build software for cash rewards</sub>
