# Home Assistant: the box that runs the panel

The tablet only *displays* the dashboard. Home Assistant (HA) runs on a small always-on
computer on your home network, talks to Google, Octopus and Kia, and serves the dashboard
to the tablet.

## 1. Pick the hardware

| Option | Approx. cost (UK, Sept 2026) | Notes |
|---|---|---|
| **Home Assistant Green** ✅ recommended | ~£160–190 | Plug-and-play: power + Ethernet, done. Sold by The Pi Hut, Pimoroni and others. |
| Raspberry Pi 5 (4 GB) + PSU + SSD | ~£150+ | Cheaper only if you already have the parts. Use an SSD or a good A2 microSD (32 GB+). |
| Old PC / N100 mini PC | £0–175 | 64-bit, UEFI with Secure Boot off. Most powerful option. |
| Virtual machine on an always-on PC/NAS | £0 | Official HA OS images for Proxmox, VirtualBox, Hyper-V, VMware. 2 GB RAM and 2 vCPUs minimum. |

Use **Home Assistant OS** (not "Container") unless you already run Docker and know why you
want it. HA OS gives you one-click **Apps** (called "add-ons" before 2026.2) and backups.

You do **not** need a Home Assistant Cloud (Nabu Casa) subscription for this panel. The
tablet talks to HA over your home Wi-Fi.

## 2. Install and onboard

- Home Assistant Green: plug in Ethernet and power, wait about 5 minutes, and open
  <http://homeassistant.local:8123>.
- Other hardware: follow <https://www.home-assistant.io/installation/>.

During onboarding, set your **home location** (for weather), time zone **Europe/London**,
currency **GBP**, and metric units.

## 3. Install HACS (for the community cards and integrations)

1. Settings → **Apps** → **Install app** → ⋮ → **Repositories** → add `https://github.com/hacs/addons`.
2. Install and start the **Get HACS** app, and follow its log. When it says to, restart Home Assistant.
3. Settings → Devices & services → **Add integration** → **HACS**, tick the acknowledgements,
   then open <https://github.com/login/device>, enter the code and choose **Authorize HACS**.
   You need a free GitHub account.

Container installs: `docker exec -it homeassistant bash`, then `wget -O - https://get.hacs.xyz | bash -`,
then restart.

## 4. A way to edit files (for the optional package)

Settings → Apps → Install app → **File editor** (simplest), or **Studio Code Server**, or
**Samba share** to edit from your PC.

## 5. A user for the tablet

Settings → People → **Add person**, e.g. "Wall panel". Turn on **Allow login**, make the
username `panel`, and leave **Administrator** off. The tablet logs in as this user, so a
visitor poking at it can't change settings.

Next: set up the integrations (see the [set-up order](../README.md#set-up-order-about-an-afternoon)), then [install the dashboard](dashboard.md).
