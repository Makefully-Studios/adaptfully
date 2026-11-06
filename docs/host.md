# Host bridge (`adaptfully.get('host')`)

Games should talk to the **platform shell** through Adaptfully’s `host` registration instead of branching on SpringRoll Bellhop vs Capacitor plugins. Two shells share one contract today; more can be added later.

## Contract

```js
const host = adaptfully.get('host');

host.kind; // 'springroll' | 'car' | 'noop'

await host.getEnvironment();
// springroll → 'springroll'
// car → 'phone' | 'android_auto' | 'aaos'
// noop → window.gameConfig.platform || 'web'

host.onPause((paused) => { /* mute / pause gameplay */ });
host.onCaptionsMuted?.((muted) => { /* … */ });
host.onVolume?.('music', (level) => { /* 0–1 */ });
host.onUxRestrictions?.((info) => { /* car only */ });
host.onEnvironment?.((environment) => { /* car: phone | android_auto | aaos */ });

host.setFeatures({ sound: true, captions: true });
host.notifyProgress(0.5, { stage: 'assets' });
host.notifyLoaded();
host.notifyEndGame?.();
host.send('custom-event', payload); // escape hatch
```

Mirror of the SpringRoll / SpringrollContainer vocabulary (`features`, `loaded`, `progress` / `loading`, `endGame`, `pause`, volumes, `captionsMuted`).

## Plugins

| Plugin key | Registration | Shell |
|------------|--------------|--------|
| `springroll-host` | `adaptfully.host.Springroll()` | [SpringrollContainer](https://www.npmjs.com/package/springroll-container) / Bellhop (iframe host) |
| `car-host` | `adaptfully.host.Car()` | Capacitor + Wrapfully `@makefully/capacitor-car-games` |
| `noop-host` | `adaptfully.host.Noop()` | No shell I/O (local web) |

### SpringRoll (`springroll-host`)

After you create a `springroll.Application`, bind it:

```js
const app = new Application({ features: { sound: true } });
const host = adaptfully.get('host');
host.bind(app);
host.onPause((paused) => audio.setPaused(paused));
// … load assets …
host.notifyLoaded();
```

`bind` wires `Application.state.pause` / volumes / captions and forwards `notify*` through `app.container.send` (same path Platypus, Alma Adventure, and Fancifully use with SpringRoll).

### Car / parked games (`car-host`)

Requires Capacitor packager + `platforms.<key>.carGames` (see Wrapfully README → Android → Car games, and [Android credentials](./credentials/android.md)).

```json
"android": {
  "packager": "capacitor",
  "carGames": true,
  "registrations": {
    "host": "car-host",
    "storage": "localStorage"
  }
}
```

`carGames: true` enables **Android Auto + AAOS**. Object form selects subsets:

```json
"carGames": { "androidAuto": true, "automotive": false }
```

**Parked-game obligations (developer):**

1. Pause gameplay **and audio** when `host.onPause(true)` (activity pause, leave car display, or AAOS UX restrictions).
2. Do not resume audio until `onPause(false)` / parked again.
3. Layout for car aspect ratios (avoid heavy pillarboxing on landscape Auto).
4. Prefer `host.getEnvironment()` / `host.onEnvironment()` over sniffing user agents when you need Auto vs phone vs AAOS. `onEnvironment` fires when the activity moves between the car display and the phone, including while Android Auto stays connected. Resume also re-queries `getEnvironment()`.

Wrapfully patches the Android manifest (`CAR_LAUNCHER`, `appCategory="game"`, optional automotive feature) and installs the Cap plugin. Play Console form-factor opt-in (Android Auto + Automotive OS) remains a manual Console step.

### Migrating from raw SpringRoll

| Before | After |
|--------|--------|
| `app.state.pause.subscribe(...)` | `host.onPause(...)` after `host.bind(app)` |
| `app.container.send('loaded')` | `host.notifyLoaded()` |
| `app.container.send('progress', n)` | `host.notifyProgress(n)` |

You can keep constructing `Application` yourself; the host adapter does not replace SpringRoll, it wraps it.
