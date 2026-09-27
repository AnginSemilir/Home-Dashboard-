# Running Home Assistant on the tablet itself

> Research for the earlier Home Assistant plan (superseded by the web app on 25 Sep 2026). Kept for reference; many facts still apply.

<details><summary>The question asked</summary>

Research task (read-only; do not edit any files). Today is 2026-09-25. A UK user wants to run Home Assistant (HA) DIRECTLY ON a Lenovo Tab M10 Android tablet (the same tablet that shows the wall dashboard), for free, with no other always-on hardware, while keeping full functionality: HA 2026.9 with the Google Nest (SDM + Pub/Sub, WebRTC camera), BottlecapDave Octopus Energy (HACS), Google Calendar, Met.no, Kia Uvo (HACS) integrations, HACS frontend cards, and a dashboard viewed in the HA Companion app on the same tablet via http://127.0.0.1:8123.

Find out, with current (2025-2026) evidence:
1. Is running HA on Android via Termux viable in 2026? Approaches: (a) native Termux Python venv, (b) proot-distro Debian/Ubuntu + Python venv ("Home Assistant Core" install), (c) Android 15/16 "Linux Terminal" / Android Virtualization Framework Debian VM (which devices support it — does any Lenovo Tab M10 with MediaTek Helio P22T/G80, Unisoc T610 or Snapdragon 680/695 support pKVM/AVF? almost certainly not, confirm), (d) Docker/UserLAnd/other apps, (e) any maintained project/scripts (search GitHub/forums: "home assistant termux", "homeassistant proot-distro", "hass on android 2025", "Home Assistant Core Android phone server").
2. HA 2026.9 requires Python >= 3.14.2: can that be obtained in Termux (termux `python` package version in 2026) or inside proot Debian (uv python-build-standalone aarch64 builds), and do HA's compiled dependencies (cryptography, orjson, numpy, grpcio for Nest Pub/Sub via google-cloud-pubsub, av/PyAV, zeroconf, PyTurboJPEG, pydantic-core, etc.) have aarch64 manylinux wheels (inside proot glibc) or build on Termux (bionic)? Note HA's "Core" install method was deprecated in 2025.6 and unsupported from 2025.12 — what does 'unsupported' mean in practice (still installable via pip? repairs warnings?).
3. Android-side reliability: the Android 12+ "phantom process killer" (max 32 child processes; the adb `device_config put activity_manager max_phantom_processes` fix and the Android 14 developer option "Disable child process restrictions"), battery optimisation / Lenovo background killing, termux-wake-lock, Termux:Boot autostart (F-Droid/GitHub builds vs Play Store Termux), memory needs of HA core (typical RAM with ~10 integrations) vs M10 RAM (2-6 GB), CPU/thermal on Helio P22T/G80, storage wear, and time to start under proot.
4. Networking: HA's OAuth flows for Nest/Google Calendar use https://my.home-assistant.io/redirect/oauth — does account linking work when HA is at 127.0.0.1/localhost on the same device (the my.home-assistant.io redirect needs the HA URL configured; which URL should be set)? Does Google Pub/Sub (pull via grpc) work behind NAT (yes, it's a pull subscription — confirm HA Nest uses pull). mDNS/zeroconf in proot (likely failing, harmless?).
5. Overall verdict: realistic reliability for a 24/7 wall panel, the concrete recommended recipe (commands) if viable, and the main risks. Also list the cheapest "free if you already own it" alternatives (old laptop/PC with HA OS, old Android phone via the same Termux method) and their trade-offs.

