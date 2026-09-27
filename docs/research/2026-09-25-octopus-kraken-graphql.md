# Octopus Kraken GraphQL: finding the tariff and Home Mini

> Current (web app). Saved from the research runs so it is not lost with the cloud session.

_Workflow: Find the exact, proven Kraken GraphQL account query and response shape for tariff + Home Mini discovery_

**found:**

### 1. Item 1

**source urls:**

- https://raw.githubusercontent.com/BottlecapDave/HomeAssistant-OctopusEnergy/main/custom_components/octopus_energy/api_client/__init__.py
- https://raw.githubusercontent.com/BottlecapDave/HomeAssistant-OctopusEnergy/develop/custom_components/octopus_energy/api_client/__init__.py
- https://raw.githubusercontent.com/BottlecapDave/HomeAssistant-OctopusEnergy/main/custom_components/octopus_energy/utils/__init__.py
- https://raw.githubusercontent.com/BottlecapDave/HomeAssistant-OctopusEnergy/main/custom_components/octopus_energy/sensor.py
- https://raw.githubusercontent.com/BottlecapDave/HomeAssistant-OctopusEnergy/main/tests/integration/api_client/test_get_account.py
- https://raw.githubusercontent.com/springfall2008/batpred/main/apps/predbat/octopus.py
- https://raw.githubusercontent.com/ASomerN/node-red-contrib-octopus-intelligent/9eb3fc79eb31e0db7e5c20f39a8a0c05a20d94e7/lib/discovery.js
- https://raw.githubusercontent.com/qwandor/octopower/main/octopower/graphql/schema.graphql

**query text:**

account_query = '''query {{
  octoplusAccountInfo(accountNumber: "{account_id}") {{
    enrollmentStatus
  }}
  properties(accountNumber: "{account_id}") {{
      id
      occupancyPeriods {{
              effectiveTo
            }}
    }}
  account(accountNumber: "{account_id}") {{
    
    electricityAgreements(active: true) {{
			meterPoint {{
				mpan
				direction
				meters(includeInactive: false) {{
          activeFrom
          activeTo
          makeAndType
					serialNumber
          makeAndType
          meterType
          smartExportElectricityMeter {{
						deviceId
            manufacturer
            model
            firmwareVersion
					}}
          smartImportElectricityMeter {{
						deviceId
            manufacturer
            model
            firmwareVersion
					}}
				}}
				agreements(includeInactive: true) {{
					validFrom
					validTo
          tariff {{
            ... on TariffType {{
              productCode
              tariffCode
            }}
          }}
				}}
			}}
    }}
    gasAgreements(active: true) {{
			meterPoint {{
				mprn
				meters(includeInactive: false) {{
          activeFrom
          activeTo
					serialNumber
          consumptionUnits
          modelName
          mechanism
          smartGasMeter {{
						deviceId
            manufacturer
            model
            firmwareVersion
					}}
				}}
				agreements(includeInactive: true) {{
					validFrom
					validTo
					tariff {{
						tariffCode
            productCode
					}}
				}}
			}}
    }}
  }}
}}'''
(Python str.format template: {{ }} become literal { } and {account_id} is replaced. It is POSTed as {"query": ...} to {base_url}/v1/graphql/ with header "Authorization": "<token>", a raw token with no "JWT " prefix, obtained from mutation obtainKrakenToken(input: { APIKey: "..." }) { token refreshToken refreshExpiresIn }. The main and develop branches were byte-identical when fetched.)

**tariff type names:**

- TariffType

**agreement fields:**

BottlecapDave reads validFrom/validTo/tariff only from meterPoint.agreements. It never reads them from the top-level electricityAgreements items, which it uses only as the list of meter points. Verbatim from map_electricity_meters:
  "agreements": list(map(lambda a: {
    "start": a["validFrom"],
    "end": a["validTo"],
    "tariff_code": a["tariff"]["tariffCode"] if "tariff" in a and "tariffCode" in a["tariff"] else None,
    "product_code": a["tariff"]["productCode"] if "tariff" in a and "productCode" in a["tariff"] else None,
  }, meter_point["meterPoint"]["agreements"] if "meterPoint" in meter_point and "agreements" in meter_point["meterPoint"] and meter_point["meterPoint"]["agreements"] is not None else []))
and it maps the whole of data.account.electricityAgreements with map_electricity_meters.

Active selection (utils/__init__.py get_active_tariff), verbatim core:
  for agreement in agreements:
    if agreement["tariff_code"] is None:
      continue
    valid_from = as_utc(parse_datetime(agreement["start"]))
    if utcnow >= valid_from and (latest_valid_from is None or valid_from > latest_valid_from):
      latest_valid_to = None
      if "end" in agreement and agreement["end"] is not None:
        latest_valid_to = as_utc(parse_datetime(agreement["end"]))
      if latest_valid_to is None or latest_valid_to >= utcnow:
        latest_agreement = agreement
        latest_valid_from = valid_from
