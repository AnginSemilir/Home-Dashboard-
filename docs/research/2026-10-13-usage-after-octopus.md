# Usage data after leaving Octopus (Home Mini, Fuse, Glow/Bright, browser access)

**Researched:** 13 Oct 2026, after the switch from Octopus (Agile) to Fuse Energy (fixed). Four research streams, each fact-checked independently. Many sites (octopus.energy, fuseenergy.com, shop.glowmarkt.com, forums) were blocked from the research environment, so some claims rest on search extracts; the fact-check notes below say which.

**Status:** Current. The questions still open at the time: whether api.glowmarkt.com allows browser (CORS) calls, and when Glow hardware will be back in stock.

## The Octopus Home Mini after leaving Octopus

#### Bottom line (as of 2026-10-13)

**Don't build the post-switch panel on the Home Mini.** It is an Octopus-only device. Its readings reach you only through Octopus's cloud and an Octopus account. I found no Octopus statement that says what happens to it after you switch supplier. Every customer and third-party report I found says it stops being useful once you leave Octopus. At best it keeps working for a short, unpredictable time after the switch date. Plan a replacement for live usage now.

Separately, **the panel's own code will stop the Home Mini tile within 24 hours of the switch date, whatever Octopus does.** Details are in the section on how the panel fails.

Network note: this environment blocked direct fetches of octopus.energy, docs.octopus.energy, forums.moneysavingexpert.com, speakev.com, shkspr.mobi, community.home-assistant.io, csa-iot.org, fuseenergy.com, energy-review.co.uk and reddit.com. Claims about those pages come from search-result extracts, not from reading the pages. github.com and raw.githubusercontent.com fetched normally.

---

#### 1. What the Home Mini is (and a correction to the brief)

