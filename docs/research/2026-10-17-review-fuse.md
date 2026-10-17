# Independent review of the Fuse change (17 Oct 2026)

One reviewer (a separate agent, with a second look from reproduction scripts) read the Fuse change against the plan ([docs/plans/2026-10-17-fuse-usage.md](../plans/2026-10-17-fuse-usage.md)), looking at seven things: secrets and the never-send-a-text-by-itself rule, token rotation, time and money, the wording of every state, the Settings flow, the relay code, and licences. It ran the unit tests and small scripts and reproduced most findings (a few were by reading only). The browser tests were not run by the reviewer. They ran separately and passed.

## Sound (no defect found)

- A text message can only be asked for by the **Send code** button: nothing on page load, in the poller's retry, on a visibility change, on opening Settings, on reload, or in a second tab reaches the sign-in calls. A signed-out panel makes no network calls at all.
- Tokens, the device ID and the code appear only in headers and bodies, never in a URL, a log line or an error message. They are not in "Copy settings" or in the cache.
- The 25-hour (25 Oct 2026) and 23-hour (29 Mar 2026) day mappings, the yesterday refetch rule, "yesterday midnight", and the cost as the sum of the breakdown all behaved correctly.
- Octopus and Bright modes are unchanged.
- The relay worker works with what the panel sends, and its allowlist is sound.
- Licence headers and NOTICE are right; nothing was taken from the unlicensed Kotlin project; no real personal data in tests or docs.

## Defects found, and what was done (all fixed in the commit that follows this note)

| # | Finding | Fix |
|---|---|---|
| 1 | A renewal's answer was applied without checking the session was still the same one. Signing out while a renewal was in flight was undone, and a fresh sign-in could be wiped by the old session's refused renewal. | After the answer, storage is read again. If the session changed (signed out, or signed in afresh) the answer is dropped and the current session wins. |
| 2 | Any 4xx on a renewal except 429 signed the panel out (a firewall's or relay's 403 or 404, a 426, a 408 …), and that forced a new text message. | Only 400, 401, or a 403 that carries Fuse's own reason end the session. Everything else keeps the sign-in and says what happened. |
| 3 | If the property look-up failed after a correct code, the user was stuck: pressing the button again hit "Press Send code first". | The button retries the look-up with no new code. |
| 4 | Wrong wording: a 403 on "Send code" blamed the code (there is no code yet); 429 and 426 on the text-message call said "press Send code again". | Words by step: Fuse or a relay turned the request away (see docs/fuse.md), wait a few minutes, update FUSE_APP_VERSION. |
| 5 | A gas meter that sent only its standing charge made the total disagree with the parts shown; a gas-only account showed an electricity chip and a readings time of "now". | A fuel counts once it has usage. One-fuel accounts show only that fuel. The readings time is the newest of either fuel. |
| 6 | If the browser's storage refused writes but still read, the next renewal used the dead refresh token. | The copy in memory wins after a failed write. |
| 7 | On the clock-change day two bars were marked "in progress". | A repeated hour is told apart by the clock alone. |
| 8 | "+44 (0)7700 900123" kept the trunk 0. | Dropped. |
| 9 | Kept figures from a different Fuse account could show as "yesterday" for a couple of hours. | Cached days and the newest-reading note carry the property's ID, and others are ignored. |

Smaller: the relay's path pattern now accepts any ID characters (`[\w-]+`) rather than only lower-case hex; docs/fuse.md says to keep the worker's address private (its page check stops other websites, not other programs); the privacy page now says "Copy settings" includes the mobile number and the address line.

Each fix has a test that fails without it (unit tests for 1, 2, 4, 6, 7, 8; browser tests for 3, 5, 9).