So it picks the agreement with the latest validFrom <= now whose validTo is null or >= now, skipping agreements with no tariffCode. Because includeInactive: true is used, past agreements are returned too. sensor.py does this per point ("# We only care about points that have active agreements"; electricity_tariff = get_active_tariff(now, point["agreements"])) and creates meters only when the result is not None.

predbat (springfall2008/batpred) does the same thing from meterPoint.agreements. Its _active_tariff_code has the docstring "A fixed-term product carries a future validTo, so selecting on `validTo is None` finds nothing." It skips valid_from > now and valid_to <= now, then returns (agr.get("tariff", {}) or {}).get("tariffCode").

Schema evidence (octopower schema.graphql, an older snapshot): type ElectricityAgreementType has validFrom: DateTime, validTo: DateTime, meterPoint: ElectricityMeterPointType!, tariff: ElectricityTariffType, which means the top-level items could also carry validFrom/validTo/tariff. None of the reference clients read tariff from there.

**direction values:**

BottlecapDave only ever compares against 'EXPORT', and it treats a missing or null direction as unknown. Verbatim:
    is_export = (meter_point["meterPoint"]["direction"] == 'EXPORT') \
      if "meterPoint" in meter_point and "direction" in meter_point["meterPoint"] and meter_point["meterPoint"]["direction"] is not None \
      else None
and per meter:
        "is_export": is_export if is_export is not None else m["smartExportElectricityMeter"] is not None,
So an import point is anything that is not 'EXPORT'. When direction is absent, it falls back to whether smartExportElectricityMeter is non-null. It never tests for 'IMPORT'. Tariff selection (get_active_tariff) runs on every point regardless of direction. sensor.py then gates import-only features with `if meter["is_export"] == False:`.

Evidence that 'IMPORT' is the literal import value (upper case): ASomerN/node-red-contrib-octopus-intelligent lib/discovery.js queries account.properties.electricityMeterPoints { mpan direction ... } and has:
    // Find import and export meter points by direction. Accounts may have
    // either or both. Position in the array is NOT reliable — observed live
    // (2026-05-11) that the export meter can appear at index 0.
    const importPoint = elecPoints.find(p => p.direction === 'IMPORT') || null;
    const exportPoint = elecPoints.find(p => p.direction === 'EXPORT') || null;

predbat does not query direction at all. It classifies by smartImportElectricityMeter / smartExportElectricityMeter being non-null, falling back to the tariff code: `if tariffCode and ("OUTGOING" in tariffCode or "EXPORT" in tariffCode): isExport = True`.

**home mini device field:**

The Home Mini deviceId comes from account.electricityAgreements[].meterPoint.meters[].smartImportElectricityMeter.deviceId. BottlecapDave, verbatim:
        "device_id": m["smartImportElectricityMeter"]["deviceId"] if m["smartImportElectricityMeter"] is not None else None,
and sensor.py uses it only for non-export meters on points with an active tariff, and only when the user enabled Home Mini support in config:
          if meter["is_export"] == False:
            ...
              if meter["device_id"] is not None and meter["device_id"] != "":
                consumption_coordinator = await async_create_current_consumption_coordinator(hass, account_id, client, meter["device_id"], live_consumption_refresh_in_minutes)
That device_id is then used in smartMeterTelemetry(deviceId: "{device_id}" grouping: HALF_HOURLY start: ... end: ...).

predbat is the same: deviceID_import = meter.get("smartImportElectricityMeter", {}).get("deviceId", None), taken from the first meter whose activeFrom/activeTo covers now.

node-red discovery.js scans every electricity meter point for the first meter.smartImportElectricityMeter.deviceId, without filtering on direction.

**confidence:** high

**notes:**

Mismatch: the relayed user request was "how do i connect to google?". This computed Octopus/Kraken research task does not answer it, and the orchestrator should check it is running the intended workflow.

Findings. BottlecapDave's account query is essentially the same as ours: same electricityAgreements(active: true) > meterPoint { mpan direction meters(includeInactive: false) {... smartImportElectricityMeter { deviceId ... } } agreements(includeInactive: true) { validFrom validTo tariff { ... on TariffType { productCode tariffCode } } } }. The query shape is almost certainly not the cause of the missing active import agreement. The parser logic is the likely cause.

How the reference parser differs from ours:
(1) It never requires direction === 'IMPORT'. It only excludes 'EXPORT', and null or missing direction counts as unknown.
(2) It skips agreements whose tariffCode is null or missing, instead of failing.
(3) Among all agreements it picks the one with the latest validFrom <= now where validTo is null or validTo >= now. Fixed-term and Agile agreements usually have a future validTo, so never pick on "validTo is null".
(4) It parses validFrom/validTo as timezone-aware datetimes and compares in UTC.
(5) The response can contain several electricityAgreements entries, one per meter point, often import plus export. Export can come first (discovery.js notes the export point can be at index 0), so iterate over all of them rather than taking [0].

Things worth checking in our parser: GraphQL "errors" alongside data (BottlecapDave passes responses through process_graphql_response); direction being an enum string compared case-sensitively; and tariff possibly coming back as {} if the union member did not match the TariffType fragment.