- **It sends data only to Octopus's cloud.** Octopus's FAQ says the Home Mini joins the electricity meter's Home Area Network (HAN, the meter's local Zigbee radio network) and "streams gas and electricity readings via Wi-Fi to our cloud-based platform Kraken" (https://octopus.energy/octopus-home-mini-faq/, via search extract).
- **There is no local route to the data.** The BottlecapDave integration FAQ says: "While the Home Mini is local, the data unfortunately can't be polled directly and instead has to go via the OE servers" (https://raw.githubusercontent.com/BottlecapDave/HomeAssistant-OctopusEnergy/develop/_docs/faq.md). Community users say the Mini has no SSH or local access; the Home Pro was the device with local access (https://github.com/OctopusSmartEnergy/Home-Pro-SDK-Public/issues/9, Dec 2024 to Jan 2026).
- **It is not a Chameleon device. The brief's premise looks wrong.**
  - Octopus says it was "Crafted by Octopus R&D labs" (https://octopus.energy/blog/octopus-home-mini/).
  - A June 2024 press release calls it "home-grown British tech designed and developed in-house by a world-class hardware team" (https://octopus.energy/press/Octopus-Home-Mini-Octopus-homegrown-IHD-alternative/).
  - The Zigbee Smart Energy certification listing names Octopus Energy Ltd as the maker of a "smart meter CAD" (consumer access device), hardware 30-00006-B, certified 27 Jan 2022 (https://csa-iot.org/csa_product/octopus-home-mini-2/, via search extract).
  - Chameleon Technology makes a different product, the ivie Bud IHD/CAD, which relies on your supplier to join it to the meter (https://csa-iot.org/csa_product/ivie-bud/, via search extract).
  - So there is no Chameleon app or service to move the Home Mini to.
- **Security support:** Octopus's FAQ says Kraken Technologies Ltd will support security updates for the Home Mini until the end of 2035 (https://octopus.energy/octopus-home-mini-faq/, via search extract).

#### 2. Does it keep sending live readings after the supply moves?

**Not confirmed either way by Octopus.** What the evidence shows:

- **What other people say:**
  - On MoneySavingExpert, a member replied to someone leaving Octopus: "If you have an IHD it should still work, the Octopus mini won't work because it is tied to your account with Octopus" (https://forums.moneysavingexpert.com/discussion/6633174/switching-away-from-octopus-smart-meter-question, about 2024–25).
  - Another thread reasons the same way from the "beams readings to Kraken" design (https://forums.moneysavingexpert.com/discussion/6568717/smart-meter-with-octopus-home-mini).
  - A third-party guide states: "Does the Home Mini work if I leave Octopus? No… It is not a device you can take to another supplier" (https://saveonenergybills.co.uk/suppliers-and-tariffs/octopus-energy/octo-home-mini). That site is not Octopus.
  - I found **no** report from anyone who left Octopus and kept getting Home Mini data. [unverified either way]
- **The radio link to the meter may well survive the switch.**
  - SMETS2 meters "will stay smart if you switch supplier" (https://octopus.energy/help-and-faqs/articles/what-happens-if-i-have-a-smart-meter/, via search extract).
  - Fuse says it connects an existing in-home display at switch-in (https://www.fuseenergy.com/blog/ihd, via search extract).
  - A supplier-neutral Glow CAD reportedly kept working through a year with another supplier (https://forums.moneysavingexpert.com/discussion/6658510/hildebrand-glow-display-and-cad, via search extract).
  - So the Mini may keep receiving meter data over Zigbee. The open question is whether Octopus's cloud keeps accepting it and showing it to a former customer. [unverified]

#### 3. Is it unpaired from the meter, and by whom?

- **Pairing is done by a DCC User.** A DCC User is a party, such as a supplier, that can send commands to meters through the national smart-meter network run by the Data Communications Company (DCC). Octopus pairs the Home Mini as your supplier.
  - When people move house, Octopus asks to be told first so it can **detach the Home Mini from the old meters** and check the new ones (Octopus Home Mini FAQ, https://octopus.energy/octopus-home-mini-faq/, via search extract).
  - Octopus's renters' article says the IHD/Home Mini "is linked to the meter(s) it was installed with" and should be left at the property (https://octopus.energy/blog/renting-with-a-smart-meter/, via search extract).
  - A forum user notes each device "has to be paired by a DCC User (eg; a supplier or Chameleon/Hildebrand for their devices)" (https://forums.moneysavingexpert.com/discussion/6388817/octopus-home-mini/p5, via search extract).
- **After the switch, Octopus can no longer send commands to your meter.** The change-of-supplier process replaces "the supplier certificates associated with a losing energy supplier… with those of a gaining energy supplier" (https://www.ofgem.gov.uk/sites/default/files/docs/2016/10/bpd_i36_interactions_with_smart_metering_main_paper.pdf, via search extract).
  - So after the switch only Fuse, as the new supplier, or another DCC User could remove the Mini's pairing. Octopus could only do it before the switch completes. Whether Octopus or Fuse actually does this is [unverified].
- **Removing a device from the meter's Device Log ends the link.** The Device Log is the meter's list of paired devices. Removing an entry "terminates" the encrypted link (https://smartenergycodecompany.co.uk/documents/sec/cpa_sc_hcalcs_v1_3/, via search extract).
- **A meter or comms hub swap kills it for good.** Fuse allows about 42 days for remote connection before replacing a meter (https://www.fuseenergy.com/blog/how-long-does-a-smart-meter-take-to-connect, via search extract). If Fuse replaces the meter or communications hub, the Mini's pairing is gone, and Octopus is no longer in a position to re-pair it.

#### 4. How long do the Octopus account, API key and GraphQL telemetry keep working?

- **No Octopus documentation found.**
  - Anecdotally, former customers can still log in to old Octopus accounts, for example to see credit or bills (https://forums.moneysavingexpert.com/discussion/6299913/octopus-energy-takes-on-avro-customers/p21, via search extract). So the account and API key probably outlive the final bill. [unverified]
  - Octopus says the old supplier's final bill can take up to 6 weeks (https://octopus.energy/blog/what-happens-during-your-switch/, via search extract).
- **Telemetry is checked against the account.**
  - When the logged-in account isn't authorised for a device, `smartMeterTelemetry` returns `{'message': 'Unauthorized.', 'errorType': 'AUTHORIZATION', 'errorCode': 'KT-CT-1111'}`. This was seen in an exporter project in March 2026 (https://github.com/JosephRPalmer/octopus-usage-exporter/issues/71).
  - If Octopus detaches the Mini from your account at switch-out, as it does when people move house, expect this error. If it stays attached but the meter stops feeding it, expect an empty or stale list. [inference, unverified]
- **Tools only see meters with a current agreement.** BottlecapDave's integration "will only surface entities associated with meters in your first active property", and each meter must have an agreement whose end date is null or in the future (https://raw.githubusercontent.com/BottlecapDave/HomeAssistant-OctopusEnergy/develop/_docs/faq.md).

#### 5. Is the half-hourly REST consumption still available for the Octopus period?

- **Probably yes while the account and key exist, but unconfirmed.** I found no Octopus statement. [unverified]
- **No new half-hourly data after the switch date.** Octopus loses supplier access to the meter at that point (Ofgem certificate replacement, above), so it cannot collect new readings through the DCC. [inference]
- **Recommendation:** export the full half-hourly history now, from smart-meter install to the switch date. Use `/v1/electricity-meter-points/{mpan}/meters/{serial}/consumption/` while the key still works.
- **Other ways to get usage data:** Glow/Bright can pull DCC data whoever your supplier is. Their data is delayed by about 30 minutes (https://github.com/HandyHat/ha-hildebrandglow-dcc). Whether that includes up to 13 months of history stored on the meter is [unverified].

#### 6. Can the Home Mini be used with any other service?

- **No.** It has no local interface (see section 1) and its only data route is Octopus's Kraken cloud.
- Some other suppliers also run on Kraken, but nothing I found confirms whether Fuse does. Fuse appears to run its own app and platform (https://www.fuseenergy.com/blog/switch-from-octopus-to-fuse, via search extract) [unverified].

#### 7. Does Octopus ask for it back?

- **I found no evidence that Octopus asks for the Mini back when you switch supplier.** [unverified]
- Octopus's own guidance is about moving house, and it conflicts:
  - The renters' article says leave it at the property.
  - The Home Mini FAQ says you can take it, but tell Octopus first so it can be detached.
  - One forum report said Octopus asked a user to send it back when moving. [unverified, search extract only]

---

#### How the panel will fail (from this repo's code)

1. **Within 24 hours of the supply end date, whatever Octopus does.**
   - `ensureDiscovered()` (`/home/user/Home-Dashboard-/web/js/main.js` lines 252–258) re-runs `discover()` once a day.
   - `discover()` (`/home/user/Home-Dashboard-/web/js/octopus.js` lines 192–197) asks only for `electricityAgreements(active: true)`.
   - `parseAccount()` (`octopus.js` lines 32–59) needs an agreement with `validFrom <= now < validTo`. Once the Octopus agreement has ended it throws "No active electricity import tariff found on this account".
   - `refreshHomeMini()` (`main.js` lines 281–294) awaits `ensureDiscovered()` without catching that error, so the live-usage and today-so-far tile goes into its error state.
2. **If Octopus detaches the device:** `smartMeterTelemetry` is likely to return `KT-CT-1111 Unauthorized`. [inferred]
3. **If the Mini stays attached but loses its meter link** (Fuse cleans up paired devices or swaps the meter/hub): telemetry comes back empty or stops advancing. The panel already treats demand older than 45 minutes as stale (`main.js` line 245).
4. **REST consumption** (`octopus.js` lines 229–246) will simply have no rows after the switch date.

#### What to do instead (pointers only; other workstreams cover these)

- **Live usage:** a supplier-neutral CAD paired by a DCC Other User (a non-supplier DCC User, such as Hildebrand):
  - Hildebrand says it can join its Display/CAD "without your supplier's involvement because we are a SECAS… approved DCC Other User". It cannot join meters with Trilliant comms hubs, and it asks to be warned before any comms hub swap (https://shop.glowmarkt.com/products/display-and-cad-combined-for-smart-meter-customers, via search extract).
  - Glow CAD availability was reported as constrained (https://community.home-assistant.io/t/energy-dashboard-and-hildebrand-glow-dcc-integration/593455, via search extract). Check current stock.
- **Through-the-day graph and today's total:** Fuse's own app or API if it has one, or DCC-sourced data via Glow/Bright or n3rgy (about 30 minutes behind). Whether these allow direct browser calls (CORS) needs checking.
- **Cheap test:** the day after the switch, run the panel's existing telemetry query directly with the cached deviceId (bypassing discovery). That shows which way Octopus actually behaves.

### Fact-check

The main recommendation holds up: don't rely on the Home Mini after the move to Fuse, and plan another source for live usage. Every source found says the Mini only reports to Octopus's cloud and stops being useful once you leave. All of that comes from forums, third-party guides and a community FAQ. None of it is an Octopus statement, and I could not fetch Octopus's own pages because they are blocked here. The strongest finding is the code analysis (claim 15), which I confirmed: the panel's daily account lookup only accepts a currently active Octopus agreement and the Home Mini refresh doesn't catch the error, so that tile will fail within 24 hours of the switch whatever Octopus does. Several specifics are weaker than stated. The KT-CT-1111 error is real, but it came from a current customer querying the wrong meter, not from someone who had left. The 42-day Fuse figure, the 2035 security-update date, the Trilliant comms hub limit and the claim that Fuse connects existing displays at switch-in could not be confirmed. The CSA listing I could see names Kraken Technologies Ltd, not Octopus Energy Ltd. The Glow DCC source the report relies on is abandoned. The biggest gap is Fuse itself. There is no public API, but an unofficial one exists: hourly data, SMS-code login, and a climbing value for the current hour. That makes the graph and today-so-far numbers technically possible but fragile for a browser-only panel. Fuse's own app already shows half-hourly usage. A Glow CAD, with local MQTT or Glow's cloud, remains the main candidate for live usage, but its price, stock, comms-hub compatibility and browser (CORS) access still need checking.

Claims not fully confirmed:

- **partly**: 2. The Home Mini was designed in-house by Octopus, not Chameleon, and the certification listing names Octopus Energy Ltd as its maker. → I could not fetch octopus.energy or csa-iot.org. A search extract shows a second CSA listing (csa-iot.org/csa_product/octopus-home-mini/, firmware 2.8.4, hardware 30-00006-B Rev 5, certified 07/10/2024) that names Kraken Technologies Ltd as the company, not Octopus Energy Ltd. The listing the report cites ('-2', Octopus Energy Ltd, 27 Jan 2022) was not checked. Either way the device is Octopus/Kraken's own, not Chameleon's, so the practical conclusion stands: there is no third-party service to move it to.
- **unverified**: 3. Octopus's June 2024 press release calls the Home Mini home-grown British tech designed and developed in-house. → octopus.energy is blocked here (DNS failure) and my searches did not bring up this wording. It does not change the recommendation.
- **unverified**: 4. Octopus's Home Mini FAQ says to tell Octopus before moving house so it can detach the Mini, and that Kraken will support security updates until the end of 2035. → The page could not be fetched. A targeted search for the 2035 commitment found nothing, and that search's summary said the FAQ covers setup and LED lights but not firmware support. Treat the moving-house detach step and the 2035 date as unconfirmed.
- **unverified**: 5. Octopus's renters' article says the IHD/Home Mini is linked to the meter(s) it was installed with and should be left at the property. → octopus.energy is blocked here and I could not reach the article.
- **partly**: 6. A forum answer says the Octopus Mini won't work after leaving because it is tied to the Octopus account; there is no Octopus statement on what happens after a switch. → Search results repeat the MSE quote ('the Octopus mini won't work because it is tied to your account with Octopus'). The third-party saveonenergybills guide says the same: 'Does the Home Mini work if I leave Octopus? No'. I could not fetch the MSE page (blocked) to check the date or context. I also found no Octopus primary statement and no report from anyone who kept getting Home Mini data after leaving. The weight of evidence agrees with the report, but none of it comes from Octopus.
- **unverified**: 7. At change of supplier, the losing supplier's certificates on the meter are replaced with the gaining supplier's, so Octopus can no longer command the meter. → ofgem.gov.uk is blocked here and the PDF could not be read. The mechanism is consistent with how SMETS2 change of supplier works, and Fuse's own guide (search extract) says a meter can only start sending data to a supplier once the switch has fully completed. Still, I did not confirm the exact wording from a primary source. Whether Octopus or Fuse removes the Mini from the meter's Device Log at switch is also unconfirmed.
- **partly**: 8. smartMeterTelemetry enforces authorisation and returns 'Unauthorized.' with errorType AUTHORIZATION and errorCode KT-CT-1111 for a device the account isn't authorised for. → The error text is confirmed verbatim, path ['smartMeterTelemetry'], logged on 25 Mar 2026, with errorDescription 'The viewer is not authorized to execute the query/mutation.' The context is different, though. The user was a current customer with an import and an export meter, and the error came from querying the wrong (hardcoded) meter. It was fixed by better meter detection in v0.1.8. Nothing in the issue shows what a former customer would get, so the report's prediction for after the switch is pure inference.
- **partly**: 11. SMETS2 meters stay smart after a supplier switch, and Fuse says it connects an existing in-home display at switch-in. → The first half is confirmed by Fuse's guide (search extract): SMETS2 meters 'continue working regardless of which supplier you choose', and a meter only starts sending data to the new supplier once the switch completes. The claim that Fuse connects an existing IHD at switch-in did not appear in any extract I saw. fuseenergy.com is blocked, so that half is unverified.
- **unverified**: 12. Fuse allows about 42 days for remote meter connection before replacing the meter, and a meter or comms hub replacement would end the Home Mini's pairing for good. → A search for Fuse and '42 days' found no such figure. The extract from that same Fuse page talks about DCC connection but gives no 42-day window. The point that a new comms hub or meter breaks the pairing is plausible but has no source.
- **unverified**: 13. Hildebrand (Glow) is a DCC Other User and can join its Display/CAD without the supplier, but not on meters with Trilliant comms hubs, and it asks for a warning before a comms hub swap. → shop.glowmarkt.com is blocked, and a search for the exact wording found nothing. One forum thread notes that the Glow CAD's own data stream goes to Hildebrand's servers, not through the DCC (openenergymonitor). Current price, stock and the Trilliant limit need checking directly with Hildebrand.
- **partly**: 14. Glow's DCC API gives supplier-neutral smart meter data delayed by about 30 minutes, and real-time data needs Glow hardware. → The README does say 'The data provided will be delayed by around 30 minutes' and 'To get real-time consumption data, you can buy Hildebrand Glow hardware'. It does not describe the API as supplier-neutral. It only says Bright is a DCC Other User. The repo also declares itself abandoned ('Please do not expect this integration to work'), so it is weak evidence of how the service behaves in 2026. I could not test whether api.glowmarkt.com allows browser (CORS) calls because the proxy blocked it.
- **unverified**: 16. Former Octopus customers report still being able to log in to their old Octopus accounts after leaving. → MSE is blocked and I could not check it. One search summary claimed the opposite (that the account and app data 'will stop being available once you leave') but cited no source. Treat both claims as unsupported. Exporting the half-hourly history now is the safe step either way.

Missed by the first report:

- Fuse has no public API, but unofficial Home Assistant integrations use the private API behind the Fuse mobile app. Sign-in is by SMS one-time code to the account's mobile number, and sessions expire and need a new code. The data is hourly electricity, gas and export, published with a delay, and Fuse keeps revising each hour for a while after it closes. The current hour is reported 'with a value that keeps climbing', which could give a rough today-so-far figure. For a wall panel with no server this is fragile: SMS re-login is needed, the API may change without notice, and CORS is unknown. Sources: https://github.com/yakupafsin/fuse-energy-ha and https://github.com/simonsolts/fuse-homeassistant (half-hourly usage and cost; repo dated May 2026, AGPL-3.0).
- The Fuse API host is api.fuseenergy.com, with paths under /api/v1/. Login posts a phone_number to /api/v1/auth/otp/issue and then checks the code at /api/v1/auth/otp/check. The author says they 'couldn't get the OTP code without the mobile app'. Source: https://github.com/LionZXY/FuseEnergyApi
- Fuse's own app shows half-hourly usage once the smart meter is connected. Fuse's guide says a connected smart meter is required for half-hourly usage data 'in real-time within our app' (search extract only). This is the simplest no-code answer for the through-the-day graph. Source: https://www.fuseenergy.com/blog/smart-meter-app
- The Glow DCC Home Assistant integration that the report cites for the 30-minute delay is marked abandoned ('Please do not expect this integration to work'). It also says to set the meter up free in the Bright app first. The current state of the Glowmarkt API, its rate limits and its CORS behaviour are unverified. Source: https://raw.githubusercontent.com/HandyHat/ha-hildebrandglow-dcc/main/README.md
- The Octopus Home Pro, the one Octopus device with local LAN access, is deprecated and no longer available, so it cannot replace the Mini. Source: https://github.com/OctopusSmartEnergy/Home-Pro-SDK-Public/issues/9
- For live usage, the Glow IHD/CAD can publish readings to the user's own MQTT broker, per community integrations that need an MQTT broker. A browser panel would need a broker that accepts WebSocket connections, possibly a free hosted one. Exact data fields and update rate are unverified. Source: https://github.com/megakid/ha_hildebrand_glow_ihd_mqtt
- Octopus allows 100 API calls per hour, shared between the app and every integration, which limits how often the panel can poll during any test after the switch. Source: https://raw.githubusercontent.com/BottlecapDave/HomeAssistant-OctopusEnergy/develop/_docs/faq.md
- The KT-CT-1111 evidence comes from a current customer querying the wrong (export or hardcoded) meter, not from a former customer. Nothing yet shows what smartMeterTelemetry returns after someone leaves Octopus. Source: https://github.com/JosephRPalmer/octopus-usage-exporter/issues/71
- A CSA certification listing from 2024 names Kraken Technologies Ltd, not Octopus Energy Ltd, as the Home Mini's certifying company (search extract). Source: https://csa-iot.org/csa_product/octopus-home-mini/
- Limits of this check: the web search budget ran out partway through. octopus.energy, fuseenergy.com, ofgem.gov.uk, forums.moneysavingexpert.com, csa-iot.org, shop.glowmarkt.com and cyberhost.uk were blocked, and api.glowmarkt.com was refused by the proxy, so its CORS could not be tested.

## What Fuse Energy offers for usage data

#### Bottom line (as of 2026-10-13)

- **Fuse has no public API or developer programme.** Its own app and website show usage from a connected smart meter. Fuse calls this "real-time, half-hourly". In practice the private API the app uses gives **hourly** bars with a lag of up to about an hour. It does **not** give a second-by-second "current usage (W)" figure.
- **Two unofficial Home Assistant integrations (2026) reverse-engineer that private API** at `api.fuseenergy.com`. They show that hourly kWh, hourly cost in £, a running "today" total and a tariff breakdown (unit rate plus standing charge) are all available. Sign-in uses an SMS one-time code to the account's phone number, and the access and refresh tokens change on every refresh. A browser-only panel could in principle use the same calls. Whether `api.fuseenergy.com` and the `www.fuseenergy.com` SMS endpoint allow cross-origin browser calls (CORS) is **[unverified]**, so a small proxy is likely to be needed.
- **Live usage needs a consumer access device (CAD) on the meter's home network (HAN), not Fuse.** I found no evidence that Fuse offers its own CAD or a live-data feed. I also found no evidence either way on whether Fuse blocks or supports third-party CADs.
- **No Fuse CSV export was found.** Third-party routes that work regardless of supplier, such as Bright/Glowmarkt through the DCC, are the documented way to get downloadable data.

Note on sources: WebFetch could not resolve fuseenergy.com, forums.moneysavingexpert.com, energyplus.co.uk, enode.com, en.wikipedia.org, shop.glowmarkt.com, hildebrand.co.uk, freepricecompare.com, mwm.ai or airgunforums.co.uk (DNS blocked by this environment). Claims from those sites come from search-result snippets only. GitHub pages and raw files were fetched directly.

---

#### 1. What the Fuse app and website show

- **Fuse's claim:** customers with a connected smart meter get "real-time, half-hourly usage data in the app and website". The app shows usage "broken down by hour, day, or month". Half-hourly reads are taken from **electricity meters only**, not gas, because of gas-meter battery drain. Sources: [Fuse HH meter reading guide](https://www.fuseenergy.com/blog/half-hourly-meter-reading-guide), [Fuse smart meter app guide](https://www.fuseenergy.com/blog/smart-meter-app). Search snippets only; the pages could not be fetched.
- **What users report:**
  - A 2025 MoneySavingExpert (MSE) thread says the app shows **hourly, daily and monthly** views. The half-hour grid is only reachable under meter details, and readings arrive without delays.
  - Another post says an app redesign briefly removed kWh in favour of cost, then restored it.
  - Another user calls the 30-minute readings "virtually in real time".
  - Source: [MSE "Fuse Energy & OFTM Reviews please"](https://forums.moneysavingexpert.com/discussion/6585243/fuse-energy-oftm-reviews-please-%EF%B8%8F/p9) (snippet only, [unverified] beyond the snippet).
- **Without a connected meter**, customers type in a reading or photograph the meter in the app ([Fuse smart meter monitor guide](https://www.fuseenergy.com/blog/smart-meter-monitor), snippet).

#### 2. Live usage, in-home display (IHD) and CAD

- Fuse describes an IHD as a portable device that "comes with many smart meter installations". It connects to the meter's comms hub over the HAN, not WiFi ([Fuse IHD explainer](https://www.fuseenergy.com/blog/ihd), snippet).
- Fuse says: "With Fuse Energy IHDs, you can simply let us know once you've received it and we can connect it to your meters for you" ([Fuse smart meter monitor guide](https://www.fuseenergy.com/blog/smart-meter-monitor), snippet).
- A July 2025 MSE post says Fuse "will send [an IHD] on if I request it" ([MSE Fuse 4G smart meter thread](https://forums.moneysavingexpert.com/discussion/6619386/fuse-energy-4g-smart-meter-question), snippet, [unverified]).
- An IHD shows live data on its own screen but **gives the panel nothing it can read**. I found **no Fuse-branded CAD** and no Fuse live-power feed.
- **Octopus Home Mini after leaving Octopus:** an unofficial guide says it "doesn't work if you leave Octopus" because it is tied to the Octopus account and app ([octopusenergyhub.co.uk](https://octopusenergyhub.co.uk/benefits/octo-home-mini/), third-party, [unverified] against Octopus). A user who moved from Octopus to Fuse described the Mini as something they used to have for live usage ([MSE thread p7](https://forums.moneysavingexpert.com/discussion/6585243/fuse-energy-oftm-reviews-please-%EF%B8%8F/p7), snippet). I found no official Fuse or Octopus statement on this.

#### 3. API and developer access

**Official:** none. An API directory says Fuse "does not publish a public developer API program" ([apis.io](https://apis.io/secondary-market/fuse-energy/)). A community integration's code comments also say Fuse has "no public API" ([yakupafsin/fuse-energy-ha const.py](https://raw.githubusercontent.com/yakupafsin/fuse-energy-ha/main/custom_components/fuse_energy/const.py)).

**Unofficial private API, as seen in community code (2026):**

**Hosts**
- `https://api.fuseenergy.com` is the mobile API.
- `https://www.fuseenergy.com` is the website. It is used only to trigger the sign-in SMS.
- Sources: [simonsolts const.py](https://raw.githubusercontent.com/simonsolts/fuse-homeassistant/main/custom_components/fuse_energy/const.py) and [yakupafsin const.py](https://raw.githubusercontent.com/yakupafsin/fuse-energy-ha/main/custom_components/fuse_energy/const.py).

**Sign-in**
- Phone number plus a 6-digit SMS code. There is no password and no OAuth.
- Steps:
  1. `POST /api/v3/auth` with `challenge_type: INITIAL` and a `Device-Id` header. This returns a short-lived flow token and does not send the SMS.
  2. `POST https://www.fuseenergy.com/api/trpc/phoneSignIn` with an `x-fuse-app-version` header. This sends the SMS.
  3. `POST /api/v3/auth` with `challenge_type: PHONE_OTP`.
  4. Sometimes `ADDITIONAL_INFO` identity questions follow, such as date of birth or postcode.
- Refresh is `POST /api/v1/auth/refresh`. It needs both the current access token (in the header) and the refresh token (in the body). **Both tokens rotate on every refresh.**
- No token lifetimes are documented. Home Assistant asks the user to sign in again (with a new SMS) when the session expires.
- Sources: [simonsolts auth.py](https://raw.githubusercontent.com/simonsolts/fuse-homeassistant/main/custom_components/fuse_energy/auth.py), [yakupafsin auth.py](https://raw.githubusercontent.com/yakupafsin/fuse-energy-ha/main/custom_components/fuse_energy/auth.py), [yakupafsin README](https://github.com/yakupafsin/fuse-energy-ha).
- Gotchas:
  - Fuse rate-limits SMS requests (`issue_otp_premature_retry`) and returns refusals inside an HTTP 200 body ([issue #6, 2026-09-16](https://github.com/yakupafsin/fuse-energy-ha/issues/6)).
  - Fuse rejects `x-fuse-app-version` values it considers too old. The values seen are `5.314` in simonsolts and `0.5.388` in yakupafsin ([yakupafsin const.py](https://raw.githubusercontent.com/yakupafsin/fuse-energy-ha/main/custom_components/fuse_energy/const.py)).

**Data endpoints**
- `GET /api/v2/customer/premises` returns the premises ID(s).
- `GET /api/v1/premises/{id}/chart?year=&month=&day=` returns, for each supply (`ELEC_IMPORT`, `ELEC_EXPORT`, `GAS`), a list of **hourly** `bars`. Each bar has `index{year,month,day,hour}`, `kWh`, `money.amount`, `type` (`REALISED`) and a `breakdown[]` of cost components, including usage and standing charge.
- Sources: [simonsolts api.py](https://raw.githubusercontent.com/simonsolts/fuse-homeassistant/main/custom_components/fuse_energy/api.py), [yakupafsin api.py](https://raw.githubusercontent.com/yakupafsin/fuse-energy-ha/main/custom_components/fuse_energy/api.py).
- yakupafsin found that the 2-decimal `money.amount` "understates by ~10%". It sums the `breakdown` components instead (measured 2026-09-15).

**Timing**
- "Fuse publishes hourly". Data arrives with a lag of up to about an hour, so polling more often than every 15 minutes gains nothing.
- The hour in progress is reported "as though it were settled, with a value that keeps climbing".
- Recent hours keep being revised after they close.
- Source: [yakupafsin README](https://github.com/yakupafsin/fuse-energy-ha).

**Older API shape (Dec 2024)**
- A Kotlin reverse-engineering project ([LionZXY/FuseEnergyApi](https://github.com/LionZXY/FuseEnergyApi)) used different paths:
  - `/v1/customer/addresses`
  - `/v4/properties/{id}/billing?year&month&day`, which returns 24 hourly columns with `tense` PAST/PRESENT/FUTURE, per-hour and **cumulative** kWh and £, and a `breakdown` with the **unit-rate price and the standing-charge price per day** for each contract.
  - `/v2/properties/{id}/billing-readings?year&month`, which returns `hh_readings` with genuine **half-hourly** kWh per day.
- Sources: [ReadingStatsApi.kt](https://raw.githubusercontent.com/LionZXY/FuseEnergyApi/main/src/main/kotlin/uk/kulikov/api/ReadingStatsApi.kt), [example_stats.json](https://raw.githubusercontent.com/LionZXY/FuseEnergyApi/main/example_stats.json), [example_half.json](https://raw.githubusercontent.com/LionZXY/FuseEnergyApi/main/example_half.json).
- The change of paths between 2024 and 2026 shows that the private API **does change without notice**. Whether the v4/v2 endpoints still work in 2026 is [unverified].

**CORS**
- No source mentions CORS. I could not test it because my curl call was denied in this environment. **[unverified]**
- The custom `Device-Id` and `Authorization` headers will trigger a browser preflight, and the SMS step goes to a Next.js tRPC route on www.fuseenergy.com. Expect to need a small proxy (e.g. a Cloudflare Worker) unless testing shows `Access-Control-Allow-Origin` is permissive. [unverified]

**Terms of service and risk**
- Both integrations say they are unofficial and unendorsed, and that the API "can change without notice".

#### 4. Home Assistant and community projects

- **[yakupafsin/fuse-energy-ha](https://github.com/yakupafsin/fuse-energy-ha)**
  - MIT licence, HACS. Last commits 2026-09-21 ([commits](https://github.com/yakupafsin/fuse-energy-ha/commits/main)).
  - Provides hourly electricity import, export and gas usage, cost statistics, a "last settled hour" sensor and **today's running totals**.
  - Needs Home Assistant 2026.9 or newer. Backfills 30 days.
- **[simonsolts/fuse-homeassistant](https://github.com/simonsolts/fuse-homeassistant)**
  - AGPL-3.0. Last commit 2026-09-20 ([commits](https://github.com/simonsolts/fuse-homeassistant/commits/main)).
  - Its README says "half-hourly", but its code parses hourly bars.
- **[LionZXY/FuseEnergyApi](https://github.com/LionZXY/FuseEnergyApi)**
  - Kotlin, one commit, from around Dec 2024.
  - Its author got tokens by intercepting the app on a rooted Android phone.

#### 5. Exports (CSV)

- I found nothing showing a Fuse CSV or download feature. A search for one returned no Fuse Energy results. **[unverified / not found]**
- Bright/Glowmarkt users report downloading about 13 months of half-hourly CSV data once their meter is registered with Bright, whatever their supplier ([E.ON Next community](https://community.eonnext.com/showthread.php?p=59438), user post).

#### 6. Third-party CADs (Glow), Bright and n3rgy

- **Fuse-specific stance:** I found no Fuse statement either supporting or blocking third-party CADs, Bright or n3rgy. **[unverified]**
- **Bright / Glowmarkt (Hildebrand):**
  - Bright works through the DCC (the national smart-meter data network) for SMETS2 meters, free after a verification step.
  - Real-time data needs Glowmarkt hardware (a CAD) ([Bright App Store listing](https://apps.apple.com/gb/app/bright/id1369989022)).
  - Forum posts say Hildebrand is a DCC "Other User", so consent comes from the customer, not the supplier ([OpenEnergyMonitor thread](https://community.openenergymonitor.org/t/a-taste-of-things-to-come-uk-smart-meter-data-access/4820?page=13)). DCC-route data typically updates once a day.
  - An Oct 2025 MSE thread has a Fuse customer saying their meters reported to Fuse normally while Bright showed no data, which implies Fuse customers do use Bright ([MSE Glow thread](https://forums.moneysavingexpert.com/discussion/6658510/hildebrand-glow-display-and-cad), snippet, [unverified]).
- **Glow CAD hardware:** the Glow Display+CAD offers local MQTT and the Glow API. Its shop page showed it sold out with a £15 deposit waitlist at £69.99. Hildebrand now lists a newer "Glow Delta" CAD. Sources: [Glow shop](https://shop.glowmarkt.com/products/display-and-cad-combined-for-smart-meter-customers), [Hildebrand products](https://www.hildebrand.co.uk/products) (snippets; current stock [unverified]).
- **Who pairs a CAD:** older forum reports say some CAD pairings had to be done by the supplier ([OpenEnergyMonitor p2](https://community.openenergymonitor.org/t/a-taste-of-things-to-come-uk-smart-meter-data-access/4820?page=2), dated). How pairing works with Fuse specifically is [unverified].
- **n3rgy:** offers consumers free access to their own smart-meter data. Its coverage has gaps ([OpenEnergyMonitor thread p5](https://community.openenergymonitor.org/t/a-taste-of-things-to-come-uk-smart-meter-data-access/4820?page=5)). I found nothing Fuse-specific.
- **Fuse privacy policy:** lists "Half-hourly smart meter readings" with legitimate interests, contract and consent as lawful bases ([Fuse privacy policy](https://www.fuseenergy.com/legal/privacy-policy), snippet).

#### 7. Fuse fixed tariffs (for "today so far" in £)

- **Rates vary by region and by tariff version.** The household's own rate is on its Fuse tariff/contract. The private API's chart breakdown, and the 2024 `billing` breakdown with the unit-rate and standing-charge price, can supply it directly. Hard-coding the rate is not needed.
- **Indicative published figures** (energyplus.co.uk, snippets only, [unverified] against Fuse):
  - *September 2026 Fixed (12m) V11/V12:* electricity from **26.64p / 26.71p per kWh**, up to about 29.35p by region (dual fuel, monthly Direct Debit). No standing charge was found in the snippets ([V11](https://www.energyplus.co.uk/suppliers/fuse-energy/tariffs/september-2026-fixed-12m-v11), [V12](https://www.energyplus.co.uk/suppliers/fuse-energy/tariffs/september-2026-fixed-12m-v12)).
  - *January 2026 Fixed (13m) v3:* electricity about 23–25p/kWh, standing charge about 40–61p/day ([energyplus](https://www.energyplus.co.uk/suppliers/fuse-energy/tariffs/january-2026-fixed-(13m)-v3)).
- **Fix terms and exit fees** differ by source:
  - Fix lengths of 12, 13, 15 and 18 months are mentioned.
  - Exit fees of £50 and £100 are mentioned.
  - Sources: [Uswitch](https://www.uswitch.com/gas-electricity/suppliers/fuse-energy/), [MoneySuperMarket](https://www.moneysupermarket.com/gas-and-electricity/suppliers/fuse-energy/).
- **Price-cap benchmark** (cap from 1 July 2026, per Fuse's blog): electricity 26.11p/kWh, standing charge 57.19p/day ([Fuse news](https://www.fuseenergy.com/news/energy-price-cap), snippet).

#### 8. What this means for the panel

- **Day graph and today-so-far (kWh and £):**
  - Achievable from Fuse's private chart endpoint: hourly bars, about one hour behind.
  - Needs a one-time SMS sign-in, then refresh-token rotation stored in localStorage.
  - Probably needs a free proxy because CORS is **[unverified]**.
  - Fragile, because it is an unofficial API.
  - Alternative: the Bright/Glowmarkt DCC route, which typically updates daily (supplier-independent, free).
- **Current live usage (W):** Fuse does not provide it. A HAN-paired CAD is needed. This could be the Glow CAD via the Glowmarkt API or local MQTT, or possibly the existing Home Mini if Octopus keeps it working (indications are it will not, [unverified]).

### Fact-check

The report's technical claims about the private Fuse API are accurate. The endpoints, hourly granularity, about one hour of lag, SMS OTP sign-in, rotation of both tokens on refresh, rate limits returned as HTTP 200, and the roughly 10% money.amount truncation all check out against the 2026 integration source code and READMEs on GitHub. Weaker or unverified: anything sourced only from fuseenergy.com, MSE or energyplus snippets (those sites are DNS-blocked here), the CORS status of Fuse's hosts (my preflight test was blocked by the egress proxy), and whether the Dec 2024 half-hourly endpoint still works. One correction: the Bright/DCC route is about 30 minutes behind, not daily. For the user's decision: (a) the Octopus Home Mini will very likely stop feeding live data once they leave Octopus, because it is cloud-only through Octopus's Kraken and has no local API, though there is no official Octopus statement; checking whether smartMeterTelemetry still returns fresh rows settles it. (b) Fuse can supply the day graph and today-so-far, but only hourly, about an hour behind, through an unofficial API with SMS sign-in and probably a proxy. Bright/Glowmarkt via the DCC is a more stable, supplier-independent alternative at half-hourly resolution and about 30 minutes delay. (c) True 'current usage' in watts needs a new HAN-paired CAD such as Hildebrand Glow, which Hildebrand pairs via the DCC regardless of supplier. Its feed is MQTT, which a browser-only panel would need to reach over WebSockets or through a bridge.

Claims not fully confirmed:

- **partly**: 2. Fuse says connected smart meters give 'real-time, half-hourly usage data' in the app and website, with half-hourly reads for electricity only, not gas (battery drain). → Search snippets of Fuse's blog match this wording, but the page could not be fetched, so it was not checked against the page itself. The more important point is that the private API both integrations use returns HOURLY bars (yakupafsin's Bar docstring reads 'One hour of metered volume and cost'; simonsolts has class HourlyBar). 'Real-time' is marketing: there is no live watts figure.
- **partly**: 8. A Dec 2024 version of the private API exposed /v4/properties/{id}/billing and /v2/properties/{id}/billing-readings (half-hourly); paths have changed since. → The paths are confirmed in ReadingStatsApi.kt, and the repo's single 'Initial commit' (e34e503) is dated 2024-12-03. Its auth also differed: /api/v1/auth/otp/issue and /otp/check, with tokens taken from a rooted Android phone. That the paths 'changed' is an inference from the 2026 code using different paths. Whether the v4/v2 endpoints, including half-hourly billing-readings, still work in 2026 is [unverified]. Response field details (tense, cumulative, unit-rate breakdown) were not re-checked here.
- **partly**: 14. An unofficial guide says the Octopus Home Mini does not work after leaving Octopus because it is tied to the Octopus account/app. → No official Octopus statement was found; octopus.energy and octopusenergyhub.co.uk could not be fetched (DNS blocked). Several independent sources agree the Mini depends on Octopus's cloud. Octopus describes it as beaming readings to 'our cloud-based platform Kraken'. A teardown saw it talk only to NTP and an AWS IoT endpoint, with no documented local API. A third-party guide says it 'can't send its data to the cloud any more' after a switch. A blogger calls it 'vendor locked-in to Octopus'. An MSE user reports it stopped when they moved only electricity. Fuse also notes that IHDs may disconnect after a supplier switch. Conclusion: very likely it will not keep feeding the panel [unverified against Octopus]. The user can test it in minutes by checking whether smartMeterTelemetry still returns fresh rows.
- **partly**: 10. Fuse will connect an IHD on request; an IHD uses the HAN, not WiFi; no Fuse CAD or live-power API was found. → Fuse blog snippets confirm that the IHD uses the meter's local wireless network and not WiFi, that Fuse connects an existing IHD when it connects the meter, and that 'IHDs may disconnect after a supplier switch'. The exact 'let us know… we can connect it' quote was not found in my search. No Fuse CAD was found [unverified absence]. The fuseenergy.com pages themselves could not be fetched.
- **partly**: 12. Bright (Hildebrand) gives free half-hourly SMETS2 data via the DCC after verification; real-time data needs Glowmarkt CAD hardware. → Correct in substance. But the report's §6 says DCC-route data 'typically updates once a day', while the HandyHat ha-hildebrandglow-dcc README says DCC data 'will be delayed by around 30 minutes', and a user also reports about 30 minutes. Real time requires the Glow CAD via local or cloud MQTT. Glow MQTT may have to be enabled by Hildebrand on request. pyglowmarkt and openHAB report that the Glowmarkt REST 'current' endpoint does not work without Glow hardware. The HandyHat integration is now marked abandoned.
- **partly**: 13. No Fuse statement on supporting or blocking third-party CADs (Glow), Bright or n3rgy. → No Fuse statement was found. This is less important than the report implies: Hildebrand says it is a DCC 'Other User' that pairs its CAD via the DCC 'regardless of supplier', after a consumer consent and verification step. So for a SMETS2 meter, Fuse's cooperation should not be needed. Those quotes are old forum posts, so current practice is [unverified].
- **unverified**: CORS: whether api.fuseenergy.com and www.fuseenergy.com/api/trpc/phoneSignIn allow browser cross-origin calls. → I tried an OPTIONS preflight from this environment and it was blocked by the egress proxy (CONNECT 403), so it is still untested. Neither integration has any CORS handling (both are server-side aiohttp). Plan for a Cloudflare Worker proxy unless the user's browser devtools show permissive Access-Control-Allow-Origin.
- **unverified**: 11/15/16. MSE user says the app has hourly/daily/monthly views with half-hours under meter details; Sept 2026 Fixed V11/V12 rates of about 26.64p–29.35p/kWh; the privacy policy lists half-hourly readings. → All three come from search snippets of blocked sites (forums.moneysavingexpert.com, energyplus.co.uk, fuseenergy.com) and could not be fetched. They are low priority: the private API's breakdown gives the household's actual cost, so the tariff figures are not needed.

Missed by the first report:

- The decisive test for the user's question ('will my Home Mini still work?') is simple and costs nothing: keep the existing Octopus smartMeterTelemetry call running for a day after the switch date and see whether new readings keep arriving. Whether a closed Octopus account's API key and GraphQL telemetry keep working is undocumented [unverified]; no source found (search: https://octopus.smarthound.uk/web/validate.htm returned nothing on former customers).
- The Home Mini has no documented local API. A teardown saw it reach only an AWS IoT endpoint and NTP, so the panel cannot read it locally as a fallback (https://cyberhost.uk/octopus-home-mini-teardown-review/). Third-party Mini libraries read it only through Octopus's cloud GraphQL (https://root.packagist.org/packages/rogerthomas84/php-octopus-mini-api).
- Fuse says IHDs (and by implication other HAN devices) may disconnect after a supplier switch, and that meter connection can take days and up to about 42 days after the switch. Fuse app data may therefore not appear immediately (https://www.fuseenergy.com/blog/smart-meter-display-not-working; https://www.fuseenergy.com/blog/how-long-does-a-smart-meter-take-to-connect; snippets only).
- Hildebrand pairs Glow CADs through the DCC as an 'Other User', independent of supplier, after a consent check. That removes most of the 'will Fuse allow it' risk for a SMETS2 meter (https://community.openenergymonitor.org/t/a-taste-of-things-to-come-uk-smart-meter-data-access/4820?page=2). It is the only documented route to true live watts for the panel after leaving Octopus.
- Glow's real-time feed is MQTT (local or Hildebrand's cloud), and users report it may need Hildebrand to enable it (https://github.com/HandyHat/ha-hildebrandglow-dcc; https://forum.ovoenergy.com/general-153/home-assistant-implementation-18135/index2.html). A browser-only panel cannot speak raw MQTT/TCP, so it would need MQTT-over-WebSockets or a small bridge. Glowmarkt REST 'current reading' reportedly does not work without Glow hardware (https://pypi.org/project/pyglowmarkt/0.1/). CORS on api.glowmarkt.com is undocumented [unverified].
- The DCC/Bright route is about 30 minutes behind, not once a day as the report says (https://github.com/HandyHat/ha-hildebrandglow-dcc). The Bright/Glowmarkt API, with a free account, is a more stable alternative to Fuse's private API for the half-hourly day graph and today-so-far. It uses a username and password rather than SMS OTP with rotating tokens.
- simonsolts' integration sums the lossy money.amount, which yakupafsin measured as truncated and about 10% low. Any code ported from simonsolts would understate £ (https://raw.githubusercontent.com/yakupafsin/fuse-energy-ha/main/custom_components/fuse_energy/api.py).
- Chart responses include padding bars from adjacent days and a repeated hour on the October clock change. The panel must filter by index date and handle the duplicated 01:00 hour. This matters this month: UK clocks go back on 2026-10-25 (https://raw.githubusercontent.com/yakupafsin/fuse-energy-ha/main/custom_components/fuse_energy/api.py).
- Storing Fuse access and refresh tokens in localStorage on a wall tablet exposes a session that can see account and billing data. The only re-auth path is SMS to the account holder's phone, and repeated attempts trigger rate limits (https://github.com/yakupafsin/fuse-energy-ha/issues/6).

## Supplier-independent ways to get usage data

### Getting electricity usage without relying on your supplier (UK, as of 13 Oct 2026)

**How I researched this:** this environment blocks most vendor sites (glowmarkt.com, hildebrand.co.uk, n3rgy.com, octopus.energy, fuseenergy.com, shelly.cloud, developer.chrome.com and others). Facts about those sites come from search-result snippets, from GitHub-hosted copies of the specs, and from open-source client code. Anything I could not confirm from a primary source is marked [unverified].

#### Short answer

1. **The Octopus Home Mini will almost certainly stop working now you've left Octopus.** It sends readings to Octopus's Kraken cloud, and the dashboard reads it through Octopus's API with your Octopus key. Guides and forum users all say it only works while you are an Octopus customer ([saveonenergybills](https://saveonenergybills.co.uk/octopus-energy/octo-home-mini/), [MSE thread, around Oct 2025](https://forums.moneysavingexpert.com/discussion/6633174/switching-away-from-octopus-smart-meter-question), [MSE "paperweight" post](https://forums.moneysavingexpert.com/discussion/6568717/smart-meter-with-octopus-home-mini)). I found no official Octopus statement [unverified]. The wall display that came with the meter (the IHD) usually keeps working after a switch, but it can't send data to the panel.

2. **Best supplier-independent route with live data: a Hildebrand Glow Display/CAD read through the Glowmarkt cloud API.** It gives:
   - live demand about every 10 s (the `current` endpoint),
   - half-hourly or 1-minute readings for the day graph,
   - the cumulative meter reading.

   It works with any supplier because Hildebrand connects to your meter through the DCC (the national smart-meter network) as an approved "Other User". **The catch is stock.** The shop lists it at £69.99 but shows it sold out, with a £15 deposit or a free waitlist. Some deposit items say "will ship Autumn 2026".

3. **Free, no hardware, but no live figure: the Bright app (also Hildebrand) using DCC data, through the same Glowmarkt API.** You get half-hourly kWh, typically about 30 minutes behind if the page calls `catchup` every half hour. That covers the day graph and "today so far" (lagging by about 30–60 min), but not "current usage".

4. **n3rgy is no longer an option for households.** It ended consumer API support and closed consumer sign-up on 1 Oct 2024. A profile dated 27 Jul 2026 still describes the consumer API as unavailable.

5. **Fully independent live option: a CT-clamp monitor such as the Shelly EM Gen3 (about £56–70).** It needs an electrician to wire it in at the consumer unit [unverified for UK rules]. A browser can read it locally from an HTTPS page only after Chrome's Local Network Access permission is granted, or through Shelly Cloud.

#### Comparison

| Option | Live demand | Day graph / today so far | Cost | Works with Fuse? | Fits a static page (browser-only)? |
|---|---|---|---|---|---|
| Octopus Home Mini | Not after leaving Octopus | No | – | No (tied to Octopus account) | No |
| Glow Display/CAD + Glowmarkt API | Yes, about every 10 s | Yes: PT30M/PT1M readings | £69.99, sold out (£15 deposit/waitlist) | Yes (DCC Other User) | Yes, if the API allows browser calls (CORS) [unverified], otherwise a small proxy |
| Glow Display local MQTT | Yes, about every 10 s; payload also includes today's kWh | Today's kWh only; graph must be built client-side | Same device | Yes | Needs a broker the browser can reach over secure WebSockets (wss) [unverified that the Glow can publish over TLS] |
| Bright app (DCC only) + Glowmarkt API | No | Yes, half-hourly, about 30 min behind with `catchup` | Free | Yes | Same CORS caveat |
| n3rgy consumer API | No | Was half-hourly | – | Closed to consumers since 1 Oct 2024 | No |
| Loop app (now owned by Procode) | No | Half-hourly, every ~2 h, 2–3 h behind | Free | Yes (DCC) | No public API [unverified] |
| Fuse's own app / private API | Fuse marketing says "near real-time"; unofficial client sees hourly data | Hourly, after the hour ends | Free | Yes | Unofficial API, 15-min tokens, SMS login; not supported |
| Shelly EM Gen3 CT clamp | Yes, about 1 s | Yes (device energy counters; graph client-side) | About £56–70 + electrician | Yes (doesn't touch the meter) | Local HTTP needs Chrome LNA permission; or Shelly Cloud (1 request/s) |
| Smart-meter IHD | Shown on the screen only | On screen only | Free | Usually yes | No data output |

#### 1. Hildebrand Glow (consumer access device, CAD)

##### Hardware and price
- **Glow Display and CAD** (in-home display plus CAD, SMETS1 and SMETS2 variants): £69.99 including tax, Wi-Fi.
  - The shop says it is sold out and offers a £15 deposit "to secure today's price" or a free waitlist ([product page](https://shop.glowmarkt.com/products/display-and-cad-combined-for-smart-meter-customers), [shop home](https://shop.glowmarkt.com/)).
  - Related deposit items (certificate swap, sensor) say "will ship Autumn 2026" ([certificate swap](https://shop.glowmarkt.com/products/smets-certificate-swap), [sensor](https://shop.glowmarkt.com/products/sensors)).
  - The waitlist page still quotes "mid April 2024" for stock ([waitlist](https://shop.glowmarkt.com/pages/waiting-list-for-smets2-display)), so shipping dates are uncertain [unverified live].
- **Glow "Wired CAD":** the listing also shows £69.99 and sold out ([page](https://shop.glowmarkt.com/products/glow-cad-for-smart-meters)).
- **Glow Stick (USB Wi-Fi CAD):** about £50 historically, and described as SMETS1-only and needing supplier agreement. Treat it as legacy; I found no current listing ([OEM forum](https://community.openenergymonitor.org/t/a-taste-of-things-to-come-uk-smart-meter-data-access/4820/241)) [unverified current].
- **Second-hand units** need Hildebrand to re-register them, and a Feb 2025 forum post mentions a £30 fee. Units are tied to your meters, so resale isn't supported ([Glow forum](https://forum.glowmarkt.com/index.php?p=%2Fdiscussion%2F491%2Fgd-1-ihd-buying)).

##### How pairing works, and why it survives a supplier switch
- Hildebrand says it can join the Display/CAD to your meters without the supplier's involvement because it is a SECAS-approved DCC Other User ([hildebrand.co.uk product page, via search snippet](https://www.hildebrand.co.uk/products/ihd-cad)).
- The SEC Parties List shows Hildebrand Technology Ltd as "Yes - Other User", verified 27 Jul 2026 ([API Evangelist profile](https://github.com/api-evangelist/hildebrand)).
- When the CAD first goes online, Hildebrand's servers ask the DCC to have the meter's comms hub join it to the home network. They retry six times; after that, support has to re-trigger it ([HA community, Hildebrand support reply, via snippet](https://community.home-assistant.io/t/understanding-hildebrand-smart-meter-glow-cad/1007818)).
- Earlier product copy excluded Trilliant comms hubs [unverified current].
- The known risk is not a supplier switch as such, but a supplier replacing the comms hub. Glow asks you to contact them before that happens (product page, via snippet).

##### Setup for a non-technical person
1. Install Bright and create an account.
2. Order the device, giving your Bright email so it can be pre-linked.
3. Verify your identity in Bright.
4. Plug the device in and join it to Wi-Fi.
5. Wait for Hildebrand to join it to the meter (can take hours or days; contact support if it is stuck on "connecting").

Sources: [Google Play listing](https://play.google.com/store/apps/details?id=uk.co.hildebrand.brightionic&hl=en_GB), [HA community](https://community.home-assistant.io/t/energy-dashboard-and-hildebrand-glow-dcc-integration/593455).

##### Data
- Electricity updates about every 10 s; gas typically every 30 min (product page, via snippet).
- The local MQTT payload (topic `glow/<MAC>/SENSOR/electricitymeter`) includes:
  - `power.value` in kW (live demand),
  - `energy.import.cumulative` (meter register in kWh),
  - `energy.import.day`, `week` and `month`,
  - unit rate and standing charge.

  Source: the sample payload in [megakid/ha_hildebrand_glow_ihd_mqtt sensor.py](https://raw.githubusercontent.com/megakid/ha_hildebrand_glow_ihd_mqtt/main/custom_components/hildebrand_glow_ihd_mqtt/sensor.py). **`import.day` is a ready-made "today so far".**
- Local MQTT arrived with IHD firmware 1.8.12 and is set on the device under Metering > MQTT (host, credentials) ([Glow forum thread title](https://forum.glowmarkt.com/index.php?p=%2Fdiscussion%2F180%2Fihd-firmware-release-1-8-12-with-local-mqtt-for-display-cad-customers), [techbits guide, via snippet](https://techbits.io/hildebrand-glow-display-mqtt-home-assistant-setup/)).
- Glow also runs a legacy cloud broker, `glowmqtt.energyhive.com:8883`, topic `SMART/HILD/<id>`, carrying raw hex Zigbee registers ([ndfred gist](https://gist.github.com/ndfred/5bb51b567f8cfaf2bb06da6393169321)). A 2025 forum report says it refused connections ("not authorised") [unverified].

##### Glowmarkt cloud REST API (same for Glow hardware and Bright-only users)
- **Base URL:** `https://api.glowmarkt.com/api/v0-1/` ([resource API spec, harvested from Hildebrand's Swagger, © 2012-26](https://raw.githubusercontent.com/api-evangelist/hildebrand/main/openapi/hildebrand-resource-api-openapi.yml); [pyglowmarkt source](https://raw.githubusercontent.com/cybermaggedon/pyglowmarkt/master/glowmarkt/glowmarkt.py)).
- **Login:** `POST /auth` with JSON `{username, password}` and header `applicationId: b0f1b774-a586-4f72-9edd-27ead8aa7a8d` (the ID published for Bright users). It returns a token valid about 7 days. Every later call sends the headers `token` and `applicationId` ([API Evangelist review.yml, quoting Hildebrand's individual-user PDF last updated 9 Apr 2026](https://raw.githubusercontent.com/api-evangelist/hildebrand/main/review.yml); pyglowmarkt).
- **Discovery:** `GET /virtualentity`, then `GET /virtualentity/{veId}/resources`. Choose the resource whose `classifier` is `electricity.consumption` (kWh) or `electricity.consumption.cost` (pence) ([pyglowmarkt on PyPI](https://pypi.org/project/pyglowmarkt/)).
- **`GET /resource/{id}/readings`** takes `from`, `to` (format `yyyy-mm-ddThh:mm:ss`), `period` (PT1M…P1Y), `function=sum`, `offset` and `nulls=1`.
  - `offset` is in minutes, so BST needs `-60`. Clocks go back on 25 Oct 2026, after which it becomes `0`.
  - `nulls=1` makes missing slots come back as null instead of 0.
  - Each query has a size limit: PT30M allows 10 days, PT1H 31 days, and PT1M 2 days (spec; limits from search snippets of the Glowmarkt PDFs, [individual](https://docs.glowmarkt.com/GlowmarktAPIDataRetrievalDocumentationIndividualUserForBright.pdf) and [organisation, 17 Apr 2026](https://docs.glowmarkt.com/GlowmarktApiDataRetrievalDocumentationOrganisationUser.pdf)).
- **`GET /resource/{id}/current`** returns "the latest instantaneous reading" (spec). With a CAD, a forum example returns `[[ts, 768]]` in `W` ([Glow forum](https://forum.glowmarkt.com/index.php?p=%2Fdiscussion%2F50%2Fcurrent-readings)). For DCC-only accounts it returns nothing ([pyglowmarkt](https://pypi.org/project/pyglowmarkt/); [openHAB binding](https://community.openhab.org/t/hildebrand-glowmarkt-api-binding-4-0-0-5-0-0/148561)).
- **`GET /resource/{id}/meterread`** returns the cumulative register, and the spec says it is "only… people who have a Glow IHD/CAD".
- **`GET /resource/{id}/catchup`** triggers a DCC fetch "up to the last complete half hour". The spec says to call it once per half hour, ideally with a random delay of up to 2 minutes.
- **Rate limits:** none published that I could find [unverified]. The Home Assistant DCC integration polls every 5 min and only acts around :00–:05 and :30–:35 ([HandyHat sensor.py](https://raw.githubusercontent.com/HandyHat/ha-hildebrandglow-dcc/main/custom_components/hildebrandglow_dcc/sensor.py)).
- **Browser calls (CORS):** I could not confirm whether `api.glowmarkt.com` lets a browser page call it directly, so test from the panel's origin first [unverified]. If it doesn't, a free Cloudflare Worker can relay the calls.
- **Reliability:** it's a cloud service with occasional 500 errors and token problems reported on the forum ([search summary of Glow forum](https://forum.glowmarkt.com/index.php?p=%2Fdiscussion%2F77%2Fgetting-logged-out-of-api)). The main HA DCC integration is marked "Abandoned" ([README](https://raw.githubusercontent.com/HandyHat/ha-hildebrandglow-dcc/main/README.md)), though the API itself is still documented in 2026.

#### 2. Bright app without a device (free)
- **Eligibility and cost:** SMETS2 (or E&A SMETS1) meters can get half-hourly data in Bright free after Hildebrand's verification ([Google Play](https://play.google.com/store/apps/details?id=uk.co.hildebrand.brightionic&hl=en_GB)). An AppBrain listing shows in-app subscriptions, which conflicts with this [unverified]. The App Store shows v2.1.5 dated 8 Apr 2026.
- **Delay:** about 30 minutes ([HA DCC README](https://raw.githubusercontent.com/HandyHat/ha-hildebrandglow-dcc/main/README.md)). Without a `catchup` call, the DCC delivers roughly once a day, around midnight (forum reports [unverified]; the [Indigo plugin](https://github.com/neilkplugins/Glow-IHD-CAD-indigo-plugin) says a free account without a CAD shows the previous day).
- **API:** the same Glowmarkt API, applicationId and endpoints as above. There is no `current` and no `meterread`.
- **Today-so-far:** the HA DCC integration's daily total lags by about 30 min and keeps yesterday's figure until about 01:30.
- **If data or tariff is wrong**, the supplier (now Fuse) must fix what it sends to DCC Other Users (same README).
- **Works with Fuse:** yes. Access goes through the DCC and is tied to your meter (MPAN), not to the supplier.

#### 3. n3rgy
- **Status:** "n3rgy API support for consumers from 1st October 2024" was discontinued and consumer portal sign-up closed on the same date ([support article](https://support.n3rgy.com/support/solutions/articles/103000315764-n3rgy-api-support-for-consumers-from-1st-october-2024), [sign-up closed](https://support.n3rgy.com/support/solutions/articles/103000315763-consumer-portal-signup-is-closed-from-the-1st-october-2024); both via search, the site is blocked here).
- **Org page:** n3rgy's GitHub org says "the consumer API is not longer available (it's a regulatory thing)", with an update hoped for "soon" ([github.com/n3rgy](https://github.com/n3rgy)).
- **As of 27 Jul 2026:** a third-party profile still calls the consumer API unavailable. Live access needs a business sign-up via the `api-v2.data.n3rgy.com` x-api-key API ([API Evangelist n3rgy](https://github.com/api-evangelist/n3rgy)).
- **How it used to work:** you supplied your MPAN plus the IHD's MAC address as the key. It gave half-hourly data, 90 days per request, no live data ([Loop KB](https://kb.loop.homes/how-to-download-your-data), [npm n3rgy](https://www.npmjs.com/package/n3rgy)).
- **Conclusion:** not usable for new households in 2026.

#### 4. Other options
- **Loop app:** now owned by Procode ([loop.homes](https://loop.homes/)). It uses DCC half-hourly data, requested about every 2 h, so it runs 2–3 h behind. It has no live readings ([Loop KB](https://kb.loop.homes/knowledge/how-often-does-my-energy-usage-data-update), [why no live data](https://kb.loop.homes/why-cant-i-see-live-readings)). There is no public API [unverified].
- **Fuse itself:**
  - Fuse marketing promises half-hourly usage in its app.
  - An unofficial Home Assistant integration uses Fuse's private mobile API. Fuse publishes hourly, the client polls every 15 min, the hour in progress is unreliable, and login is by SMS code ([yakupafsin/fuse-energy-ha README](https://raw.githubusercontent.com/yakupafsin/fuse-energy-ha/main/README.md)).
  - Its PR #12 notes access tokens last 15 min ([PR #12](https://github.com/yakupafsin/fuse-energy-ha/pull/12)).
  - Fuse doesn't support it, and it isn't live.
- **Shelly EM Gen3 (CT clamp):**
  - Price: about £55.55–£69.99 in the UK. Use the Pro EM/Gen3 50A clamp; the older EM clamp is incompatible ([shellystore.co.uk](https://shellystore.co.uk/product/50a-clamp-for-shelly-em-pro-gen3/), [smarthomeshopuk](https://smarthomeshopuk.com/products/shelly-em-gen3/)).
  - Local data: RPC `EM1.GetStatus` gives `act_power`, and `EM1Data.GetStatus` gives energy totals ([Shelly docs, via snippet](https://shelly-api-docs.shelly.cloud/gen2/ComponentsAndServices/EM1)). Local responses carry `Access-Control-Allow-Origin: *` ([Shelly auth docs, via snippet](https://shelly-api-docs.shelly.cloud/gen2/General/Authentication/)).
  - Browser access: an HTTPS GitHub Pages site calling `http://192.168.x.x` needs Chrome's Local Network Access permission (Chrome 141/142, stable around Oct 2025). That permission exempts private-IP requests from the HTTPS-to-HTTP block ([Chrome blog](https://developer.chrome.com/blog/local-network-access), via snippet).
  - Shelly Cloud API alternative: limited to 1 request/s ([Shelly cloud docs](https://shelly-api-docs.shelly.cloud/cloud-control-api/communication-v2/)); CORS unknown.
  - Trade-offs: needs mains wiring by a qualified person (Shelly's guidance for Gen3 EM-family devices, [Pi Hut](https://thepihut.com/products/shelly-3em-63w-gen3-single-or-three-phase-energy-meter)); a CT clamp is less accurate than the billing meter; it stores no meter-certified history. It is completely independent of the supplier.
- **The meter's own IHD:** live on its screen only, with no way to get data out. It usually survives a supplier switch on SMETS2 ([MSE thread](https://forums.moneysavingexpert.com/discussion/6633174/switching-away-from-octopus-smart-meter-question)).

#### Recommendation for this panel
- **Now, free, no hardware:**
  1. Sign up to Bright and complete verification.
  2. Have the panel log in to Glowmarkt, call `catchup` just after each :00 and :30.
  3. Fetch today's `readings` at PT30M with `offset=-60` (BST) to draw the graph; summing them gives "today so far".
  4. Show "last updated hh:mm" because the data is about 30–60 min old.
- **If live usage is wanted:**
  - Put down the £15 Glow deposit or join the waitlist. When it arrives, the same code gains `current` (W) and PT1M readings with no other changes.
  - Or fit a Shelly EM Gen3 (electrician needed) and read it locally after granting Chrome's local-network permission.
- **Either way:** test first whether the browser can call `api.glowmarkt.com` directly; if not, add a tiny Cloudflare Worker relay.
- **Drop:** the Octopus Home Mini and Octopus API code.

### Fact-check

The report's core recommendation holds up: drop the Octopus Home Mini, use Bright plus the Glowmarkt API for free half-hourly data, and add a Glow CAD (or a CT clamp) for live usage. The API details I could check against the harvested Swagger spec and client code were accurate: base URL, auth/applicationId, the 7-day JWT, virtualentity and resources discovery, classifiers, readings parameters including offset -60 for BST, the catchup guidance, and meterread being CAD-only. So were the HA DCC README's ~30-minute delay and 'Abandoned' status, the Glow MQTT payload fields, the Fuse unofficial-API caveats, and n3rgy's consumer API being unavailable. Weaker points: (1) The Home Mini stopping after a switch rests only on secondary sources, with no Octopus statement found, though nothing contradicts it. (2) 'current returns nothing for DCC-only' rests on a 2021 author note ('can't get these to work'), not documentation. (3) Glow hardware availability and the 'Autumn 2026' shipping text could not be checked; it is confirmed sold out with a £15 deposit or waitlist, with an Aug 2026 back-order report. (4) Chrome LNA version numbers and Android support are unverified, though the mechanism is confirmed by the WICG explainer. (5) Loop and Shelly details are unverified, but neither changes the recommendation. The biggest open issue that could change the build plan is whether api.glowmarkt.com allows browser CORS. I could not test it (proxy 403), and no source documents it, so the plan should assume a small relay may be needed and handle credentials with care.

Claims not fully confirmed:

- **partly**: 1. The Octopus Home Mini is tied to the Octopus account and Kraken cloud and stops being useful after switching away from Octopus. No official Octopus statement was found. → The direction is right, but every source is secondary. Search snippets from saveonenergybills say the Home Mini is tied to the Octopus account and app and only works while you are an Octopus customer. A June 2025 review (shkspr.mobi) describes being 'vendor locked-in to Octopus'. I could not open Octopus help pages, saveonenergybills, shkspr or the MSE threads (DNS or proxy blocked here). An Octopus primary statement is still [unverified]. The CSA listing confirms only that Octopus Energy Ltd is the maker of record and that it is a CAD.
- **partly**: 3. The Glow Display and CAD is £69.99 and sold out, with a £15 deposit or a free waitlist. Some deposit items say 'will ship Autumn 2026'. → Search snippets of the product page and shop home confirm £69.99, out of stock, and the '£15 Deposit to Secure Today's Price OR Join our free Wait List' wording. The shop footer shows 2026. A Homey community post from Aug 2026 says displays are 'on back order'. I could not see the 'Autumn 2026' shipping text (shop.glowmarkt.com is blocked), so it is [unverified]. No firm delivery date is confirmed, so the live route has no confirmed delivery date.
- **partly**: 7. The /current endpoint returns no data for DCC-only accounts (no Glow hardware). → The evidence is weaker and older than the report suggests. The pyglowmarkt README (2021 example output, SMETS2 meter, DCC-sourced) says current and meter reading are 'Not implemented'. The author adds: 'I can't get these to work, maybe not implemented, or maybe only work with Glowmarkt hardware'. The spec documents /meterread as CAD-only but does not say that about /current. The HA DCC README says real-time data needs Glow hardware. The conclusion is probably right ('no live figure without a CAD'), but the exact /current behaviour in 2026 is [unverified].
- **partly**: 10. SMETS2 users can get half-hourly data in Bright free after verification. → The cited Google Play page was blocked here. The HA DCC README says 'set up your smart meter for free in the Bright app' and that it works for SMETS2 via the DCC. The API Evangelist plans file (captured 2026-07-27) says access to your own household data through the Bright applicationId 'is free and self-serve'. The AppBrain in-app-subscription conflict remains [unverified].
- **partly**: 11. n3rgy discontinued its consumer API and closed consumer sign-up from 1 Oct 2024, and it was still unavailable in July 2026. → The n3rgy GitHub org page says: 'unfortunately the consumer API is not longer available (it's a regulatory thing). We hope to have an update soon.' The API Evangelist n3rgy profile (created and modified 2026-07-27) says it is 'no longer available' but gives no closure date. The 1 Oct 2024 date rests only on the support-article titles, because the site is blocked and my search budget ran out. Unavailability is confirmed; the exact date is [unverified].
- **unverified**: 12. Loop requests DCC data about every 2 hours, is 2–3 hours behind, and has no live readings. → kb.loop.homes is blocked by the proxy (403) and my search budget was used up, so I could not check this. It does not change the recommendation either way, since Loop has no public API.
- **partly**: 14. Chrome Local Network Access (Chrome 141/142) lets HTTPS pages call private-IP devices after a permission prompt, exempting private IP literals from mixed-content blocking. → The WICG explainer confirms the mechanism. Requests are local if 'The hostname is a private IP address literal ... or .local', and in that case 'we skip ... upgrading mixed content and blocking mixed content', gated on the 'local network access' permission. It also adds fetch(..., {targetAddressSpace:'local'}). The Chrome version numbers, and whether this shipped on Chrome for Android (the user's Lenovo tablet), could not be checked, because developer.chrome.com and chromestatus are blocked here [unverified].
- **unverified**: 15. The Shelly EM Gen3 is about £55.55–£69.99 in the UK, and the Shelly Cloud API allows 1 request per second. → The Shelly docs and the UK shops were not reachable, and my search budget was exhausted, so I could not check the price or the rate limit. It is a secondary option, so it does not change the main recommendation.

Missed by the first report:

- CORS on api.glowmarkt.com is still unknown and decides the architecture. I tried a preflight (OPTIONS with an Origin header) from here, but the egress proxy refused the connection (403), so the question stays open. Neither the API Evangelist conventions/review files nor the Swagger-derived spec mention CORS or Access-Control headers. The panel should test this first, and the report should budget for a Cloudflare Worker relay as the likely default rather than a fallback. Note too that a relay that forwards the Bright username and password, or a 7-day JWT, puts credentials through a third-party worker. (https://raw.githubusercontent.com/api-evangelist/hildebrand/main/review.yml)
- The Glowmarkt API has a DCC daily consumption log, `/resource/{id}/dailyConsumptionLog`, giving midnight totals in Wh (UTC). It could be used to reconcile 'yesterday' or as a cross-check, but it is not a 'today so far' source. (https://raw.githubusercontent.com/api-evangelist/hildebrand/main/openapi/hildebrand-resource-api-openapi.yml)
- Organisational (third-party) access to Glowmarkt starts at £595/month per MPxN. Only the individual Bright applicationId is free, and it is meant for your own data. The panel must therefore use the user's own Bright login, and no shared or hosted service can be built cheaply on top of it. (https://raw.githubusercontent.com/api-evangelist/hildebrand/main/plans/hildebrand-plans.yml)
- Fuse login requires an SMS code and the session expires, so even an unofficial Fuse route would break unattended on a wall panel. The README also notes the website needs a specific version header, which suggests a Fuse web client exists. That could mean CORS is restricted to Fuse's own origin [unverified]. (https://raw.githubusercontent.com/yakupafsin/fuse-energy-ha/main/README.md)
- The report does not say what happens to the existing Octopus API key and historical data after leaving. The key may still return pre-switch consumption, but no new readings will arrive [unverified]. The panel's Octopus code should be removed or switched off so it does not show stale data. No primary source found.
- Whether Local Network Access is enabled in Chrome on Android, which the tablet runs, was not addressed. The explainer describes the mechanism but not platform rollout [unverified]. (https://raw.githubusercontent.com/WICG/local-network-access/main/explainer.md)
- Clock change: the BST offset of -60 becomes 0 after 25 Oct 2026. The 'today' window will then have 25 half-hours on the night the clocks go back. The Fuse HA README specifically calls out handling the repeated 01:00 hour, and the same care applies when summing Glowmarkt PT30M readings for 'today so far'. (https://raw.githubusercontent.com/yakupafsin/fuse-energy-ha/main/README.md)
- If the DCC-only data looks wrong after the switch (for example, a stale tariff in the cost resource), the user must ask Fuse to correct what it sends to DCC Other Users. The kWh figures are the reliable part, so the panel should compute cost locally from the Fuse fixed rate. (https://raw.githubusercontent.com/HandyHat/ha-hildebrandglow-dcc/main/README.md)
- Verification limits: my web search budget ran out partway through. Most vendor sites (glowmarkt, Octopus, MSE, Loop, Chrome, Shelly, Play Store) were DNS- or proxy-blocked here. Several claims therefore rest on GitHub-hosted copies and search snippets rather than on the vendors' own pages.

## Can a web page read those APIs directly?

#### Summary (as of 2026-10-13)

| API | Can the panel call it straight from the browser? | Live "current usage"? | What it can give the panel |
|---|---|---|---|
| **(a) Glowmarkt / Bright** (`api.glowmarkt.com`) | **Unknown.** I found no evidence either way. Plan for a proxy, but test first because it takes one minute. | **No** without Glow-brand hardware. DCC data runs about 30 minutes to several hours behind. | A half-hourly graph and a lagging "today so far" |
| **(b) n3rgy consumer API** | **Not relevant any more.** The consumer API was shut down (support article dated 1 Oct 2024). It used to be called from browsers. | No | Nothing for a household today |
| **(c) Fuse Energy** (`api.fuseenergy.com`, private) | **Unknown, probably needs a proxy.** There is no public API, no browser client exists, and sign-in uses SMS codes. | **No.** Data comes as hourly bars, published up to an hour late. | An hourly graph and a lagging "today so far" |

**Main point for the parent:** none of these three gives live current usage. Live usage only comes from a consumer access device (CAD). That means the Octopus Home Mini through Octopus's API, which the panel already calls from the browser, or a Glow CAD. So the CORS question here only affects the daily graph and the today total.

**Network limits on this research:** I could not send a real CORS test. `api.glowmarkt.com`, `docs.glowmarkt.com`, `forum.glowmarkt.com`, `support.n3rgy.com`, `www.fuseenergy.com`, `medium.com`, `community.home-assistant.io`, `grep.app` and `web.archive.org` were all blocked or did not resolve in this environment. GitHub and raw.githubusercontent.com could be reached, so most of the evidence below comes from client source code there. Claims taken only from search snippets are marked medium confidence.

---

#### (a) Glowmarkt / Hildebrand (Bright app)

**How the API is called** (from client source code):
- Base URL: `https://api.glowmarkt.com/api/v0-1`. Every call sends the custom headers `applicationId` and `Content-Type: application/json`. Authenticated calls also send a `token` header. Login is `POST auth` with `{username, password}`. `GET auth` checks a token and returns its expiry. Source: https://github.com/Mossop/glowmarkt-rs/blob/main/src/lib.rs (lines 22-24, 224-226, 290, 340-375).
- Because of those custom headers, Chrome will always send a CORS preflight (OPTIONS). The browser call only works if the server answers with `Access-Control-Allow-Origin` and an `Access-Control-Allow-Headers` list that includes `applicationid`, `token` and `content-type`.

**CORS evidence: none either way.**
- My direct OPTIONS test was blocked by the network policy here: the proxy returned 403 on CONNECT to api.glowmarkt.com.
- I searched for client-side use: GitHub repository search for "glowmarkt" (31 repos), JavaScript-only repos, and web searches for bookmarklets, userscripts, extensions, Lovelace cards and PWAs. I found **no** browser-side client. Every client runs on a server or locally:
  - Python: pyglowmarkt and several Home Assistant integrations
  - Rust: glowmarkt-rs, glowmarkt_logger
  - Go: glowmarkt-importer, glowMarkt2Influx
  - C#: GlowmarktApi
  - Node.js scripts: ralphcollett/glowmarkt-csv, Lyall-A/Glowmarkt-API-Fuckery (uses `Buffer` and `require`)
  - Homey (Node): com.glowmarkt.api
  - GitHub Actions: hutcheson-dotcom/glow-report. This one builds a static GitHub Pages dashboard but fetches the data in Actions, so the page itself makes no API calls.
- I found no forum or GitHub post that reports a Glowmarkt CORS error, and none that says it works from a browser.
- **Verdict: unknown.** Plan for a Cloudflare Worker. Before building it, run this one-minute test from the panel's own GitHub Pages origin in Chrome DevTools. It uses a dummy token, so no real credentials are sent:
  ```js
  fetch('https://api.glowmarkt.com/api/v0-1/auth',{headers:{applicationId:'b0f1b774-a586-4f72-9edd-27ead8aa7a8d',token:'x'}})
    .then(r=>console.log('CORS OK, status',r.status)).catch(e=>console.log('Blocked (CORS?)',e))
  ```
  If it logs any HTTP status, including 401 or 200 with `valid:false`, the browser can call the API. If it logs `TypeError: Failed to fetch` and the console shows "blocked by CORS policy", a proxy is needed.

**applicationId:**
- The Bright app's ID is `b0f1b774-a586-4f72-9edd-27ead8aa7a8d`.
- Third-party projects hard-code it, for example pyglowmarkt (https://raw.githubusercontent.com/cybermaggedon/pyglowmarkt/master/glowmarkt/glowmarkt.py line 66) and glowmarkt-rs (`APPLICATION_ID`, lib.rs line 24).
- Search snippets say Glowmarkt's own Bright PDF and its "Can I get access to my data?" support page publish the same ID. I could not open either page here (medium confidence).
- An older 2020 individual-user guide used `b576fdb0-6e43-4ea4-ac75-a0fd85b0d701`. It is marked deprecated for Bright customers (search snippet, medium confidence).
- Before any of this works, the user must create a Bright account and complete SMETS2 verification in the Bright app (search snippet of the Glowmarkt PDF).

**Token lifetime:** a JWT that "currently expires after 7 days". The Bright PDF says so (search snippet, medium confidence), and an integration README states "Auth tokens last 7 days and are renewed automatically": https://github.com/existentia/hildebrand-glow-ha. The auth response includes an `expiry` field (glowmarkt-rs). Forum snippets say a token can be renewed by sending the old one to `auth/newToken` [unverified].

**Rate limits:**
- I found no published per-request limit.
- The documentation caps how much data one query can return. Per search snippets: PT30M up to 10 days, P1D up to 31 days. The existentia README says hourly queries are capped at 31 days.
- Community integrations say asking for a DCC "catchup" more than every 2 hours hits an upstream rate limit, and polling faster than every 30 minutes "just burns API calls" (existentia README) [not confirmed from a primary source].
- A 29 March 2022 Glowmarkt forum status update blamed load spikes on "aggressive API calling" by open-source code (search snippet, medium confidence).

**Data freshness:**
- "The data provided will be delayed by around 30 minutes. To get real-time consumption data, you can buy Hildebrand Glow hardware": https://github.com/HandyHat/ha-hildebrandglow-dcc
- Another integration says "in practice Glow can still be several hours behind" and that P1D day totals "can lag or go stale": https://github.com/jlaflin/ha-glowmarkt
- The `/current` endpoint is "Not implemented" for DCC-sourced entities: https://github.com/cybermaggedon/pyglowmarkt (README).
- So Glowmarkt cannot supply "current usage" from an Octopus Home Mini.

#### (b) n3rgy consumer API

- **Discontinued.** The n3rgy support article is titled "n3rgy API support for consumers from 1st October 2024". Search results summarise it as the consumer API being discontinued from that date. I could not open the page (medium confidence).
- n3rgy's GitHub organisation page says "the consumer API is not longer available (it's a regulatory thing)": https://github.com/n3rgy
- A MoneySavingExpert thread from October 2024 says new consumers can no longer sign up (search snippet).
- What remains is a business API. Every call needs an `x-api-key` header, and keys are only enabled after a business sign-up (API Evangelist profile, 2026-07-27): https://github.com/api-evangelist/n3rgy
- **History:** the browser did work. The `n3rgy` npm client says it is for "server-side and browser based applications". It called `https://consumer-api.data.n3rgy.com` with an `authorization` header holding the IHD MAC address, and it powered the browser dashboard MySmartMeterData.io: https://github.com/jonathanadams/n3rgy-client (README and src/request.ts). That repo is now archived.
- **Verdict:** not an option for a household in 2026, so its CORS support no longer matters.

#### (c) Fuse Energy

- **No public API.** API directories say Fuse publishes no public API, developer portal or SDK (search snippet: https://apis.io/providers/fuse-energy/). Community integrations describe it as Fuse's private mobile API, "learned by observation" and "correct until Fuse changes it": https://github.com/yakupafsin/fuse-energy-ha/blob/main/custom_components/fuse_energy/const.py
- **Endpoints and headers** (from https://github.com/yakupafsin/fuse-energy-ha, files api.py, auth.py and const.py; and https://github.com/simonsolts/fuse-homeassistant):
  - Data: `https://api.fuseenergy.com/api/v2/customer/premises`, then `/api/v1/premises/{id}/chart?year=&month=&day=`. This returns **hourly** bars with kWh and cost; the bar `type` is `REALISED` for actual readings.
  - Every call sends `Authorization: Bearer <access>` and a custom `Device-Id` header, so Chrome would send a preflight.
  - Sign-in is by SMS one-time code:
    1. `POST /api/v3/auth` with `challenge_type: INITIAL`. This only creates a flow token.
    2. `POST https://www.fuseenergy.com/api/trpc/phoneSignIn` with an `x-fuse-app-version` header (the value was "0.5.388" on 20 Sep 2026; Fuse rejects versions it treats as too old). This call actually sends the SMS.
    3. Submit the code (`PHONE_OTP`).
    4. Fuse may ask identity questions (`ADDITIONAL_INFO`: date of birth, postcode).
  - Tokens rotate through `POST /api/v1/auth/refresh`. Fuse wants both the old access token in the Authorization header and the refresh token in the body. Access tokens are short-lived.
  - Fuse publishes consumption "with a lag of up to an hour" and revises recent hours afterwards. The integrations poll every 15 minutes.
  - Another reverse-engineered client confirms the host and base path `https://api.fuseenergy.com/api/v1`: https://github.com/LionZXY/FuseEnergyApi
- **CORS evidence:** none. Every client found is server-side (Python for Home Assistant, Kotlin). Fuse's own website clearly makes some API calls, but any CORS allow-list would most likely cover only `www.fuseenergy.com` [unverified]. Its Next.js tRPC SMS endpoint is very unlikely to accept other origins [unverified].
- **Verdict:** unknown, assume a proxy is needed. You can check the data API with a dummy credential from the panel origin: `fetch('https://api.fuseenergy.com/api/v2/customer/premises',{headers:{Authorization:'Bearer x','Device-Id':'test'}})`. A readable 401 means CORS is allowed. Even if CORS works, this route is fragile: it is a private API, the SMS and identity-question sign-in is awkward on a wall tablet, the required app version changes, and it may conflict with Fuse's terms. It also gives no live usage.

#### Proxy fallback

A Cloudflare Worker on the free plan allows 100,000 requests a day, with 10 ms of CPU per request (search summary of Cloudflare docs: https://developers.cloudflare.com/workers/platform/pricing/). That is far more than a panel polling every 30 minutes needs.

To keep it safe:
- Allow-list a single upstream host.
- Answer OPTIONS requests.
- Set `Access-Control-Allow-Origin` to the panel's github.io origin only.
- Either pass the token through from localStorage or keep the credentials as Worker secrets.

#### Files

I modified no files. I downloaded scratch copies of the Fuse integration source to /tmp/claude-0/-home-user-Home-Dashboard-/d5ed8323-04b2-5289-9906-b58467554e87/scratchpad/dl_fuse/ for reading only.

### Fact-check

The report's technical claims mostly hold up. The Glowmarkt base URL, headers and applicationId; n3rgy's shutdown; Fuse's private-API mechanics; and Glowmarkt's lag are confirmed from client source code and READMEs. The Glowmarkt PDF, the n3rgy date and the Cloudflare limits could not be checked against primary sources because those hosts are blocked here, and CORS support for Glowmarkt and Fuse is still untested. The biggest gap is the user's own question: whether the Octopus Home Mini keeps feeding live data after leaving Octopus. The report assumes it does, without evidence, and the panel's own discovery code (web/js/octopus.js lines 58 and 194) requires an active Octopus import agreement, so it will very likely break after the switch regardless. My web-search budget ran out, so the Home Mini point is unverified and needs checking before the parent recommends anything. Until then, the safe recommendation is: Bright/Glowmarkt (half-hourly, lagging) or Fuse (hourly, lagging) for the daily graph and today's total, and a supplier-independent CAD such as Glow for live usage.

Claims not fully confirmed:

- **unverified**: 3. Glowmarkt's own Bright PDF publishes this applicationId and says the JWT expires after 7 days. → docs.glowmarkt.com does not resolve from this environment (ENOTFOUND), so I could not read the PDF. The 7-day lifetime is supported only by a community README (claim 4), not by a primary Glowmarkt source.
- **unverified**: 5. No browser-side Glowmarkt client exists, so Glowmarkt CORS support is unverified. → This is an absence-of-evidence claim, and I could not independently confirm or refute it. api.glowmarkt.com also returned no connection from this environment (curl 000), so no CORS test was possible. The report's advice to run a dummy-token fetch from the panel's own origin is the right way to settle it. A readable 401 response would also need Access-Control-Allow-Origin on the error response.
- **partly**: 8. The Glowmarkt /current endpoint returns 'Not implemented' for DCC-sourced entities. → The README's sample glowmarkt-dump output for the 'DCC Sourced' entity shows 'current: Not implemented', but the author hedges: 'maybe not implemented, or maybe only work with Glowmarkt hardware'. The practical conclusion (no live demand from a DCC-only Bright setup) is consistent with claim 6, but the README never states the rule outright.
- **unverified**: 10. n3rgy discontinued consumer API support from 1 October 2024. → support.n3rgy.com could not be fetched from here, and I had no web-search budget left to check the snippet. The fact of discontinuation is confirmed by claim 9; the exact date is not. Consistent with it, the n3rgy-client repo was archived on 7 Sep 2024.
- **partly**: 11. The n3rgy npm client targeted browsers, calling consumer-api.data.n3rgy.com with the IHD MAC address in the authorization header. → Confirmed: the README says 'server-side and browser-based applications', src/request.ts sets baseURL 'https://consumer-api.data.n3rgy.com' with an 'authorization' header equal to the auth token, and the README says the token is the 16-digit IHD MAC or CIN. The repo was archived on 7 Sep 2024. I did not verify the MySmartMeterData.io link. None of this matters any more, because the API is gone.
- **partly**: 13. Fuse's /api/v1/premises/{id}/chart returns hourly kWh and cost bars, consumption appears up to an hour late, and there is no live data. → Confirmed: api.py calls /api/v1/premises/{premises_id}/chart and parses bars with type REALISED, and const.py says 'Fuse publishes consumption with a lag of up to an hour'. The README says it 'Pulls hourly electricity... readings', 'Skips the hour in progress', and polls every 15 minutes. That means a 'today so far' total from Fuse will leave out the current hour. 'No live data' is an inference: the README never states it directly.
- **unverified**: 14. The Cloudflare Workers Free plan allows 100,000 requests a day and 10 ms of CPU per invocation. → developers.cloudflare.com does not resolve from this environment, so I could not check it against the primary source. The figures match my prior knowledge of the Free plan, but treat them as unconfirmed here.

Missed by the first report:

- The user's main question is not answered: will the Octopus Home Mini keep working for live usage after leaving Octopus for Fuse? The report assumes live usage still comes 'through Octopus's API, which the panel already calls'. I could not confirm or refute this (octopus.energy does not resolve here, and the web-search budget was used up) [unverified]. This is the most important open point, and it should be checked with Octopus or a 2025-2026 source before telling the user anything.
- The panel's own code will very probably stop finding the Home Mini after the switch. web/js/octopus.js asks for electricityAgreements(active: true) (line 194), and parseAccount throws 'No active electricity import tariff found on this account' (line 58) when no active import agreement exists. It also reads the deviceId only from an active meter point. Once the Octopus supply ends, discovery will fail even if Octopus still had telemetry, so a cached deviceId would be the only path left. Separately, BottlecapDave's Octopus integration skips properties with a moved-out date and needs an agreement whose end date is null or in the future (https://github.com/BottlecapDave/HomeAssistant-OctopusEnergy/blob/develop/_docs/faq.md).
- Octopus's REST consumption endpoint will presumably stop gaining new half-hours after the switch date, so the panel's existing half-hourly graph source also goes away [unverified; source blocked].
- Octopus Home Mini data comes from Octopus's cloud, not from the device on the local network ('the data unfortunately can't be polled directly and instead has to go via the OE servers'), so there is no local fallback for the Home Mini: https://github.com/BottlecapDave/HomeAssistant-OctopusEnergy/blob/develop/_docs/faq.md
- The report does not name the live-usage alternative that works with any supplier. The HandyHat README points to Glow hardware with Local MQTT or Cloud MQTT for real-time data (https://github.com/HandyHat/ha-hildebrandglow-dcc). The report does not cover whether an HTTPS GitHub Pages page can reach either one: local MQTT would need secure WebSockets (mixed-content rules), and cloud MQTT would need a broker that accepts browser connections [unverified].
- Bright/Glowmarkt data depends on the current supplier feeding correct data to DCC Other Users. The README says 'you will need to contact your supplier and tell them to fix the data being provided to DCC Other Users'. After a switch to Fuse, Bright may show gaps until the new registration settles: https://github.com/HandyHat/ha-hildebrandglow-dcc
- HandyHat/ha-hildebrandglow-dcc, which the report cites, now says it is abandoned ('Please do not expect this integration to work'). It is fine as evidence about lag, but it should not be recommended as a reference client: https://github.com/HandyHat/ha-hildebrandglow-dcc
- Granularity trade-off for the 'graph through the day': Glowmarkt gives half-hourly (PT30M) data that lags 30 minutes to hours, while Fuse gives hourly bars and skips the hour in progress (https://github.com/yakupafsin/fuse-energy-ha). Neither gives 'current usage', so the recommendation should state plainly that live usage needs a CAD the user can still read.
