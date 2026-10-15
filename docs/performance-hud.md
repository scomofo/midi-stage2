# Performance HUD

Score, streak, current multiplier and accuracy stay on one row. Personal best
joins that row on wide screens. Overdrive has a separate row with a labeled
charge meter, a clear activation target and the **Shift + Enter** shortcut.

Successful notes charge Overdrive. At 30%, **Activate** becomes available during
human play. Activation doubles each charged part's current multiplier; it does
not promise a fixed 8×. The multiplier stat shows the actual current value.
Count-in, ready, paused and autoplay cannot activate a boost. The shortcut leaves
ordinary Enter transport behavior, mapped instrument keys, forms and dialogs
with their existing owners. Repeated keydown events do not activate it.

Pause retains and displays both charge and active state without draining the
meter. Resuming restores the same boost. Reset clears charge with the new set.
No scoring thresholds, charge rates or multiplier rules changed.

## Validation

`npm run test:performance-hud` exercises the real React session and Judge with a
controlled song clock. It verifies the threshold, count-in, keyboard activation,
actual 2× multiplier from a 1× base, retrigger prevention, pause/resume, dialog and
form focus, focused-button activation, reset and autoplay. It also checks a single
score row, minimum 44px activation target and no overflow at 1440, 1280 and 1024px.

Set `SESSION_SCREENSHOT_DIR` under `/workspace/screenshots` to retain ready-state
captures at those widths plus a paused laptop capture. The dedicated CI job
uploads them as `performance-hud-browser-acceptance`. Desktop captures are reviewed
for the score row, control spacing and readable highway. This pass targets laptop
and desktop play; mobile-specific improvements are deferred at the user's request.