Schema caveat: the only public schema dump found (qwandor/octopower) is old. Its interface TariffType lacks tariffCode and ElectricityMeterPointType lacks direction. Current clients use both successfully, so the live schema has them. Tariff union members in that schema: union ElectricityTariffType = StandardTariff | DayNightTariff | ThreeRateTariff | HalfHourlyTariff | PrepayTariff, all implementing TariffType.

The api.github.com tree/contents endpoints were blocked for this repo, but raw.githubusercontent.com and GitHub code search worked. BottlecapDave main and develop were identical (2383 lines).

### 2. Item 2

**source urls:**

- https://raw.githubusercontent.com/BottlecapDave/HomeAssistant-OctopusEnergy/develop/custom_components/octopus_energy/api_client/__init__.py
- https://raw.githubusercontent.com/BottlecapDave/HomeAssistant-OctopusEnergy/develop/custom_components/octopus_energy/utils/__init__.py
- https://raw.githubusercontent.com/springfall2008/batpred/main/apps/predbat/octopus.py
- https://raw.githubusercontent.com/eelmafia/octopus-minmax/HEAD/src/queries.py
- https://github.com/eelmafia/octopus-minmax/blob/HEAD/src/account_manager.py
- https://raw.githubusercontent.com/viralganatra/octopus-tariff-switcher/HEAD/src/functions/tariff-switcher/queries.ts
- https://raw.githubusercontent.com/zarbjustin/homey-octopus-energy/main/lib/KrakenClient.ts
- https://raw.githubusercontent.com/evcc-io/evcc/master/tariff/octopus/graphql/types.go
- https://raw.githubusercontent.com/evcc-io/evcc/master/tariff/octopus/graphql/api.go
- https://raw.githubusercontent.com/ryanw-mobile/OctoMeter/HEAD/composeApp/src/commonMain/graphql/com/rwmobi/kunigami/schema.graphqls
- https://raw.githubusercontent.com/ryanw-mobile/OctoMeter/HEAD/composeApp/src/commonMain/graphql/com/rwmobi/kunigami/queries/PropertiesQuery.graphql
- https://raw.githubusercontent.com/canton7/solar_battery_forecast/master/custom_components/solar_battery_forecast/octopus_api/graphql_client/enums.py
- https://raw.githubusercontent.com/canton7/solar_battery_forecast/master/custom_components/solar_battery_forecast/octopus_api/queries.graphql
- https://raw.githubusercontent.com/qwandor/octopower/main/octopower/graphql/schema.graphql

**query text:**

Verbatim from BottlecapDave/HomeAssistant-OctopusEnergy (develop @ e52c185), custom_components/octopus_energy/api_client/__init__.py, `account_query`. It is a Python str.format template, so {{ }} are literal braces:

account_query = '''query {{
  octoplusAccountInfo(accountNumber: "{account_id}") {{
    enrollmentStatus
  }}
  properties(accountNumber: "{account_id}") {{
      id
      occupancyPeriods {{
              effectiveTo
            }}
    }}
  account(accountNumber: "{account_id}") {{
    
    electricityAgreements(active: true) {{
			meterPoint {{
				mpan
				direction
				meters(includeInactive: false) {{
          activeFrom
          activeTo
          makeAndType
					serialNumber
          makeAndType
          meterType
          smartExportElectricityMeter {{
						deviceId
            manufacturer
            model
            firmwareVersion
					}}
          smartImportElectricityMeter {{
						deviceId
            manufacturer
            model
            firmwareVersion
					}}
				}}
				agreements(includeInactive: true) {{
					validFrom
					validTo
          tariff {{
            ... on TariffType {{
              productCode
              tariffCode
            }}
          }}
				}}
			}}
    }}
    gasAgreements(active: true) {{ ...(gas section omitted here) }}
  }}
}}'''

It is sent as POST {base}/v1/graphql/ with json={"query": ...} and headers {"Authorization": f"{self._graphql_token}"}, which is the raw token with no "JWT " prefix. Its live-consumption call uses f"JWT {token}". Predbat (springfall2008/batpred main @ f0dc5bc, apps/predbat/octopus.py) uses the same electricity block without `direction`.

A second, independent query that uses the TOP-LEVEL agreement fields comes from eelmafia/octopus-minmax (HEAD @ 1e24f13), src/queries.py:

account_query = """query{{
    account(
        accountNumber: "{acc_number}"
    ) {{
    electricityAgreements(active: true) {{
        validFrom
        validTo
        meterPoint {{
            meters(includeInactive: false) {{
                smartDevices {{
                    deviceId
                }}
            }}
            mpan
            direction
        }}
        tariff {{
            ... on HalfHourlyTariff {{
                id
                productCode
                tariffCode
                productCode
                standingCharge
                }}
            }}
        }}
    }}
}}"""