Tools: load WebSearch via ToolSearch ("select:WebSearch"); most sites are blocked for WebFetch but raw.githubusercontent.com works via Bash curl and `git clone --depth 1` from github.com works; PyPI JSON API (https://pypi.org/pypi/<pkg>/json) works via curl to check wheel availability for aarch64/musllinux/android. Mark each claim VERIFIED or UNVERIFIED. Final report: under ~900 words, ending with a verdict and a step-by-step recipe outline.

</details>

I could not find anything that prevents this setup, but it isn't a supported configuration. HA 2026.9 can run on the tablet inside Termux using a Debian environment (proot-distro) with a Python virtualenv, and every integration you listed should work. The weak points are Android killing the process, the proot layer, and relying on one aging tablet for everything. I could not test it on a real M10. Community sites (HA forum, Android Authority, the blogs) were blocked, so some claims rest on search snippets and are marked that way.

## 1. Approaches
- **(a) Native Termux venv: not viable.** Termux does ship Python 3.14.6 (VERIFIED). But HA 2026.9.3 pins older versions than Termux ships: cryptography 48.0.1 vs 50.0.1, numpy 2.3.2 vs 2.4.4, grpcio 1.78.0 vs 1.84.0 (VERIFIED). PyPI has no Android wheels for orjson, pydantic-core, numpy, grpcio or av, so all of these would have to compile on the tablet. The known installer script (talss89) was last updated in 2023 for HA 2023.4.
- **(b) proot-distro Debian + uv venv: most viable.** The mayukh4/linux-android script (updated Aug 2026) uses this method, and its README covers 3.14 through `uv python install 3.14` (VERIFIED). Proot 5.1.107.75 fixed the `getifaddrs()` crash; Termux currently ships 5.1.107.95 (VERIFIED). Its README says first launch takes 5–10 min; I have no numbers for later starts.
- **(c) Android "Linux Terminal" (AVF): impossible.** It needs Android 15+ plus pKVM support for non-protected VMs. Only Tensor, Exynos and Dimensity chips support that; Snapdragon doesn't. No Tab M10 gets past Android 14 (the M10 5G gets 14, Plus Gen 3 gets 13, HD Gen 2 stays on 10/11). Helio P22T/G80 and Unisoc T610 have no pKVM. VERIFIED from secondary sources.
- **(d) udocker running the official HA image:** huytungst/HomeAssistant-Termux (updated July 2026) does this. The image carries a `/OFFICIAL_IMAGE` marker, so HA counts itself a "Container" install and shows no unsupported warning (VERIFIED in code). proot-distro 5.9 can also pull OCI images directly, but I did not test that with HA. Known problems: bluetooth, usb and zeroconf setup fail, and termux-packages issue #30112 (June 2026) reports Python 3.14 threads duplicating under proot and using CPU while idle. That issue probably affects (b) as well (UNVERIFIED). UserLAnd and Andronix are also proot-based; Linux Deploy needs root.

## 2. Python and wheels
- HA 2026.9.3 requires Python ≥3.14.2 (VERIFIED on PyPI). uv can install CPython 3.14.7 for linux-aarch64-gnu (VERIFIED).
- Wheels (glibc aarch64 builds for Python 3.14) exist for every compiled dependency you'd hit (VERIFIED on PyPI): cryptography, orjson, numpy, grpcio, av, zeroconf, pydantic-core, aiohttp, SQLAlchemy, Pillow, pycryptodome, google-crc32c and uv. google-cloud-pubsub, google-nest-sdm, PyTurboJPEG and hyundai_kia_connect_api are pure Python. So in Debian nothing compiles.
- **"Unsupported" Core install in practice (VERIFIED in code):** `pip`/`uv` upgrades still work. You get a permanent Repairs warning ("Unsupported installation method") that can't be fixed, and bug reports aren't accepted.
- HA must run inside a venv or container, because an `unsupported_local_deps` issue "breaks in 2026.11".
- The `go2rtc` integration is silently skipped on non-docker installs. Nest's WebRTC cameras don't need it.

## 3. Android reliability
- **Phantom process killer (VERIFIED):** it kills child processes beyond 32 and also any using "excessive CPU".
  - Android 14: turn on Developer options → "Disable child process restrictions". Developer options must stay enabled or the setting reverts.
  - Android 12L/13: run `adb shell settings put global settings_enable_monitor_phantom_procs false` once; it survives reboots.
  - The older `device_config … max_phantom_processes` setting resets on reboot unless you also run `set_sync_disabled_for_tests persistent`.
- **Lenovo background killing:** lock Termux in the recent-apps view (padlock icon), set battery to Unrestricted, and use `termux-wake-lock`. dontkillmyapp says Lenovo kills unlocked apps anyway.
- **Termux:Boot:** it must come from the same source as Termux (F-Droid or GitHub builds). The Play Store Termux line stopped updating at v0.101. Boot scripts only run after the first unlock.
- **RAM:** typical HA use is about 0.5–1.5 GB (UNVERIFIED; HA's official minimum is 2 GB). 2–3 GB tablets are not realistic. A 4 GB model is tight alongside the Companion app. 6 GB is comfortable.
- **Wear and heat (UNVERIFIED):** the recorder database writes constantly to eMMC flash, so limit history. Proot adds CPU overhead on the older chips. The battery sits on charge 24/7, so turn on Lenovo's battery protection/charge limit if your model has it.

## 4. Networking
- **OAuth:** the redirect URI is always `https://my.home-assistant.io/redirect/oauth`. My HA then forwards to `<stored URL>/auth/external/callback`, and it accepts `http://127.0.0.1:8123` (VERIFIED in source). The Companion app also catches `/redirect/` links and sends them to its own configured server (VERIFIED in its manifest and code). So account linking on the tablet itself should work (UNVERIFIED on a device).
  - Publish the Google OAuth app to "In production", otherwise refresh tokens expire after 7 days.
  - Nest Device Access has a one-off US$5 fee, so it isn't strictly free if you haven't already paid it.
- **Pub/Sub:** google-nest-sdm uses outbound gRPC streaming pull (VERIFIED in its source), so it works behind NAT with no port forwarding.
- **mDNS/zeroconf:** limited or broken under proot. That's harmless here because none of your integrations need discovery.

## 5. Verdict
**Viable, but best effort.** Expect it to go down every few weeks: after OS updates, when the phantom process setting reverts, after memory pressure or after a reboot (UNVERIFIED estimate). You also lose Bluetooth, USB and add-ons. It's only sensible on a 4–6 GB M10, with HA backups stored off the tablet.

**Recipe outline:**
1. Install Termux and Termux:Boot from F-Droid, open Termux:Boot once, then run `pkg upgrade && pkg install proot-distro android-tools`.
2. Disable the phantom killer. On Android 14 use the developer-option toggle. On Android 13, pair over Wireless debugging from inside Termux, then run `adb shell settings put global settings_enable_monitor_phantom_procs false`. Set Termux battery to Unrestricted, lock it in recents, and turn on "Stay awake" and the charge limit.
3. `proot-distro install debian`, then `proot-distro login debian`.
4. `apt install -y curl ca-certificates ffmpeg libturbojpeg0 tzdata git`, then `curl -LsSf https://astral.sh/uv/install.sh | sh`, then `uv venv --python 3.14 /srv/hass`, then `uv pip install --python /srv/hass/bin/python homeassistant==2026.9.3`.
5. First run: `/srv/hass/bin/hass -c /root/ha` and wait up to about 10 minutes. Optionally replace `default_config:` with an explicit list without bluetooth, usb, zeroconf, ssdp and dhcp (keep `mobile_app`, `my`, `stream`). Set `recorder: purge_keep_days: 5, commit_interval: 30`.
6. Create `~/.termux/boot/ha` containing `termux-wake-lock; proot-distro login debian -- /srv/hass/bin/hass -c /root/ha >>~/ha.log 2>&1`.
7. Install HACS (`wget -O - https://get.hacs.xyz | bash -` in `/root/ha`), then Octopus Energy and Kia Uvo.
8. Point the Companion app at `http://127.0.0.1:8123`. In Google Cloud, set the redirect URI to the My HA OAuth URL above; if My HA asks, enter `http://127.0.0.1:8123`.
9. Upgrade with `uv pip install -U homeassistant` and set up regular off-device backups.

**Main risks:** Android or Lenovo killing the process, proot CPU bugs (#30112), running out of RAM, eMMC wear, a swollen battery, the permanent unsupported-install warning, and a single device being both dashboard and server.

**Free alternatives if you already own the hardware:**
- **Old laptop or PC with HA OS:** fully supported with add-ons, the most reliable option. Costs about 8–20 W of electricity (UNVERIFIED) and needs space.
- **Old Android phone using the same method:** takes load and RAM off the dashboard tablet, but has the same fragility.
- **An always-on PC running an HA OS VM:** fine if it's genuinely on 24/7.

Sources: [Termux python build.sh](https://github.com/termux/termux-packages/blob/master/packages/python/build.sh), [mayukh4/linux-android](https://github.com/mayukh4/linux-android), [huytungst/HomeAssistant-Termux](https://github.com/huytungst/HomeAssistant-Termux), [Termux-Proot-Utils](https://github.com/George-Seven/Termux-Proot-Utils), [termux-packages #30112](https://github.com/termux/termux-packages/issues/30112), [phantom-process doc](https://github.com/agnostic-apollo/Android-Docs/blob/master/en/docs/apps/processes/phantom-cached-and-empty-processes.md), [HA deprecation blog](https://www.home-assistant.io/blog/2025/05/22/deprecating-core-and-supervised-installation-methods-and-32-bit-systems/), [my.home-assistant.io source](https://github.com/home-assistant/my.home-assistant.io), [python-google-nest-sdm](https://github.com/allenporter/python-google-nest-sdm), [Android Authority on Linux Terminal chips](https://www.androidauthority.com/snapdragon-chips-android-linux-terminal-3608648/), [dontkillmyapp Lenovo](https://dontkillmyapp.com/lenovo), [Termux:Boot](https://github.com/termux/termux-boot), [M10 5G Android 14](https://tabletmonkeys.com/lenovo-tab-m10-5g-launched/), [HA community thread 788933](https://community.home-assistant.io/t/simple-and-fast-installing-home-assistant-core-and-matter-server-on-android-no-root-no-qemu/788933).
