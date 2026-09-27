# HA hardware / install research (Sept 2026), from a research agent

- Install types: only Home Assistant OS (recommended) and Container remain supported; Core and Supervised deprecated 2025.6, unsupported from 2025.12; 32-bit dropped. (home-assistant.io blog 2025-05-22; installation/index)
- Add-ons renamed to **Apps** in HA 2026.2 (Settings > Apps > Install app). Apps only on HA OS.
- HA Green still sold; MSRP $199 / EUR 179 (home-assistant.io/green). Two 2026 price rises (RAM costs). UK stockists The Pi Hut, Pimoroni, Mouser UK. UK £ price UNVERIFIED, roughly £160-190.
- HA Yellow: end of production Oct 2025.
- Raspberry Pi 5: HA docs need Pi 4/5, 2GB+ RAM, A2 microSD 32GB+; Pi prices rose in 2026 (~$110 4GB, ~$175 8GB list; UNVERIFIED ~£105/£165). "Move data disk" for SSD.
- Generic x86-64: 64-bit, UEFI, Secure Boot off, 512-byte-sector boot drive.
- VM images: VirtualBox vdi, KVM/Proxmox qcow2, ESXi ova, Workstation vmdk, Hyper-V vhdx; min 2GB RAM 2 vCPU, UEFI.
- Nabu Casa cloud ~£6.50/month; not needed for LAN panel.
- HACS on HA OS: Settings > Apps > Install app > ⋮ > Repositories add https://github.com/hacs/addons; install+start "Get HACS" app; restart HA when log says; then Add integration > HACS; GitHub device auth at github.com/login/device. Container: `docker exec -it <container> bash` then `wget -O - https://get.hacs.xyz | bash -`. HACS min HA 2025.3.0.
- New dashboard UI: Settings > Dashboards > Add dashboard > New dashboard from scratch > Create; open it > pencil (Edit dashboard) > ⋮ > Raw configuration editor > paste > Save > Done.
- YAML dashboards: `lovelace: dashboards: <slug-with-hyphen>: mode: yaml, filename, title, icon, show_in_sidebar` supported; `resource_mode: yaml` for resources; old top-level `lovelace: mode: yaml` deprecated. YAML dashboards refresh via ⋮ > Refresh.
- Packages: `homeassistant: packages: !include_dir_named packages`.
- File editing apps: File editor (core_configurator), Studio Code Server, Samba share, Terminal & SSH.