viralganatra/octopus-tariff-switcher (HEAD @ ceff4ac), src/functions/tariff-switcher/queries.ts, uses the same shape:

      query Account($accountNumber: String!) {
        account(accountNumber: $accountNumber) {
          electricityAgreements(active: true) {
            validFrom
            validTo
            meterPoint {
              meters(includeInactive: false) {
                serialNumber
                smartDevices {
                  deviceId
                }
              }
              mpan
            }
            tariff {
              ... on HalfHourlyTariff {
                productCode
                tariffCode
                standingCharge
              }
            }
          }
        }
      }

**tariff type names:**

- TariffType
- HalfHourlyTariff
- StandardTariff
- DayNightTariff
- ThreeRateTariff
- FourRateEvTariff
- PrepayTariff
- ElectricityTariffType

**agreement fields:**

Both places carry validFrom, validTo and tariff, because both are the same GraphQL type, ElectricityAgreementType.

Schema (OctoMeter schema.graphqls, a recent introspection dump; repo HEAD ec25bc8, 2026-09-04):
  type ElectricityAgreementType implements AgreementInterface {
    id: Int
    validFrom: DateTime   ("The start datetime of the agreement.")
    validTo: DateTime     ("The end datetime of the agreement.")
    agreedFrom: DateTime
    agreedTo: DateTime
    account: AccountType!
    meterPoint: ElectricityMeterPointType!
    tariff: ElectricityTariffType
    isRevoked: Boolean
    ...
  }
  union ElectricityTariffType = StandardTariff|DayNightTariff|ThreeRateTariff|FourRateEvTariff|HalfHourlyTariff|PrepayTariff
  interface TariffType { id: ID displayName: String fullName: String description: String productCode: String standingCharge: Float preVatStandingCharge: Float tariffCode: String isExport: Boolean tags: [String] }
  (HalfHourlyTariff implements TariffType and adds unitRates: [UnitRate] and agileCalculationInfo.)
On AccountType: electricityAgreements(active: Boolean): [ElectricityAgreementType]
On ElectricityMeterPointType: agreements(validAfter: DateTime, includeInactive: Boolean, "Exclude agreements starting in the future." excludeFuture: Boolean): [ElectricityAgreementType], with the docstring "A list of electricity agreements belonging to an account that is linked to the viewer. Filters out expired agreements by default."

Because tariffCode is on the TariffType interface in the current schema, `... on TariffType { productCode tariffCode }` is valid (HA and predbat use it in production). In the older octopower schema snapshot, TariffType had no tariffCode, which shows the field was added later.

How clients choose:
- HA and predbat use meterPoint.agreements(includeInactive: true) and pick the one covering now. HA utils/__init__.py get_active_tariff: skip entries whose tariff_code is None; keep the entry where `utcnow >= valid_from` and (end is None or `latest_valid_to >= utcnow`), choosing the latest valid_from. Predbat's is_active: False if activeFrom is missing or now < from, True if activeTo is missing, False if now > to.
- octopus-minmax, octopus-tariff-switcher, homey-octopus-energy and evcc read the TOP-LEVEL item's own validFrom, validTo and tariff (electricityAgreements(active: true) already filters to active agreements) and never touch meterPoint.agreements. evcc types.go: `ElectricityAgreements []struct { Id int; Tariff tariffData; MeterPoint struct { Mpan string } } graphql:"electricityAgreements(active: true)"`.

**direction values:**

The field is ElectricityMeterPointType.direction, of type ElectricityDirection. It is nullable (no `!`) and the enum values are UPPERCASE.

OctoMeter schema.graphqls, verbatim:
  """
  Indicates whether the electricity meter point is an import or an export meter point.
  """
  direction: ElectricityDirection

  enum ElectricityDirection {
    """
    Electricity consumed from the grid
    """
    IMPORT

    """
    Electricity is directed back to the grid
    """
    EXPORT
  }

Independent confirmation: canton7/solar_battery_forecast graphql_client/enums.py was generated by ariadne-codegen from remote_schema_url = "https://api.octopus.energy/v1/graphql/" and contains:
  class ElectricityDirection(str, Enum):
      IMPORT = "IMPORT"
      EXPORT = "EXPORT"

How clients use it:
- HA map_electricity_meters: `is_export = (meter_point["meterPoint"]["direction"] == 'EXPORT') if "meterPoint" in meter_point and "direction" in meter_point["meterPoint"] and meter_point["meterPoint"]["direction"] is not None else None`. It falls back to `m["smartExportElectricityMeter"] is not None` when direction is null.
- octopus-minmax account_manager.py: `if meter_point_data.get("direction") == "IMPORT": import_agreement = agreement`.
- evcc does not use direction. It uses the tariff's `IsExport bool` (TariffType.isExport). predbat and homey fall back to a tariffCode/productCode regex, /OUTGOING|EXPORT/.
- The older octopower schema snapshot has no `direction` field at all, so the field is relatively recent. Treating null as import (as this codebase does) matches HA.

**home mini device field:**

HA (the integration most widely used with the Home Mini) reads account.electricityAgreements[].meterPoint.meters[].smartImportElectricityMeter.deviceId. SmartMeterDeviceType.deviceId is `String!`.

HA map_electricity_meters, verbatim: `"device_id": m["smartImportElectricityMeter"]["deviceId"] if m["smartImportElectricityMeter"] is not None else None`. In sensor.py, when the user ticks "I have a Home Mini": `if meter["device_id"] is not None and meter["device_id"] != "": consumption_coordinator = await async_create_current_consumption_coordinator(hass, account_id, client, meter["device_id"], ...)`. That coordinator runs `smartMeterTelemetry(deviceId: "{device_id}" grouping: HALF_HOURLY start: ... end: ...)`.

predbat does the same: `deviceID_import = meter.get("smartImportElectricityMeter", {}).get("deviceId", None)`, taken only from a meter that is active by activeFrom/activeTo.

Alternative used by octopus-minmax and octopus-tariff-switcher: meters(includeInactive: false) { smartDevices { deviceId } }, taking the first deviceId found (minmax: `for device in meter.get("smartDevices", []): if "deviceId" in device: self.device_id = device["deviceId"]`). Schema: ElectricityMeterType.smartDevices: [SmartMeterDeviceType]; smartImportElectricityMeter: SmartMeterDeviceType.

**confidence:** high

**notes:**

1. Mismatch with the user's request: the relayed user request was "how do i connect to google?", which has nothing to do with this Octopus/Kraken research. I did only read-only web and GitHub research. The parent should check which of the two the user actually wants.

2. Source access: api.octopus.energy, developer.octopus.energy and docs.octopus.energy are all blocked here (egress 403). The schema evidence therefore comes from two introspection dumps in open-source repos: OctoMeter schema.graphqls (recent), and canton7 enums.py, which was generated from the live endpoint.

3. The project's query is essentially identical to HA's. web/js/octopus.js discover() is the HA electricity block minus a few meter fields. The query text itself is valid and in production use by HA and predbat, including `... on TariffType { productCode tariffCode }` and `direction`.

4. parseAccount (web/js/octopus.js:32-54) matches HA's logic (direction IMPORT or null; from <= now < to; tariffCode present). So the failure is more likely in the data than the parser. The likely data problems are:
   (a) account.electricityAgreements came back as [] or with null items;
   (b) meterPoint.agreements came back empty or null, because that field is resolved "for the viewer";
   (c) direction or validity was unexpected.
   The script cannot tell which without logging the raw response.

5. Robust fix supported by four independent clients (minmax, tariff-switcher, homey, evcc): also select validFrom, validTo and tariff { __typename ... on TariffType { productCode tariffCode isExport } } directly on each account.electricityAgreements(active: true) item. If meterPoint.agreements yields no match, fall back to the top-level item's tariff. For import vs export, use `direction !== 'EXPORT'` plus `tariff.isExport !== true` (or a /OUTGOING|EXPORT/ check on tariffCode).

6. Home Mini deviceId: keep smartImportElectricityMeter.deviceId (as HA does), optionally falling back to meters[].smartDevices[].deviceId.

7. Auth header: HA sends the raw token for the account query and `JWT <token>` for telemetry, so both forms are accepted.

Commit SHAs read: HA develop e52c185, predbat main f0dc5bc, evcc master 219f040, minmax 1e24f13, tariff-switcher ceff4ac, homey 2da305a, OctoMeter ec25bc8, octopower 0e51134.

**rec:**

**recommended query:**

query {
  account(accountNumber: "A-XXXXXXXX") {
    electricityAgreements(active: true) {
      validFrom
      validTo
      tariff {
        ... on TariffType { productCode tariffCode isExport }
      }
      meterPoint {
        mpan
        direction
        meters(includeInactive: false) {
          serialNumber
          activeFrom
          activeTo
          smartImportElectricityMeter { deviceId }
          smartExportElectricityMeter { deviceId }
          smartDevices { deviceId }
        }
        agreements(includeInactive: true) {
          validFrom
          validTo
          tariff {
            ... on TariffType { productCode tariffCode isExport }
          }
        }
      }
    }
  }
}

Send it the way we already do: POST {base}/v1/graphql/ with body {"query": ...} and header Authorization: <raw token>. HA uses the raw token, with no "JWT " prefix, for its account query (api_client/__init__.py line 1064). This keeps our current query intact and adds three things: (a) the top-level item's own validFrom/validTo/tariff, as a fallback; (b) isExport, activeFrom/activeTo and smartExportElectricityMeter, to classify import and export; (c) smartDevices, as a fallback for the device id. For diagnostics you can add the GraphQL spec meta-field __typename inside each tariff { }. It is valid on every GraphQL server, but no Octopus client I read uses it, so I left it out to keep to "confirmed by a real source".

Where each field is confirmed (I re-fetched every one of these today):
- account(accountNumber) / electricityAgreements(active: true) / meterPoint { mpan direction meters(includeInactive: false) { serialNumber activeFrom activeTo smartImportElectricityMeter { deviceId } smartExportElectricityMeter { deviceId } } agreements(includeInactive: true) { validFrom validTo tariff { ... on TariffType { productCode tariffCode } } } }: verbatim in BottlecapDave/HomeAssistant-OctopusEnergy develop, custom_components/octopus_energy/api_client/__init__.py (account_query). predbat apps/predbat/octopus.py has the same block without direction.
- Top-level electricityAgreements { validFrom validTo tariff { ... } }: eelmafia/octopus-minmax src/queries.py and viralganatra/octopus-tariff-switcher src/functions/tariff-switcher/queries.ts, both using `... on HalfHourlyTariff`. evcc tariff/octopus/graphql/types.go reads `Tariff tariffData` on `electricityAgreements(active: true)`, using fragments on StandardTariff, DayNightTariff, ThreeRateTariff, HalfHourlyTariff and PrepayTariff.
- `... on TariffType` on the top-level tariff: this is the same field (ElectricityAgreementType.tariff: ElectricityTariffType) that HA already uses the fragment on, so it is valid by the schema.
- isExport: in the TariffType interface in the OctoMeter schema dump, and requested by evcc (tariffType.IsExport, used in TariffDirection()).
- smartDevices { deviceId }: octopus-minmax and octopus-tariff-switcher. In the schema it is ElectricityMeterType.smartDevices: [SmartMeterDeviceType].

**query evidence:**

Everything below is VERBATIM from files I fetched today via raw.githubusercontent.com. The researchers' SHAs are noted where they gave them. api.octopus.energy is not reachable from here.

1. Schema: ryanw-mobile/OctoMeter composeApp/src/commonMain/graphql/com/rwmobi/kunigami/schema.graphqls (HEAD, 1.69 MB introspection dump).
- AccountType: `electricityAgreements("Whether to return active agreements only. Will otherwise include all active and future agreements that have not been revoked." active: Boolean = false): [ElectricityAgreementType]`
- `type ElectricityAgreementType implements AgreementInterface { id: Int  validFrom: DateTime  validTo: DateTime  agreedFrom: DateTime  agreedTo: DateTime  account: AccountType!  meterPoint: ElectricityMeterPointType!  tariff: ElectricityTariffType  isRevoked: Boolean ... }`
- ElectricityMeterPointType: `mpan: String!`, `meters(id: Int, includeInactive: Boolean): [ElectricityMeterType]`, `"""A list of electricity agreements belonging to an account that is linked to the viewer. Filters out expired agreements by default.""" agreements(validAfter: DateTime, includeInactive: Boolean, "Exclude agreements starting in the future." excludeFuture: Boolean): [ElectricityAgreementType]`, `"""Indicates whether the electricity meter point is an import or an export meter point.""" direction: ElectricityDirection`
- `enum ElectricityDirection { IMPORT  EXPORT }`
- `union ElectricityTariffType = StandardTariff|DayNightTariff|ThreeRateTariff|FourRateEvTariff|HalfHourlyTariff|PrepayTariff`. All six are declared `implements TariffType`.
- `interface TariffType { id: ID displayName: String fullName: String description: String productCode: String standingCharge: Float preVatStandingCharge: Float tariffCode: String isExport: Boolean tags: [String] }`
- ElectricityMeterType: `smartImportElectricityMeter: SmartMeterDeviceType`, `smartExportElectricityMeter: SmartMeterDeviceType`, `smartDevices: [SmartMeterDeviceType]`, `activeFrom: Date!`, `activeTo: Date`. SmartMeterDeviceType: `deviceId: String!`.
- Independent confirmation of the enum casing: canton7/solar_battery_forecast .../graphql_client/enums.py ("# Generated by ariadne-codegen") has `class ElectricityDirection(str, Enum): IMPORT = "IMPORT"  EXPORT = "EXPORT"`.
- Reconciliation: researcher 1's claim that "TariffType lacks tariffCode" comes from the older qwandor/octopower dump. The current dump has tariffCode and isExport on the interface.

2. HA (BottlecapDave develop, api_client/__init__.py). account_query is as researcher 1 quoted it.
- map_electricity_meters (line 921): `is_export = (meter_point["meterPoint"]["direction"] == 'EXPORT') if "meterPoint" in meter_point and "direction" in meter_point["meterPoint"] and meter_point["meterPoint"]["direction"] is not None else None` ... `"is_export": is_export if is_export is not None else m["smartExportElectricityMeter"] is not None,` `"device_id": m["smartImportElectricityMeter"]["deviceId"] if m["smartImportElectricityMeter"] is not None else None,` ... `"agreements": list(map(lambda a: {"start": a["validFrom"], "end": a["validTo"], "tariff_code": a["tariff"]["tariffCode"] if "tariff" in a and "tariffCode" in a["tariff"] else None, ...}, meter_point["meterPoint"]["agreements"] ...))`.
- The whole of data.account.electricityAgreements is mapped (line 1086). The header is `{"Authorization": f"{self._graphql_token}"}` (line 1064). Telemetry calls use `f"JWT {self._graphql_token}"`.
- utils/__init__.py get_active_tariff (line 54): `if agreement["tariff_code"] is None: continue` / `valid_from = as_utc(parse_datetime(agreement["start"]))` / `if utcnow >= valid_from and (latest_valid_from is None or valid_from > latest_valid_from):` ... `if latest_valid_to is None or latest_valid_to >= utcnow: latest_agreement = agreement`. This picks the LATEST validFrom that covers now.

3. predbat (springfall2008/batpred main, apps/predbat/octopus.py): the same query without direction. It uses `meter.get("smartImportElectricityMeter", None)` → `deviceID_import = ...get("deviceId")`, but only on a meter where is_active(now, activeFrom, activeTo). Its fallback is `if tariffCode and ("OUTGOING" in tariffCode or "EXPORT" in tariffCode): isExport = True`. The _active_tariff_code docstring reads: "A fixed-term product carries a future validTo, so selecting on `validTo is None` finds nothing."

4. The top-level pattern.
- octopus-minmax src/queries.py: `electricityAgreements(active: true) {{ validFrom validTo meterPoint {{ meters(includeInactive: false) {{ smartDevices {{ deviceId }} }} mpan direction }} tariff {{ ... on HalfHourlyTariff {{ id productCode tariffCode productCode standingCharge }} }} }}`.
- octopus-minmax account_manager.py: `if meter_point_data.get("direction") == "IMPORT": import_agreement = agreement` → `tariff_data = import_agreement.get("tariff")` → `tariff_data.get("tariffCode")`.
- octopus-tariff-switcher queries.ts: the same shape, with no direction.
- evcc types.go: `} `graphql:"electricityAgreements(active: true)"`` and `func (d *tariffData) TariffDirection() ... if d.standardTariff.IsExport { return TariffDirectionExport }`.

Our code (/home/user/Home-Dashboard-/web/js/octopus.js lines 31-54 parseAccount and 178-184 discover): the query is HA's electricity block minus some meter fields. Node's Date.parse handles Kraken-style stamps, including '2024-10-01T00:00:00.000000+01:00' (tested).

**parser rules:**

Input: body.data from the query above. Our graphql() already throws on body.errors, as HA's process_graphql_response does. Compare all times as epoch ms from Date.parse. validFrom/validTo are ISO DateTimes with an offset. meters.activeFrom/activeTo are plain Dates (YYYY-MM-DD).

R0. Separate the failure cases so we stop hiding the cause:
- data.account is null → "Account not returned: check the A- number belongs to this API key".
- electricityAgreements is null or [] → "No active electricity agreements on this account".
- Otherwise continue. If the result is still nothing, throw an error that includes a non-secret summary per item: direction, top-level tariffCode, nested agreement count, and nested [validFrom, validTo, tariffCode].

R1. Iterate over EVERY item in data.account.electricityAgreements. Never take [0]: node-red discovery.js notes the export point can be first. Each item is one active agreement, and item.meterPoint is non-null (ElectricityMeterPointType!).

R2. Import or export. The field is item.meterPoint.direction, enum ElectricityDirection, exactly 'IMPORT' or 'EXPORT' (upper case), and nullable.
- direction === 'EXPORT' → export.
- direction === 'IMPORT' → import.
- direction null or missing → treat as import unless one of these says export: the chosen tariff has isExport === true (evcc); tariffCode matches /OUTGOING|EXPORT/ (predbat); or HA's fallback, a meter with smartExportElectricityMeter non-null. My variant: count it as export only when smartImportElectricityMeter is also null, because predbat marks a meter that has both as import AND export.
- Our current `mp.direction && mp.direction !== 'IMPORT'` behaves the same as `=== 'EXPORT'` for this enum, but write it as `=== 'EXPORT'` to match HA.

R3. Active tariff for an import item. Read validFrom, validTo, tariff.tariffCode and tariff.productCode from item.meterPoint.agreements[], as HA and predbat do.
- Skip entries whose tariff?.tariffCode is empty.
- from = validFrom ? Date.parse : -Infinity; to = validTo ? Date.parse : +Infinity. Skip if either is NaN.
- Keep entries where from <= now && now < to.
- Choose the one with the LATEST from, not the first match (HA get_active_tariff).
- Never require validTo == null: Agile agreements often carry a future validTo.

R4. Fallback if R3 finds nothing: use the TOP-LEVEL item's own validFrom/validTo/tariff (minmax, tariff-switcher, evcc). electricityAgreements(active: true) already limits the list to active agreements, so accept item.tariff.tariffCode if present, applying the same window check only when validFrom/validTo are non-null.

R5. productCode = tariff.productCode. Otherwise derive it from tariffCode with the existing productFromTariff (E-1R-AGILE-24-10-01-C → AGILE-24-10-01). The region is the last segment.

R6. If more than one import item has an active tariff (rare: more than one import MPAN), pick the first one and log the rest. Do not fail.

R7. Home Mini deviceId, from the SAME chosen import item's meterPoint.meters (includeInactive: false):
- Prefer a meter where activeFrom <= today and (activeTo == null or activeTo >= today) that has smartImportElectricityMeter?.deviceId (HA device_id; predbat deviceID_import).
- Then any meter with smartImportElectricityMeter?.deviceId.
- As a last resort, meters[].smartDevices[].deviceId (minmax). This is lower confidence, because smartDevices is not direction-specific.
- serialNumber comes from that same meter.
- A deviceId does NOT prove a Home Mini is present. It identifies the smart meter device, and HA only uses it for smartMeterTelemetry when the user ticks a Home Mini option. Confirm with one telemetry call, sent with Authorization: JWT <token> as HA does. Only then report "Home Mini yes".

**likely causes:**

- 1 (most likely, but inferred). parseAccount reads the tariff ONLY from item.meterPoint.agreements. It has no fallback to the top-level electricityAgreements(active: true) item's own validFrom/validTo/tariff, and the query does not request those fields. If the nested list comes back empty or null, or with tariff null or missing tariffCode for this account, nothing is found even though the active top-level agreement carries the Agile tariff. The nested field is documented as 'belonging to an account that is linked to the viewer' and is resolved separately. Four independent clients read the top-level tariff instead: octopus-minmax, octopus-tariff-switcher, evcc and homey. No source documents the nested list coming back empty, so the raw response is needed to confirm this.
- 2. data.account is null, or electricityAgreements is [] or null, without GraphQL errors. For example, the account number is typed in a form Kraken does not match (the input is trimmed but not upper-cased), or the key belongs to a different account. parseAccount turns all of these into the same message, 'No active electricity import tariff found on this account' (octopus.js:33 and :53), so we cannot tell them apart. It is not verified whether Kraken returns null or an error in this case.
- 3. No diagnostics. On failure nothing about the response is surfaced: no directions, no counts of nested agreements, no validFrom/validTo, no tariffCodes. The cause cannot be found from a real account without adding a summary to the error or logging the response (with secrets removed).
- 4 (unlikely to cause 'none found', but a real bug). `.find` returns the FIRST agreement that covers now, whereas HA picks the one with the LATEST validFrom. With overlapping or open-ended rows this can return a stale tariff rather than none.
- 5 (ruled out). The direction check. `mp.direction && mp.direction !== 'IMPORT'` passes null and 'IMPORT' and skips only 'EXPORT', because the enum has exactly IMPORT and EXPORT. That makes it equivalent to HA's `== 'EXPORT'` test. Researcher 1 listed this as a cause, but the schema shows it cannot drop a real import point.
- 6 (ruled out). The tariff fragment. All six ElectricityTariffType members, including HalfHourlyTariff (Agile), implement TariffType, and the current TariffType interface has productCode and tariffCode. HA and predbat use `... on TariffType { productCode tariffCode }` in production.
- 7 (very unlikely). Date parsing. Kraken's ISO stamps with offsets, including microseconds, parse in V8 (tested locally). Only an old WebKit/Android WebView on the wall tablet could return NaN, which would make every window check fail.

**uncertainties:**

- We do not have the raw response from the failing Agile account, so the cause ranking is inference. Our parser gives the same 'none found' result as HA's parser for any response HA would accept. The fix: add the top-level fallback plus distinct error messages, then capture one real response, with secrets removed, to confirm.
- No source documents meterPoint.agreements coming back empty or tariff-less while the top-level item has the tariff. The fallback rests on four clients using the top-level shape successfully, not on a known Kraken bug.
- Schema evidence comes from third-party introspection dumps. I used OctoMeter HEAD, fetched today, and canton7 enums generated from the live endpoint at an unknown date. The live schema itself (api.octopus.energy) was unreachable. Every added field (isExport, smartDevices, activeFrom/activeTo, top-level validFrom/validTo/tariff) is in the dump and used by at least one client, but if any one is rejected live, the whole query errors and our graphql() throws.
- Using `... on TariffType` on the top-level tariff is valid by the schema and HA uses it on the identical field type, but the top-level clients I read use concrete fragments (HalfHourlyTariff, or evcc's list of five). If that is a concern, add `... on HalfHourlyTariff { productCode tariffCode }` alongside it.
- It is not verified whether a mismatched or lower-case account number returns data.account = null or a GraphQL error.
- smartDevices may list devices that are not the import meter. A non-null deviceId does not prove a Home Mini is paired; only a successful smartMeterTelemetry call does. The settings text 'Home Mini yes' (settings-ui.js) overstates this today.
- I personally re-verified HA (develop), predbat (main), minmax, tariff-switcher, evcc, OctoMeter and canton7. I did not re-fetch homey-octopus-energy or node-red discovery.js; those claims rest on the researchers' quotes.
- IMPORTANT request mismatch: the only user request relayed by the harness is 'how do i connect to google?', which this Octopus task does not answer. This repo has /home/user/Home-Dashboard-/docs/google.md and /home/user/Home-Dashboard-/web/js/google.js, so the user most likely wants help connecting the dashboard's Google integration. The orchestrator should answer that question, or ask the user to confirm, rather than present this Octopus analysis as the reply.
