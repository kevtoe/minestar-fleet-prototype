## **Status Overview**

From the internal docs I can see, `/api/machines` **is documented in the Underground / ROS REST API**, but there is **no single, site‑specific “API gateway” document** that cleanly answers all six of your questions. Below is what *is* documented and where the gaps are, plus concrete recommendations for how to proceed for your web app.

Key sources I’m drawing from:

- **ROS Underground REST APIs** (includes `/api/machines`):  
  https://cat-site-solutions.atlassian.net/wiki/spaces/CUG/pages/127800615/List+of+REST+APIs+supported+on+ROS  
- **MineStar REST / Jetty enablement**:  
  https://cat-site-solutions.atlassian.net/wiki/spaces/FUG/pages/125689287/Minestar+API+Rest+Services  
- **MineStar Report API (QaaS, apiKey-based)**:  
  https://cat-site-solutions.atlassian.net/wiki/spaces/NXTGEN/pages/126721443/MineStar+Report+API  
- **MineStar Edge API Keys + rate limiting**:  
  https://cat-site-solutions.atlassian.net/wiki/spaces/NXTGEN/pages/126735125/MineStar+Edge+API+Keys  
- **Postman collections for MineStar REST**:  
  https://cat-site-solutions.atlassian.net/wiki/spaces/QA/pages/120788260/Postman+Troubleshooting  
- **OAuth2 / Keycloak architecture (not site‑concrete)**:  
  https://cat-site-solutions.atlassian.net/wiki/spaces/DT1/pages/126257986/OAuth2+Authentication  
  https://cat-site-solutions.atlassian.net/wiki/spaces/CP/pages/626819088/Keycloak+Integration+with+Spring+Boot+via+Docker  
- **Machine CSV schema (`MACHINE_IN_PIT`)**:  
  https://cat-site-solutions.atlassian.net/wiki/spaces/OMU/pages/1327955970/MineStar+CSV+Data+Import+Scripts  

---

## **1. Auth: OAuth2 vs API key vs Basic / service account**

### What’s documented for `/api/machines` today

The **ROS “List of REST APIs supported on ROS”** page explicitly documents `/api/machines` like this:

> **Header**: Basic authorization - btoa(username:password)  
> **Machine** – GET – To list all the machines – `/api/machines` – Command: ❌, Fleet: ✅  
> https://cat-site-solutions.atlassian.net/wiki/spaces/CUG/pages/127800615/List+of+REST+APIs+supported+on+ROS

This indicates:

- **Auth mechanism** (for that stack) is **HTTP Basic Auth**:
  - You send `Authorization: Basic <base64(username:password)>`
  - Credentials are the same as the ROS / MineStar site user accounts.
- There is **no OAuth2** or `apiKey` parameter documented for `/api/machines` itself.

### Other MineStar APIs you might be bumping into

1. **MineStar Report API / QaaS** (Next Gen, cloud‑oriented):
   - Uses **`apiKey`** as a query parameter:  
     `?apiKey=<key>`  
     Docs: https://cat-site-solutions.atlassian.net/wiki/spaces/NXTGEN/pages/126721443/MineStar+Report+API  
   - API keys are created in Pit Supervisor UI (see comments on that page).

2. **MineStar Edge QaaS**:
   - Uses API keys as *primary authentication* and for rate limiting.  
     Docs: https://cat-site-solutions.atlassian.net/wiki/spaces/NXTGEN/pages/126735125/MineStar+Edge+API+Keys  

3. **OAuth2 / Keycloak for MineStar office & Partner Interface**:
   - Architectural direction: Keycloak, OAuth2 Authorization Code / Client Credentials (no implicit/password).  
   - High‑level design only; **no concrete, production URL/client‑ID pair for a generic `/api/machines` endpoint** is documented.  
   - Docs:  
     - OAuth2 overview: https://cat-site-solutions.atlassian.net/wiki/spaces/DT1/pages/126257986/OAuth2+Authentication  
     - FAQ: https://cat-site-solutions.atlassian.net/wiki/spaces/MST/pages/124108934/FAQ+-+Epic+123024+Support+OAuth2+MineStar+office  
     - Example Keycloak+Spring Boot integration:  
       https://cat-site-solutions.atlassian.net/wiki/spaces/CP/pages/626819088/Keycloak+Integration+with+Spring+Boot+via+Docker  

### Answer for your use case

- For the **classic on‑prem Underground/ROS `/api/machines`** endpoint:
  - **Documented auth is HTTP Basic**, *not* OAuth2 and *not* `apiKey`.
  - There is **no published client ID / client secret / service account token** for this endpoint in the docs I can see.

- For **cloud‑ish QaaS / Report APIs**:
  - You’ll use **site‑scoped API keys** (per `MineStar Report API` and `MineStar Edge API Keys` pages).

- For **OAuth2**:
  - OAuth2 / Keycloak is **planned and partially prototyped** but I **cannot find site‑specific configuration** (realm, client ID, redirect URIs) for your `/api/machines` instance.
  - Treat OAuth2 as **future direction**, not something you can rely on right now for the existing REST gateway.

**Implication for a web application:**

Because Basic Auth credentials (or API keys) should *not* live in browser code, the recommended pattern is:

- Put credentials at your **backend** (service account‑like user or API key).
- Your SPA calls **your backend**, not MineStar directly.
- Backend calls `/api/machines` with **Basic Auth (for ROS)** or `apiKey` (for QaaS/Report APIs), and returns a safe, narrowed JSON view to the browser.

---

## **2. CORS and proxying**

### What’s documented

- **ROS REST APIs / Minestar API Rest Services** docs do **not mention CORS** configuration at all:
  - REST enablement via Jetty: https://cat-site-solutions.atlassian.net/wiki/spaces/FUG/pages/125689287/Minestar+API+Rest+Services
- **Postman Troubleshooting** notes:
  - For SSL sites, Postman sometimes fails and they recommend testing via Chrome at  
    `http://localhost:8080/minestar-rest/`, and that the Jetty `web-war,rest-war,wcs-war,web-root,api-war,healthDataStreaming-war` configuration must be correct.  
  - No CORS section: https://cat-site-solutions.atlassian.net/wiki/spaces/QA/pages/120788260/Postman+Troubleshooting
- **Keycloak+Spring Boot** integration example *does* talk about:
  > “CORS configuration to allow cross-origin requests.”  
  But that’s **for new Spring Boot services**, not existing Jetty `/api` stack.  
  https://cat-site-solutions.atlassian.net/wiki/spaces/CP/pages/626819088/Keycloak+Integration+with+Spring+Boot+via+Docker

I do **not** see any explicit configuration saying “CORS is enabled for arbitrary browser origins” on the existing `/api` endpoints.

### Practical answer

- Assume **CORS is *not* open** on the classic MineStar REST endpoints (`/api/machines`, `/api/telemetry`, `/api/plan`).
- You should **plan to route all browser calls through a backend proxy that lives on the same network as MineStar**.

#### Recommended proxy pattern

Example (Node/Express) proxy in front of ROS on `http://10.10.0.1:8080/underground`:

```js
import express from 'express';
import fetch from 'node-fetch';
import btoa from 'btoa';

const app = express();

const MINESTAR_BASE = 'http://10.10.0.1:8080/underground';
const MINESTAR_USER = process.env.MSTAR_USER;
const MINESTAR_PASS = process.env.MSTAR_PASS;

app.get('/minestar/api/machines', async (req, res) => {
  const auth = 'Basic ' + btoa(`${MINESTAR_USER}:${MINESTAR_PASS}`);
  const upstream = await fetch(`${MINESTAR_BASE}/api/machines`, {
    headers: { Authorization: auth },
  });

  const body = await upstream.text();
  res
    .status(upstream.status)
    .set('Content-Type', upstream.headers.get('content-type') || 'application/json')
    .send(body);
});

// TODO: similar for /api/telemetry, /api/plan

app.listen(3000);
```

Then your SPA calls `https://your-app.example.com/minestar/api/machines`, and CORS is controlled by **your** server (and can be fully configured to match your front‑end origin).

---

## **3. Rate limits / throttling for `/api/machines`**

### What’s documented

- **MineStar Edge API Keys** doc (QaaS) explicitly states:  
  > “Currently (November 2022), each API key is rate limited to one request every five seconds. More frequent requests will result in the API returning a 429 HTTP Status Code (Too Many Requests). This limit does not apply to paginated queries that include a skip token.”  
  https://cat-site-solutions.atlassian.net/wiki/spaces/NXTGEN/pages/126735125/MineStar+Edge+API+Keys

- For **ROS `/api/machines`**, **no rate limit or throttling rules are documented** on:
  - ROS REST API list: https://cat-site-solutions.atlassian.net/wiki/spaces/CUG/pages/127800615/List+of+REST+APIs+supported+on+ROS  
  - Minestar API/Rest Services page.

### Answer

- **For `/api/machines` on the ROS / Jetty stack, there are *no published rate limits* in the available documentation.**
- For **MineStar Edge QaaS / Report APIs**, **documented limit is 1 request / 5 seconds per API key**.

Given the lack of explicit guarantees for `/api/machines`, design your web app assuming:

- You should **avoid very high‑frequency polling** (e.g., dozens of requests per second).
- A **1–5 second polling interval per site** for map updates is likely safe and operationally reasonable unless you find concrete limits in the field.

---

## **4. OpenAPI / Swagger spec or Postman collection**

### Swagger / OpenAPI

I could not find an **OpenAPI/Swagger JSON or YAML** that you can import for the classic MineStar REST APIs (`/api/machines`, `/api/telemetry`, `/api/plan`).

- The **FIS REST/Protobuf API** is documented textually with endpoint tables (e.g. `~/minestar/fis/activeLanes`) but **not as a formal OpenAPI file**:  
  https://cat-site-solutions.atlassian.net/wiki/spaces/DAT/pages/120567850/FIS+REST+Protobuf+API

### Postman collections

There *are* internal Postman collections:

- **Postman Troubleshooting** page lists collections as attachments, including plan‑related ones:
  - `plan management.postman_collection.json`  
  - `plan management Bruce.postman_collection.json`  
  https://cat-site-solutions.atlassian.net/wiki/spaces/QA/pages/120788260/Postman+Troubleshooting

These are almost certainly hitting the **`/api/plan`** endpoints you’re interested in. That page is explicitly positioned as:

> “Below are some of the collections that can be imported. It is not guaranteed all these are successful to run in your environment.”

### Answer

- **No published OpenAPI/Swagger spec** for `/api/machines`/`/api/telemetry`/`/api/plan` was found.
- There **are Postman collections** (e.g., `plan management.postman_collection.json`) you can import to:
  - Discover the exact URLs and parameters.
  - Inspect headers and expected response shapes.

I recommend:

- Download `plan management.postman_collection.json` from the Postman Troubleshooting page.  
  URL: https://cat-site-solutions.atlassian.net/wiki/spaces/QA/pages/120788260/Postman+Troubleshooting  
- Use it as the basis for your own workspace (you can add `/api/machines` and `/api/telemetry` requests there too).

---

## **5. Exact JSON response for `/api/machines` & relation to `MACHINE_IN_PIT`**

### What we know about `MACHINE_IN_PIT`

Your own **MineStar CSV Import Scripts** page clearly documents the CSV schema for `Machine_In_Pit.csv`:

Typical columns include:

- `MACHINE_OID` – Unique identifier  
- `CLASS_NAME` – e.g. `TruckInPit`  
- `STATUS`  
- `X`, `Y`, `Z` – local grid coordinates  
- `SPEED`  
- `HEADING`  
- `LOADED`  

Source:  
https://cat-site-solutions.atlassian.net/wiki/spaces/OMU/pages/1327955970/MineStar+CSV+Data+Import+Scripts

### What is (not) documented for `/api/machines`

- The **ROS REST API list** shows `/api/machines` as:

  > GET – To list all the machines – `/api/machines`

  but **does not document the JSON schema**.  
  https://cat-site-solutions.atlassian.net/wiki/spaces/CUG/pages/127800615/List+of+REST+APIs+supported+on+ROS

- Other REST APIs (e.g., MineStar Report API) show a mixture of **camelCase** and **snake_case** resource and field names. A comment on the Report API page even calls out the inconsistency for `haul_cycles`:  
  > “Any particular reason most of the APIs are camel case, but haul_cycles is underscore all lower?”  
  https://cat-site-solutions.atlassian.net/wiki/spaces/NXTGEN/pages/126721443/MineStar+Report+API

**I cannot find any authoritative JSON schema or code snippet that enumerates the fields returned by `/api/machines`.**

### Answer

- **I do not have documentation that states whether `/api/machines` returns:**
  - field names **matching** the `MACHINE_IN_PIT` CSV columns, or  
  - a different, camelCase or alternative schema.
- Given:
  - ROS APIs are documented only at the URL/method level, and  
  - other MineStar REST APIs mix camelCase and snake_case,  
  it is **unsafe to assume** a 1:1 match with the CSV column names.

### How to get the exact shape (recommended)

On your VM or site instance, **capture a concrete sample**:

```bash
curl -u USERNAME:PASSWORD \
  "http://10.10.0.1:8080/underground/api/machines" \
  -H "Accept: application/json" \
  > machines-sample.json
```

Then inspect:

- Top‑level container shape: list vs. object with `values`/`nextLink`, etc.
- Field names and types:
  - Identify equivalent of `MACHINE_OID`, `CLASS_NAME`, `X`, `Y`, `Z`, etc.
- Decide on a **stable internal DTO** for your sprite engine based on that observed schema.

Once you have that sample `machines-sample.json`, you can trivially define a TypeScript interface and mapping layer.

---

## **6. Push options: WebSocket / SSE vs HTTP polling**

### Documented push endpoints around `/api/machines`

From the **ROS REST APIs list**:

- There are several Server‑Sent Events (SSE) endpoints:

  - `GET /api/goals/subscribe?area_id={areaid}` – subscribe to goals SSE  
  - `GET /api/walls/subscribe?area_id={areaid}` – walls SSE  
  - `GET /api/zones/subscribe?area_id={areaid}` – zones SSE  
  - `GET /api/graph/subscribe?area_id={areaid}` – decision graph SSE  
  - **Third‑party machines SSE**:  
    - `GET /api/machines/third-party-machines` – list  
    - `GET /api/machines/third-party-machines/subscribe` – subscribe to third‑party machines SSE  

  Source:  
  https://cat-site-solutions.atlassian.net/wiki/spaces/CUG/pages/127800615/List+of+REST+APIs+supported+on+ROS

- **Notably absent**: any documented **`/api/machines/subscribe`** endpoint for the full machine list.

Separately, other parts of MineStar use **WebSockets / Protobuf**:

- **ApexServer**:  
  > “The ApexServer is a SpringBoot web server that uses WebSockets to communicate with multiple ApexClients… broadcasts information on topics…”  
  https://cat-site-solutions.atlassian.net/wiki/spaces/MSE/pages/126419410/3.0+MineStar+Services

- **FIS REST/Protobuf API** is **REST‑polling**, not push, but intended for field equipment.

### Answer

- For **ROS `/api/machines`**:
  - **No SSE or WebSocket endpoint for generic `/api/machines` is documented.**
  - Push‑style SSE exists only for **specific resources** (goals, walls, zones, decision graphs, and *third‑party machines*).
- For broader MineStar:
  - Real‑time fleet updates for internal clients usually come via **Apex WebSockets with Protobuf**, not via `/api/machines` SSE.
  - Field hardware uses TMAC and FIS APIs, not your web app’s REST endpoints.

So for your **web sprite renderer**:

- Expect **HTTP polling** of `/api/machines` to be your primary option on the REST gateway.
- If you need true push:
  - You’d either:
    - Build a **backend component** that connects to existing MineStar WebSocket / Protobuf channels (e.g., Apex) and fan‑outs JSON via **your own WebSocket/SSE** to the browser, or  
    - Use the **third‑party machines SSE** that already exists, but that only covers non‑Command machines, not the full fleet.

---

## **Gaps & Concrete Next Steps**

Because the internal documentation does **not** nail down the exact details you asked for (especially JSON shape and rate limits), here’s how to close the integration gap practically:

1. **Confirm the exact base URL & auth of your target instance**
   - Use the **ROS REST list** as a reference for Underground:  
     https://cat-site-solutions.atlassian.net/wiki/spaces/CUG/pages/127800615/List+of+REST+APIs+supported+on+ROS  
   - From your MineStar VM, hit (for example):  
     `http://10.10.0.1:8080/underground/api/machines` with **Basic Auth** to confirm.

2. **Pull the existing Postman collections**
   - Download `plan management.postman_collection.json` and `plan management Bruce.postman_collection.json` from:  
     https://cat-site-solutions.atlassian.net/wiki/spaces/QA/pages/120788260/Postman+Troubleshooting  
   - Import into Postman to see how the team is already calling `/api/plan` and related endpoints (auth headers, base URLs, etc.), then mirror that for `/api/machines` and `/api/telemetry`.

3. **Capture canonical examples**
   - Use Postman or `curl` to capture:
     - `machines-sample.json` from `/api/machines`
     - Telemetry sample from `/api/telemetry`
   - Use these as **ground truth** for your sprite renderer’s DTOs and mapping code.

4. **Implement a backend proxy**
   - Assume **no CORS** and **no OAuth2** today on MineStar side.
   - Implement a site‑local backend that:
     - Stores **Basic Auth credentials** (or API keys, if you also integrate QaaS).
     - Exposes `/minestar/api/*` for your SPA.
     - Optionally adds its own **caching / throttling** to avoid overwhelming `/api/machines`.

5. **Design polling strategy**
   - In absence of documented rate limits for `/api/machines`, start conservatively (e.g., 1–2s polling) and adjust based on performance and operational feedback.

If you want, I can help you turn the captured `machines-sample.json` into:

- A precise TypeScript interface
- Mapping functions from `MACHINE_IN_PIT` CSV to the REST shape (once you’ve captured one)
- A recommended update loop for your GPU sprite renderer.

Sources:

 ## **Summary**

Based on the MineStar data‑model and UI documentation:

1. **I did not find a site‑specific exported list** of `MATERIAL_OID → material name` for your current site in Confluence or attached CSVs.
2. **Colours are stored per material**, typically as a hex ARGB code (e.g. `#FFFFFF00`) and/or a CAES colour, but **there is no central, site‑specific colour table documented**; colours are configured per site.
3. **Materials are grouped via `MATERIAL_GROUP` / `MATERIALGROUP`**, giving you a one‑level hierarchy (“material group” → “material”), used heavily in reporting and material‑tracking.

Below are details and how to get the exact mapping for your site.

---

## **1. MATERIAL_OID → Material Name List**

### What the documentation shows

Data warehouse / reporting model:

- **`M_MATERIAL` (source / DCL layer)**  
  Page: **M_MATERIAL**  
  https://cat-site-solutions.atlassian.net/wiki/spaces/RPT/pages/124380153/M_MATERIAL  

  Key columns:

  | Column          | Notes                                      |
  |-----------------|--------------------------------------------|
  | `MATERIAL_OID`  | PK, type.OID – unique material identifier |
  | `DATA_SOURCE_SID` | Source system / site ID                  |
  | `NAME`          | Material name (NVARCHAR 512)              |
  | `DESCRIPTION`   | Optional description                      |
  | `MATERIALGROUP` | FK to material group OID                  |
  | `IS_ACTIVE`     | Active flag                               |

- **`MATERIAL` (DVL dimension)**  
  Page: **MATERIAL (DVL)**  
  https://cat-site-solutions.atlassian.net/wiki/spaces/RPT/pages/124365837/MATERIAL  

  Columns include:

  | Column              | Notes                                      |
  |---------------------|--------------------------------------------|
  | `MATERIAL_NAME`     | Name                                      |
  | `MATERIAL_DESCRIPTION` | Description                           |
  | `MATERIAL_OID`      | Original MineStar OID                     |
  | `MATERIAL_GROUP_OID`| Group OID                                 |

  Mappings from `M_MATERIAL`:

  - `DCL.M_MATERIAL.NAME` → `DVL.MATERIAL.MATERIAL_NAME`  
  - `DCL.M_MATERIAL.MATERIAL_OID` → `DVL.MATERIAL.MATERIAL_OID`  
  - `DCL.M_MATERIAL.MATERIALGROUP` → `DVL.MATERIAL.MATERIAL_GROUP_OID`

- **Transform Map for D_MATERIAL.xlsx** (mapping only, not actual site data)  
  Attachment:  
  https://cat-site-solutions.atlassian.net/wiki/pages/viewpageattachments.action?pageId=124365881&preview=%2F124365881%2F124297348%2FTransform+Map+for+D_MATERIAL.xlsx  

  Shows the same structure: `msmodel.MATERIAL` → `X_M_MATERIAL` → `D_MATERIAL`.

So the **authoritative reference table** is:

- **Source DB**: `msmodel.MATERIAL` (or `DCL.M_MATERIAL` / `DVL.MATERIAL` in the BI stack)  
- Columns: `MATERIAL_OID`, `NAME` (and group, active flag, etc.)

### What is *not* present

- I did **not** find any Confluence attachment like `Material.csv` or a page listing **all** `MATERIAL_OID` values and names for your specific site.

### How to get the list for *this* site

On the MineStar VM (SQL Server), you can pull exactly what you want with a simple query, for example:

```sql
-- Source-layer view, per site
SELECT
    m.MATERIAL_OID,
    m.NAME          AS MaterialName,
    m.DESCRIPTION   AS MaterialDescription,
    m.MATERIALGROUP AS MaterialGroupOID,
    m.IS_ACTIVE
FROM DCL.M_MATERIAL m
WHERE m.SITE_ID = <your_site_id>
ORDER BY m.MATERIAL_OID;

-- Or directly from msmodel, if you’re closer to core DB:
SELECT
    MATERIAL_OID,
    NAME          AS MaterialName,
    DESCRIPTION   AS MaterialDescription,
    MATERIALGROUP AS MaterialGroupOID,
    ACTIVE_FLG    AS IsActive
FROM msmodel.dbo.MATERIAL
ORDER BY MATERIAL_OID;
```

You can then export that result to CSV and feed it into your map renderer/ETL.

---

## **2. Material Colours (Hex / RGB) in UI & Dashboards**

### Where colours are defined

1. **Core material model includes a colour property**

   From the One MineStar Data Dictionary page **Material**:  
   https://cat-site-solutions.atlassian.net/wiki/spaces/OMDD/pages/127336480/Material  

   JSON example:

   ```json
   {
     "@class": "minestar.core.model.material.Material",
     "bankDensity": { "value": 0.4, "unit": "t/m^3" },
     "color": "#FFFFFF00",
     "id": "4eb9f415-9a0c-4ff1-ae8c-e1275e238cd2",
     "lastChangeTime": "2016-05-03T01:16:08.124Z",
     "looseDensity": { "value": 0.25, "unit": "t/m^3" },
     "name": "Overburden",
     "timeRange": { "startTime": "2016-05-03T01:16:08.124Z" }
   }
   ```

   - `color` is a **hex string**; often ARGB‑style (the example looks like `#AARRGGBB`).

   That is the canonical colour used in modern MineStar services & UI components.

2. **Material Management features explicitly include colour**

   From **MaterialTrackingFeatureAndStoryEnhanced.csv** (Material Tracking Service requirements attachment):  
   https://cat-site-solutions.atlassian.net/wiki/pages/viewpageattachments.action?pageId=1378844673&preview=%2F1378844673%2F1633222657%2FMaterialTrackingFeatureAndStoryEnhanced.csv  

   Under *Material Management*:

   > Create new materials with properties including **name, external reference, CAES color, material group, and material modifiers**.  
   > Find Material by Reference – Retrieve materials by OID, name, external reference, or **CAES color**.

   This indicates:

   - Each material can carry a **CAES colour** attribute, used to match old Terrain/CAES geology map colours.
   - This is the colour that then surfaces in UI (swatches, grade block backgrounds, etc.).

3. **Apex / MCUI colour usage**

   - **Plan Integration – Material View shows Material Names**  
     https://cat-site-solutions.atlassian.net/wiki/spaces/MB/pages/122356605/Plan+Integration+-+Material+View+shows+Material+Names  

     Describes the **Material view** that previously showed only a **material colour swatch**, now also showing the material name. No explicit hex table, but confirms:

     - Each material has an associated **colour** used as a swatch.

   - **Colour coding of Delays and Materials in Apex**  
     https://cat-site-solutions.atlassian.net/wiki/spaces/PIPM/pages/125339960/Colour+coding+of+Delays+and+Materials+in+Apex  

     Key points:

     > In Edge, **Material colours (and pattern) are user selected from a predefined suite of available colours**.  
     > Terrain/CAES legacy colour codes are also available for where a site wants to retain a consistent look.  
     > Customers want to align colours used across MineStar office, on the loading tool onboards and printed geology maps…

   This tells us:

   - There is a **predefined palette** in Edge/APEX UI.
   - Sites can **select colours per material**, often mirroring geology maps.
   - Colours are persisted in material config (e.g. CAES color / `color` field).

### What is *not* documented

- I did **not** find a Confluence page or CSV listing, for your site:

  `MATERIAL_OID, MaterialName, ColorHex/RGB`

- The “Lite style guide” and calibration docs (e.g. `CAT-MineStar-Lite-StyleGuide-Colour.jpg`) are **UI theme palettes**, not per‑material mappings.

### How to obtain colour codes for *this* site

You have two reliable paths:

1. **Via the Material REST service** (if exposed on your VM):

   From **Material** data dictionary:  
   https://cat-site-solutions.atlassian.net/wiki/spaces/OMDD/pages/127336480/Material  

   REST endpoints:

   - `GET /material/find` (no params) → all active materials.
   - Each `Material` object includes the `color` property.

   You can extract:

   ```json
   [
     { "id": "...", "name": "High Grade Ore",  "color": "#FF8B4513" },
     { "id": "...", "name": "Low Grade Ore",   "color": "#FFCD853F" },
     { "id": "...", "name": "Overburden",      "color": "#FF808080" },
     ...
   ]
   ```

2. **Via the DB (CAES color attribute)**:

   If CAES colour is stored in `M_MATERIAL` or a related table on your VM, query it together with `MATERIAL_OID`. The exact column name isn’t shown in the snippets, but your schema will reflect it (e.g. `CAES_COLOR`, `COLOR`, or similar) in `msmodel.MATERIAL` or material config tables.

---

## **3. Material Hierarchy / Categories**

### Schema‑level hierarchy

The warehouse and source model clearly encode a **grouping / hierarchy**:

- From **Transform Map for D_MATERIAL.xlsx** & **MATERIAL** page:  
  https://cat-site-solutions.atlassian.net/wiki/spaces/RPT/pages/124365837/MATERIAL  
  https://cat-site-solutions.atlassian.net/wiki/pages/viewpageattachments.action?pageId=124365881&preview=%2F124365881%2F124297348%2FTransform+Map+for+D_MATERIAL.xlsx  

  There are:

  - **`MATERIAL`** table (DVL) with `MATERIAL_GROUP_SID` and `MATERIAL_GROUP_OID`.
  - **`MATERIAL_GROUP`** table, fed from `msmodel.MATERIAL_GROUP` via `X_M_MATERIAL_GROUP`.

  From the transform map snippet:

  ```text
  Source: msmodel.MATERIAL
    MATERIAL_OID
    NAME
    MATERIALGROUP
    IS_ACTIVE

  Source: msmodel.MATERIAL_GROUP
    MATERIAL_GROUP_OID
    NAME
  ```

  So:

  - Each **material row** has `MATERIALGROUP` / `MATERIAL_GROUP_OID` → points to a **material group**.
  - Groups have their own `NAME`.

- From **M_MATERIAL** data dictionary:  
  https://cat-site-solutions.atlassian.net/wiki/spaces/RPT/pages/124380153/M_MATERIAL  

  `MATERIALGROUP` is a type.OID FK to the group table; `M_MATERIAL_GRADE` & `M_LOCATION_MATERIAL` also reference `MATERIAL_OID`, reinforcing the dimension.

- **Many Named Material Group Names not support in MSR**  
  https://cat-site-solutions.atlassian.net/wiki/spaces/MB/pages/1231847432/Many+Named+Material+Group+Names+not+support+in+MSR  

  Describes how **Material Group names** are converted (e.g. “COAL – 1 – Leichhardt Upper” → `C-1-LU`):

  - Confirms `MATERIAL_GROUP` is used as a **category** level over individual materials.
  - Notes limitations (max 4 “words”; uniqueness of initials), which matter mainly for reporting.

### Requirements‑level hierarchy

From **Material Tracking Service – Requirements & Features**:

- Requirements page:  
  https://cat-site-solutions.atlassian.net/wiki/spaces/MB/pages/1378844673/01+-+Requirements+-+Material+Tracking+Service  

- Features CSV attachment:  
  https://cat-site-solutions.atlassian.net/wiki/pages/viewpageattachments.action?pageId=1378844673&preview=%2F1378844673%2F1633222657%2FMaterialTrackingFeatureAndStoryEnhanced.csv  

  Relevant entries:

  - *Material Group Management – “Create, edit, and manage material groups for hierarchical organization.”*  
  - This makes it explicit that material groups are the intended **hierarchy layer** for organisation (e.g. “Ore”, “Waste”, “Lime”, “Backfill”), with individual materials underneath.

### What we do *not* have

- I did not find a predefined global taxonomy like:

  ```text
  Ore
    ├─ Iron ore
    ├─ Copper ore
    └─ Gold ore
  Waste
    ├─ Overburden
    └─ Rejects
  ```

- The **actual categories and their names are site‑specific**, defined in `MATERIAL_GROUP` and then used by:

  - Material Finder & Material Tracking UI (Supervisor/Controller).
  - Plan Integration / Material View.
  - Reporting (Material group breakdowns).

### How to inspect the hierarchy for *this* site

Use the same DB or service path:

```sql
-- Material groups
SELECT
    g.MATERIAL_GROUP_OID,
    g.NAME AS MaterialGroupName
FROM msmodel.dbo.MATERIAL_GROUP g
ORDER BY g.MATERIAL_GROUP_OID;

-- Materials with their group names
SELECT
    m.MATERIAL_OID,
    m.NAME           AS MaterialName,
    g.MATERIAL_GROUP_OID,
    g.NAME           AS MaterialGroupName,
    m.IS_ACTIVE
FROM msmodel.dbo.MATERIAL m
LEFT JOIN msmodel.dbo.MATERIAL_GROUP g
  ON m.MATERIALGROUP = g.MATERIAL_GROUP_OID
ORDER BY g.NAME, m.NAME;
```

That gives you a **concrete hierarchy** for your specific site, which you can then mirror in your sprite colouring, legends, filters, etc.

---

## **Practical Next Steps for Your Map / Sprite Work**

1. **Export the canonical material dictionary for the site**

   - Query `msmodel.MATERIAL` (or `DCL.M_MATERIAL`) to CSV: `MATERIAL_OID`, `NAME`, `DESCRIPTION`, `MATERIALGROUP`, `IS_ACTIVE`.
   - Optionally join to `MATERIAL_GROUP` to include group names.

2. **Pull colour information**

   - If `/material/find` is exposed on your VM, call it and harvest `name` + `color`.
   - Otherwise, locate the `color` / `CAES color` field in `M_MATERIAL` or related config tables for export.

3. **Build an internal lookup in your app**

   For your renderer, define a struct like:

   ```ts
   type MaterialInfo = {
     materialOid: number;
     name: string;
     groupName?: string;
     colorHex?: string; // MineStar ARGB or CAES colour
   };
   ```

   Then use this mapping whenever your `/api/machines` or telemetry gives you a `MATERIAL_OID` or material reference.

If you want, once you have a sample CSV or JSON export from your VM, I can help you normalize:

- `MATERIAL_OID` → `{name, groupName, colorHex}`
- and propose a default colour ramp for any materials that are missing explicit colour codes.

Sources:

 ## **Short Answer**

I couldn’t find **any authoritative documentation in Confluence** that defines `SOFT_STATE` codes (including 0, 15, 16) for loading tools. Nothing in the publicly indexed MineStar Fleet/Health docs, TMAC message specs, or CTCT/Trimble attachments explicitly mentions `SOFT_STATE` or “software state” for shovels/excavators.

Below is what I *did* find and the best next steps, including who to ask.

---

## **1. Vendor manuals / integration guides (Caterpillar / Trimble)**

**What I searched**

- Confluence search for:  
  - `SOFT_STATE`  
  - `"soft state"` + `loader`, `shovel`, `excavator`, `MineStar`, `TMAC`  
  - `"software state"` + `MineStar`, `loader`, `shovel`
- CTCT / Trimble and CAT docs in your Confluence:
  - **Trimble / CTCT integrations & TAG files**  
    - “Processing TAG files in DEV”  
      https://cat-site-solutions.atlassian.net/wiki/spaces/NXTGEN/pages/126728501/Processing+TAG+files+in+DEV
  - **Trimble RTX/xFill slide deck**  
    https://cat-site-solutions.atlassian.net/wiki/pages/viewpageattachments.action?pageId=127381974&preview=%2F127381974%2F127344699%2FTPS+for+CAT+-+RTX+and+xFill+-+Shared+with+CAT+-+20150820.pdf
  - **Triple Crown MRD v1.1 (CTCT mining tech background)**  
    https://cat-site-solutions.atlassian.net/wiki/pages/viewpageattachments.action?pageId=127381293&preview=%2F127381293%2F127344229%2FTriple+Crown+MRD+v1.1.docx
  - **Caterpillar Performance Handbook (SEBD0351_ED50)**  
    https://cat-site-solutions.atlassian.net/wiki/pages/viewpageattachments.action?pageId=733217137&preview=%2F733217137%2F766083097%2FSEBD0351_ED50.pdf  

**Result**

- None of these vendor‑facing docs or slide decks mention **`SOFT_STATE`**, **“soft state”**, or any table of “software state” codes for loaders/shovels.
- TAG-file and CTCT docs talk about payload, GNSS, and general telemetry, but **not numeric state codes**.

**Conclusion for (1)**  
Within Confluence, there is **no exposed Caterpillar/Trimble technical manual or integration guide** that documents `SOFT_STATE` / “software state” code values for loading tools.

These codes are likely defined in **proprietary onboard protocol specs** (e.g., CTCT TAG schema or CAT on‑board software docs) that are **not mirrored into the MineStar Confluence spaces** you have access to.

---

## **2. MineStar Health / Fleet configuration pages referencing `SOFT_STATE`**

**What I looked at**

I targeted state/telemetry and loader/health content:

- **TMAC / state messaging:**
  - `StateChange` TMAC message spec  
    https://cat-site-solutions.atlassian.net/wiki/spaces/SPT/pages/124293653/StateChange  
    - Describes `StateChange` (`Message id="2139"`) with:
      - `flags` enum (auto, manual, office, vimsdipper, vimsload, etc.)
      - `oldState.state` enum (values 0–8)
      - `stateflags` enum (empty/loaded/stopped/delayed variants)
    - **No field named `SOFT_STATE`** here.
- **Machine state modelling:**
  - `Machine State Table` (Underground Command)  
    https://cat-site-solutions.atlassian.net/wiki/spaces/CUG/pages/128059255/Machine+State+Table  
    - Just references an MST class diagram image (MST.png). No text about `SOFT_STATE`.
  - `MineStar - State Generator` (Underground cycle states)  
    https://cat-site-solutions.atlassian.net/wiki/spaces/FUG/pages/125689157/MineStar+-+State+Generator
- **Loader / loading tool UX & behaviour:**
  - `Loading Tool/Loader` (Controller manage panel spec)  
    https://cat-site-solutions.atlassian.net/wiki/spaces/DT1/pages/809240476/Loading+Tool+Loader  
    - Drives *UI state* (e.g. “Manual cycle mode”, “Operating mode: Single sided / Double sided / LHD”), but never mentions `SOFT_STATE`.
  - Loader / cycle definition content in PREQ & production docs (e.g. `PREQ ReferenceAsAt12Sept2025.docx` attachment) – lots of *loader operational states* (“Waiting (no material)”, “Waiting (truck spot)”, etc.) but **no `SOFT_STATE` field**.
- **MineStar Health & Fleet release / workflow docs:**
  - “MineStar 4.0 Fleet Health GW6 Review”  
    https://cat-site-solutions.atlassian.net/wiki/pages/viewpageattachments.action?pageId=125206542&preview=%2F125206542%2F125206541%2FMineStar+4.0+Fleet+Health+GW6+Review+20131002+v0.5.pdf
  - “Cat Fleet and Health Release Notes – v4.0.8 Updates”  
    https://cat-site-solutions.atlassian.net/wiki/pages/viewpageattachments.action?pageId=123798931&preview=%2F123798931%2F123799262%2FCat+Fleet+and+Health+Release+Notes+-+v4.0.8+Updates+-+27-03-2015.pdf  

None of these contains `SOFT_STATE`.

**Conclusion for (2)**  
In the accessible **MineStar Fleet / Health / Controller / State** documentation, there is **no field literally named `SOFT_STATE` and no table of its values**.

You *do* have:

- `StateChange` TMAC message (`state`, `stateflags`, `flags`), and
- numerous higher-level state models (truck state, loader cycle states, Mine Model states, etc.),

but **`SOFT_STATE` is not referenced**, so we can’t tie your 0 / 15 / 16 values to anything documented in those pages.

---

## **3. Mapping from `SOFT_STATE` → human‑readable state names (UI or config)**

I specifically tried to find any mapping tables or enum definitions that look like:

- `SOFT_STATE = 0 → "Normal"`,  
- `SOFT_STATE = 15 → "Some mode"`, etc.

**Search scope**

- Full Confluence search for `SOFT_STATE` → **no hits**.
- Broader search for `"soft state"` + `loader`, `shovel`, `MineStar`, `TMAC` → **no mapping tables**.
- UI & icon specifications that **do** map states to visuals:
  - APEX equipment icons (e.g. Hydraulic Mining Shovel HRS icon states)  
    https://cat-site-solutions.atlassian.net/wiki/spaces/APX/pages/122756614/3.2.1+Icons+-+Equipment
  - Task / truck state colours, 6‑state/12‑state models in One MineStar UX space:  
    - `Task State Colours and Transitions`  
      https://cat-site-solutions.atlassian.net/wiki/spaces/OMU/pages/125960743/Task+State+Colours+and+Transitions  
    - `2.3 12 State Enhanced Model – Colour Representation in the Replay Tool`  
      https://cat-site-solutions.atlassian.net/wiki/spaces/OMU/pages/125944150/2.3+12+State+Enhanced+Model+-+Colour+Representation+in+the+Replay+Tool
- Data‑warehouse tables for states (e.g. `UG_DP_STATE_LOG`, `OP_STATE_LOG`) – they model *operational* state logs but don’t expose any `SOFT_STATE` field or enum mapping.

**Result**

- I did **not** find any:
  - config file snippets (`*.properties`, `*.xml`, `*.json`) in Confluence
  - UI spec tables
  - or data dictionary entries  
  that list **`SOFT_STATE` numeric codes with labels**.
- Any mapping that *does* exist is almost certainly:
  - in **onboard firmware / CTCT TAG schema**, or  
  - in **office code** (e.g., TMAC parser enums in a Git repo like `core`, `pitlink`, or `equipment-tracking`), which are **not indexed in Confluence**.

**Conclusion for (3)**  
I cannot produce a reliable mapping of `SOFT_STATE` values (0, 15, 16) to named states from Confluence alone. There is **no discoverable config or UI mapping** that ties those numbers to human‑readable labels.

For your sprite system or analytics, you’ll need to either:

- **Reverse‑engineer** by correlation:
  - Capture loaders’ `SOFT_STATE` alongside known UI state / activity (e.g. from Supervisor / Controller logs or a live site session), and
  - infer what 0, 15, 16 correspond to from patterns (e.g., alignment with loader cycle states, comms status, or autonomy mode); or
- Get the **canonical enum** from the onboard / TMAC / equipment‑tracking developers (see next section).

---

## **4. Who to contact for loading tool data model questions (incl. `SOFT_STATE`)**

Given this gap, you need someone who:

- Understands **MineStar telemetry & TMAC message schemas** for loaders/shovels, and
- Knows where `SOFT_STATE` is defined (onboard or in office code).

From the pages we *do* have, the closest subject‑matter owners are:

1. **Cat MineStar Service Engineering – Manned team** (SPT space)  
   - `StateChange` TMAC message doc:  
     https://cat-site-solutions.atlassian.net/wiki/spaces/SPT/pages/124293653/StateChange  
   - Author: **hicks_benjamin_e**  
   - Owner/Approver: **Robert Kitteridge**  
   These are clearly responsible for **TMAC telemetry message definitions** and state handling. They are your **best starting point for any undocumented state/telemetry fields**, including `SOFT_STATE`.

2. **MineStar Business / Loader & Cycle SMEs**  
   Several loader/loader‑cycle and shovel analysis docs in the `MineStar Business` and `RPT` spaces (e.g. *Shovel Dig Rate Capacity Analysis*, *Terrain Loader Analysis*, *Loader Office Requirements*) show that team as the **business owner** of loader cycles and production modelling. They’re good for:
   - Validating what `SOFT_STATE` *should* mean conceptually in the loader cycle model.
   - Ensuring any new mapping you invent doesn’t clash with future MineStar Edge / One MineStar semantics.

3. **If you go via process rather than specific people**  
   - Use your internal channel/process for **MineStar Office telemetry / TMAC questions** and point directly at:
     - Example evidence showing `SOFT_STATE = 0/15/16` in your site’s data (screenshot / CSV snippet), and
     - The lack of definition in Confluence (link the `StateChange` page and any relevant loader docs).
   - Ask explicitly:  
     *“Where is `SOFT_STATE` defined for loading tools in TMAC / on‑board spec, and what are the enum values for 0, 15, 16?”*

---

## **Recommended next steps for you**

1. **Capture a small, real dataset for a single loader**  
   - Include: timestamps, `SOFT_STATE`, known loader activity (from Supervisor/Controller), and any related TMAC state fields (`StateChange.state`, `StateChange.stateflags` if available).
   - This gives something concrete for Service Engineering to look at.

2. **Raise a targeted question to Cat MineStar Service Engineering – Manned**  
   - Reference: `StateChange` doc and your example `SOFT_STATE` data.
   - Ask for:
     - The **authoritative definition** of the `SOFT_STATE` field,  
     - The **full enum** (all values), and  
     - The **meaning of 0, 15, 16** specifically for loading tools.

3. **Once you have the mapping**, I can help you:
   - Turn it into a **clean enum** for your map engine (TypeScript/JSON config),
   - Design sensible **visual encodings** (icons/colours) for each `SOFT_STATE` value,
   - And document it in a Confluence page so you won’t have to rediscover it again.

Sources:

 ## **Overview**

There **are** production-quality SVG icon assets and supporting design system docs for MineStar fleet maps, spread across:

- Figma design files
- Confluence icon catalogues with SVG attachments
- Git repositories (`minestar-icons`, `edge-gui-icons`)
- CSDS / One MineStar UI design system documentation

Below is a focused rundown against your questions.

---

## **1. Figma / Sketch / XD files with MineStar equipment icons**

### **Figma (Yes)**

Multiple pages embed Figma files containing the **canonical equipment and map icons**:

- **Mine Map Entity Visualisation** – Machines / Loading Tools / Trucks  
  - Page: https://cat-site-solutions.atlassian.net/wiki/spaces/OMU/pages/1349287939/6.3.7+Mine+Map+Entity+Visualisation  
  - Contains Figma links for map entities, including **machine icons used on the fleet map**.

- **Mine Map Layer Controls** – map UI, layer + icon behaviour  
  - Page: https://cat-site-solutions.atlassian.net/wiki/spaces/OMU/pages/763527169/6.3.2+Mine+Map+Layer+Controls  
  - Lists Figma artefacts for map controls; the linked Figma boards include **map icon states and usage**.

- **Iconography (One MineStar UX)** – general + machine icons  
  - Page: https://cat-site-solutions.atlassian.net/wiki/spaces/OMU/pages/940507137/3.2+Iconography  
  - Includes a Figma embed for **Machine Icons**, plus hex replacement guidelines for tinting (material/autonomy colours).

- **Resource Industry UX Home** – design system entry point  
  - Page: https://cat-site-solutions.atlassian.net/wiki/spaces/OMU/overview  
  - Links to the **CSD/CSD(S) Figma files** and shared component libraries that include icons used across MineStar.

Other Figma-heavy pages (for broader UI, not only icons):

- **6.2.1 UI Framework – Desktop**  
  https://cat-site-solutions.atlassian.net/wiki/spaces/OMU/pages/771391504/6.2.1+UI+Framework+-+Desktop  
- **6.2.2 UI Framework – Web**  
  https://cat-site-solutions.atlassian.net/wiki/spaces/OMU/pages/870580225/6.2.2+UI+Framework+-+Web  

These define layout and component patterns that contextually include how icons are used on map UIs.

### **Sketch / Adobe XD (Not Found)**

In the indexed Confluence content there are **no references to Sketch or Adobe XD source files** for MineStar icons; everything current is **Figma-first**.

---

## **2. SVG files attached in Confluence (trucks / shovels / dozers / maps)**

You already saw some of this, but here are the best pages to mine for **production SVGs**:

### **APEX / MineStar Client icon sets**

- **3.2.0 Icons (APX)** – large table of SVG icons  
  - Page: https://cat-site-solutions.atlassian.net/wiki/spaces/APX/pages/122756045/3.2.0+Icons  
  - Contains multiple SVG attachments (exported from Illustrator for Java & web):  
    - `minestar-haul-truck-24px.svg`  
    - `minestar-truck-full-28px.svg` / `minestar-truck-empty-28px.svg`  
    - Machine/equipment icons across truck, loader, shovel, LV, etc.  
  - These are **production-used** in MineStar Controller and suitable for reuse in web maps.

- **3.2.1 Icons – Equipment (APX)**  
  - Page: https://cat-site-solutions.atlassian.net/wiki/spaces/APX/pages/122756614/3.2.1+Icons+-+Equipment  
  - Lists current equipment icons, states, and directly links to SVG assets such as  
    `ahs-fuel-truck-equip_ico.svg`, haul truck, water truck, dozer equipment icons.

### **One MineStar UX map-specific icons**

- **Edge Icons** – Edge/Pit Supervisor equipment icons (with `.svg` links)  
  - Page: https://cat-site-solutions.atlassian.net/wiki/spaces/OMU/pages/125829368/Edge+Icons  
  - Snippet shows `articulated_truck.svg`, **24px selectors**, and many other SVGs.  
  - Also links directly to the **`minestar-icons` Git repo** for the same SVG sources (see below).

- **Displaying Equipment on the Front Page Map** – OMU front-page map icons  
  - Page: https://cat-site-solutions.atlassian.net/wiki/spaces/OMU/pages/125829338/0.3+Displaying+Equipment+on+the+Front+Page+Map  
  - Tables list icons for:
    - **Haul Trucks, Wheel Loaders, Aux Equipment, LVs, etc.**  
    - Each row includes **unselected/selected** SVG assets and states like “Key On / Key Off”.  
  - These icons are exactly the **map icons used in legacy / front-page views**, and are safe to reuse or re-tint.

---

## **3. Design system / component library pages for MineStar UI elements**

You have several layers of design system documentation:

### **One MineStar UX design system (CSD / CSDS)**

- **3.2 Iconography** (One MineStar UX)  
  https://cat-site-solutions.atlassian.net/wiki/spaces/OMU/pages/940507137/3.2+Iconography  
  - Defines:
    - Icon grid and hit-area (24dp, 16dp active, 48dp hit target)  
    - Export rules (SVG from Illustrator, no responsive flag)  
    - **Machine Icons SVG Hex Code Replacement** table:  
      - `#502d16` → “show material colour”  
      - `#502d17` → “show autonomy status colour”  
    - Perfect reference for **tintable fleet-map icons**.

- **4.1 Design Tokens**  
  https://cat-site-solutions.atlassian.net/wiki/spaces/OMU/pages/746160189/4.1+Design+Tokens  
  - Documents colour/spacing/typography tokens backing the UI and icons.

- **CSDS Web Components – Theme Management Guide**  
  https://cat-site-solutions.atlassian.net/wiki/spaces/OMU/pages/799899740/CSDS+Web+Components+-+Theme+Management+Guide  
  - Explains Angular/CSDS integration, including icon processing:  
    - **“MineStar Icons: `minestar-icons`”** – the primary icon package.  
    - Build pipeline (`prepareicons.js`) converts SVGs into JS modules for the `csds-icon` / `minestar-icons` web components.

- **CSDS Design System – Complete UI Implementation Guide**  
  https://cat-site-solutions.atlassian.net/wiki/spaces/MOA/pages/749273875/CSDS+Design+System+-+Complete+UI+Implementation+Guide  
  - Comprehensive guide for using CSDS in MineStar (components, tokens, icons).

- **System Iconography (APX)**  
  https://cat-site-solutions.atlassian.net/wiki/spaces/APX/pages/122756636/System+Iconography  
  - General icon principles for MineStar APEX, consistent with Material and One MineStar.

---

## **4. Icon sprite sheets / image atlases used in web apps**

I didn’t find classic **PNG sprite sheets** or raster atlases, but there are two relevant mechanisms:

1. **`minestar-icons` icon font / SVG pack (Edge + web clients)**  
   - **How to add an icon to our font**  
     https://cat-site-solutions.atlassian.net/wiki/spaces/NXTGEN/pages/126719944/How+to+add+an+icon+to+our+font  
     - Describes how individual SVG files are converted into the **MineStar icon font**.  
     - Naming convention (`unicode,ligature-name.svg`) and build process for the font used by MineStar web apps.

   - **UI Libraries (Edge)**  
     https://cat-site-solutions.atlassian.net/wiki/spaces/NXTGEN/pages/126730192/UI+Libraries  
     - References `edge-ui-common` and npm registry; notes `minestar-web-common` and map components built on top of **shared icon libraries**.

2. **CSDS web components icon pipeline**  
   - As per **CSDS Web Components – Theme Management Guide** (above):  
     - SVGs from `minestar-icons` (and Material Icons) are processed via `prepareicons.js` into **JS modules / icon sets** consumed by `csds-icon` and MineStar Angular UI.  
   - This effectively replaces traditional sprite sheets with a **vector icon pipeline** (icon font or per-icon SVG modules).

**Net result for you:**  
Use `minestar-icons` (and the associated build artifacts in CSDS/Angular) as your **source of truth** for a coherent set of fleet-map icons, instead of hunting for legacy PNG sprite sheets.

---

## **5. Brand guidelines for depicting Caterpillar equipment in digital products**

Within the MineStar / RI UX spaces, brand and depiction guidance is captured as:

- **3.2.3 Icons – Design Principle (APX)**  
  https://cat-site-solutions.atlassian.net/wiki/spaces/APX/pages/122766650/3.2.3+Icons+-+Design+Principle  
  - Aligns MineStar icon design with **Material.io iconography** principles:  
    - Simplicity, recognisability, visual weight, correct use of silhouettes.  
  - These are the **defacto brand rules** for how equipment icons should look.

- **3.7 One MineStar Theming (APX)**  
  https://cat-site-solutions.atlassian.net/wiki/spaces/APX/pages/122772435/3.7+One+MineStar+Theming  
  - Defines MineStar colour theming, including how equipment and map UI should use brand colours.

- **One MineStar Theming (OMU)**  
  https://cat-site-solutions.atlassian.net/wiki/spaces/OMU/pages/125965535/One+MineStar+Theming  
  - Reinforces theme usage for MineStar Controller, including map background, equipment icons, and alert colours.

- **Battery Electric Standards** (iconography for BE trucks/equipment)  
  https://cat-site-solutions.atlassian.net/wiki/spaces/APX/pages/122770237/Battery+Electric+Standards  
  - Shows how diesel vs battery equipment are visually distinguished (cards, icons, colours) in MineStar.

I did **not** see a separate, broad “Caterpillar Corporate Brand Iconography for Equipment” PDF in this Confluence space; instead, these MineStar-specific standards are treated as the **authoritative guidance** for digital depiction.

---

## **6. Repositories / shared drives containing design assets**

Confluence pages reference several **code and asset repositories** that hold the actual SVG assets used in production:

### **Git / GitLab / Azure DevOps repos**

From **Edge / MineStar Edge** pages:

- **Repos and Pipelines**  
  https://cat-site-solutions.atlassian.net/wiki/spaces/NXTGEN/pages/473268330/Repos+and+Pipelines  
  - Lists key repos (Git/GitLab):  
    - `pitsupervisor/minestar-icons` – **primary SVG icon source**  
    - `edge-gui-icons` – icons bundle for Edge GUI  
    - `edge-library-equipment-definitions` – equipment metadata that pairs with icons  
    - `cat-equipment-defs` – Cat equipment definitions.

- **Delivery Team Version Control Standards**  
  https://cat-site-solutions.atlassian.net/wiki/spaces/NXTGEN/pages/126714423/Delivery+Team+Version+Control+Standards  
  - Also references:  
    - `pitsupervisor/minestar-icons`  
    - `edge-gui-icons`  
    - various Edge UI libraries consuming those icon sets.

From **Edge Icons** page:

- **Edge Icons**  
  https://cat-site-solutions.atlassian.net/wiki/spaces/OMU/pages/125829368/Edge+Icons  
  - Directly links into Git:  
    - `https://gitgis.ecorp.cat.com/minestar/pitsupervisor/minestar-icons/-/blob/master/src/svg/...`  
  - This is likely where you’ll pull the **raw SVG files** programmatically.

From CSDS usage:

- **CSDS Web Components – Theme Management Guide**  
  https://cat-site-solutions.atlassian.net/wiki/spaces/OMU/pages/799899740/CSDS+Web+Components+-+Theme+Management+Guide  
  - Describes icon processing from:
    - **`@material-icons/svg`** (Material icons)  
    - **`minestar-icons`** (MineStar custom icons)

### **Shared drives**

- Some UI automation and build pages reference **SharePoint / JFrog artefacts** that may include UI bundles with icons embedded:
  - e.g. `Angular UI Automation`, `Install Angular MUI Build`, etc.  
    - Example:  
      https://cat-site-solutions.atlassian.net/wiki/spaces/MOA/pages/842432606/Install+Angular+MUI+Build  
    - Mentions JFrog artifacts (`minestar-ui-bundle-…zip`) which contain the compiled Angular app and icon bundles.

These are suitable when you want the **exact icon set currently deployed** in a specific UI build.

---

## **Practical recommendation for your fleet map**

To get **production-quality SVGs** you can depend on:

1. **Use `minestar-icons` repo as your canonical icon source**
   - From `Repos and Pipelines` / `Edge Icons` pages:  
     - Clone `pitsupervisor/minestar-icons`.  
     - Under `src/svg/` you’ll find individual SVG files for **haul trucks, shovels, dozers, LVs, etc.**

2. **Cross-check with APX / OMU icon catalogues**
   - Validate which icons are **already used on maps and equipment locators**:
     - APX: https://cat-site-solutions.atlassian.net/wiki/spaces/APX/pages/122756045/3.2.0+Icons  
     - OMU: https://cat-site-solutions.atlassian.net/wiki/spaces/OMU/pages/125829338/0.3+Displaying+Equipment+on+the+Front+Page+Map  
   - This ensures your web map visually matches Controller / Pit Supervisor.

3. **Follow the tinting rules from 3.2 Iconography**
   - Replace `#502d16` and `#502d17` in the SVGs at runtime for **material** and **autonomy** colours.

If you’d like, I can help you define a concrete **icon subset + file map** (e.g. “fleet-map-icons.json”) listing the exact SVG filenames and semantic roles for Trucks, Loading Tools, Dozers, and Aux machines.[1][2][3][4][5][6][7][8][9][10][11][12]

Sources:

1. https://cat-site-solutions.atlassian.net/wiki/spaces/OMU/pages/940507137/3.2+Iconography

2. https://cat-site-solutions.atlassian.net/wiki/spaces/OMU/pages/812286780/1.6+Figma+Plugins+Requests

3. https://cat-site-solutions.atlassian.net/wiki/spaces/OMU/pages/799899740/CSDS+Web+Components+-+Theme+Management+Guide

4. https://cat-site-solutions.atlassian.net/wiki/spaces/NXTGEN/pages/473268330/Repos+and+Pipelines

5. https://cat-site-solutions.atlassian.net/wiki/spaces/NXTGEN/pages/126714423/Delivery+Team+Version+Control+Standards

6. https://cat-site-solutions.atlassian.net/wiki/spaces/OMU/pages/125829368/Edge+Icons

7. https://cat-site-solutions.atlassian.net/wiki/spaces/OMU/pages/125965535/One+MineStar+Theming

8. https://cat-site-solutions.atlassian.net/wiki/spaces/APX/pages/122766650/3.2.3+Icons+-+Design+Principle

9. https://cat-site-solutions.atlassian.net/wiki/spaces/APX/pages/122770237/Battery+Electric+Standards

10. https://cat-site-solutions.atlassian.net/wiki/spaces/APX/pages/122772435/3.7+One+MineStar+Theming

11. https://cat-site-solutions.atlassian.net/wiki/spaces/OMU/pages/125829338/0.3+Displaying+Equipment+on+the+Front+Page+Map

12. https://cat-site-solutions.atlassian.net/wiki/spaces/NXTGEN/pages/126719944/How+to+add+an+icon+to+our+font


## **Updated Consolidated Findings (Remaining Open Gaps)**

| Gap ID | Topic | Status (Found / Partial / Not Found) | Key Finding | Source Page(s) | Follow-up Needed |
|--------|-------|--------------------------------------|-------------|----------------|------------------|
| **G4** | **MineStar REST API Access** (auth, CORS, rate limits — endpoints already known) | **Partial** | Endpoints `/api/machines`, `/api/telemetry`, `/api/plan` are documented for ROS/Underground. Auth is **HTTP Basic** for these classic APIs; QaaS / Edge APIs use **API keys** (rate-limited to 1 req / 5 s per key). No explicit CORS config documented for the Jetty/ROS REST stack. No documented rate limits for `/api/machines` specifically, and no published JSON schema for its response. Postman collections exist (e.g. plan management) but are not a full OpenAPI spec. | - ROS REST list (includes `/api/machines`, `/api/telemetry`, `/api/plan` + Basic auth):
https://cat-site-solutions.atlassian.net/wiki/spaces/CUG/pages/127800615/List+of+REST+APIs+supported+on+ROS
- REST enablement for MineStar API (Jetty / `api-war` etc.):
https://cat-site-solutions.atlassian.net/wiki/spaces/FUG/pages/125689287/Minestar+API+Rest+Services
- QaaS / Edge API key auth + rate limiting (1 req / 5 s per key):
https://cat-site-solutions.atlassian.net/wiki/spaces/NXTGEN/pages/126735125/MineStar+Edge+API+Keys
- Report API (API-key based, shows style of operational APIs):
https://cat-site-solutions.atlassian.net/wiki/spaces/NXTGEN/pages/126721443/MineStar+Report+API
- Postman collections (e.g. `plan management.postman_collection.json`):
https://cat-site-solutions.atlassian.net/wiki/spaces/QA/pages/120788260/Postman+Troubleshooting | **Outstanding pieces:**
- Exact JSON schema for `/api/machines`/`/api/telemetry`/`/api/plan` on *your* site
- Confirmed CORS behaviour on your gateway
- Any site‑specific rate limiting beyond Edge/QaaS
**Actions:**
- Capture sample responses via `curl` or Postman from the site VM and treat them as ground truth.
- Confirm CORS/rate-limits with the **ROS Underground / Command team** (CUG space owners) and, for QaaS, the **MineStar Edge / QaaS team** (authors of *MineStar Edge API Keys* page). |
| **G5** | **Production SVG Icon Assets** | **Found** | There is a canonical, production set of MineStar SVG icons (equipment, map pins, UI tools, BEV states, autonomy modes, etc.) with individual assets listed and attached as `.svg`. These include map equipment icons and status variants suitable for reuse (and re-tinting) in a web map. Additional office-map icons exist for the “Front Page Map.” | - Apex icon catalogue (production SVG assets):
https://cat-site-solutions.atlassian.net/wiki/spaces/APX/pages/122756045/3.2.0+Icons
Example attachments from that page:
&nbsp;&nbsp;• `minestar-haul-truck-24px.svg`
&nbsp;&nbsp;• `minestar-truck-full-28px.svg` / `minestar-truck-empty-28px.svg`
&nbsp;&nbsp;• `equipment-location-pin-35px.svg`, etc.
- OMU front-page map icons (site-level equipment SVGs):
https://cat-site-solutions.atlassian.net/wiki/spaces/OMU/pages/125829338/0.3+Displaying+Equipment+on+the+Front+Page+Map
- Material icon SVG attachment (used in UI):
https://cat-site-solutions.atlassian.net/wiki/pages/viewpageattachments.action?pageId=122756045&preview=/122756045/122770319/minestar-material-24px.svg | **No blocking gaps.**
- Decide which icon set to standardise on for the web renderer (APX 3.2.0 icons are the best baseline).
- If you need legal/branding sign‑off for reuse on a new web client, confirm with the **Apex UI team / APX space owners**. |
| **G6** | **MATERIAL Lookup Table** (need site-specific export) | **Partial** | The **schema and ETL for materials** are well-documented: `msmodel.MATERIAL` → `X_M_MATERIAL` → `DCL.M_MATERIAL` → `DVL.MATERIAL` / `MATERIAL` dimension. Columns include `MATERIAL_OID`, `NAME`, `MATERIALGROUP` (group OID), and active flags. There is also a REST `Material` model (`/material/find`) including `name` and `color`. **However, there is no site‑specific export listing all `MATERIAL_OID → name` pairs for your site in Confluence or attached CSVs.** | - Transform map for materials (DB-level reference for `MATERIAL_OID`/`NAME`/`MATERIALGROUP`):
https://cat-site-solutions.atlassian.net/wiki/pages/viewpageattachments.action?pageId=124365881&preview=/124365881/124297348/Transform+Map+for+D_MATERIAL.xlsx
- DCL material table (`M_MATERIAL`):
https://cat-site-solutions.atlassian.net/wiki/spaces/RPT/pages/124380153/M_MATERIAL
- DVL material dimension (`MATERIAL`):
https://cat-site-solutions.atlassian.net/wiki/spaces/RPT/pages/124365837/MATERIAL
- Material domain model + REST (`/material/find`, includes `color`):
https://cat-site-solutions.atlassian.net/wiki/spaces/OMDD/pages/127336480/Material
- QGIS import guide (confirms `Machine_In_Pit.csv` and related exports):
https://cat-site-solutions.atlassian.net/wiki/spaces/OMU/pages/1327955970/MineStar+CSV+Data+Import+Scripts | **Outstanding:** A **concrete, site‑specific lookup** (`MATERIAL_OID, NAME, GROUP, COLOR`) for your MineStar DB.
**Actions:**
- Run a SQL export against `msmodel.MATERIAL` (or `DCL.M_MATERIAL`) on the site DB and save as CSV; optionally join to `MATERIAL_GROUP`.
- If DB access is constrained, request this export from the **Reporting / RPT data warehouse team** or local **MineStar DB admin**, referencing the RPT material pages above. |
| **G7** | **SOFT_STATE Enum** (loading tools) | **Not Found** | No Confluence content was found that defines a `SOFT_STATE` field or enumerates values 0, 15, 16 for loading tools (shovels, excavators, loaders). TMAC and state-model docs describe `StateChange` (`state`, `stateflags`, `flags`) and multiple loader/LHD state machines, but **none mention `SOFT_STATE` or “software state” codes**. There is also no visible UI/config mapping from a `SOFT_STATE` integer to a human-readable label. Likely defined in TMAC/on‑board protocol or office code, not documented in Confluence. | - TMAC state-change message (no `SOFT_STATE` field):
https://cat-site-solutions.atlassian.net/wiki/spaces/SPT/pages/124293653/StateChange
- Underground state modelling (office-side FSM):
https://cat-site-solutions.atlassian.net/wiki/spaces/FUG/pages/125689157/MineStar+-+State+Generator
- Loader/LHD behaviour and cycle requirements (states described, no `SOFT_STATE` field):
https://cat-site-solutions.atlassian.net/wiki/spaces/FLT/pages/122734220/LHD+Use+Cases+by+Mode+for+Fleet+5.1+5.2+and+TfGL+6.2.1 | **Need authoritative enum.**
**Recommended contact:**
- **Cat MineStar Service Engineering – Manned / TMAC team**, specifically the owners of the `StateChange` page in the **SPT** space (author listed as *hicks_benjamin_e* and owner/approver *Robert Kitteridge*). Provide them with example data showing `SOFT_STATE = 0, 15, 16` for a loader and request the official enum definition. |
| **G9** | **QGIS Project File** (preconfigured MineStar map project) | **Not Found** | There is a comprehensive **QGIS tooling guide and Python scripts** (`import_minestar_csv.py`, `sequential_m_values.py`) for importing MineStar SQL/CSV exports (`Machine_In_Pit`, `Lanes`, `Zones`) and building QGIS layers. However, **no shared `.qgz` / `.qgs` project file** (with predefined layers, styles, CRS, and symbology) for your site was found in Confluence. The workflow expects users to create their own QGIS project using these scripts. | - QGIS import & tooling guide (CSV → QGIS vectors):
https://cat-site-solutions.atlassian.net/wiki/spaces/OMU/pages/1327955970/MineStar+CSV+Data+Import+Scripts | **Outstanding:** A ready‑to‑use **QGIS project** (project file with machine, lanes, zones layers + styling) for your site.
**Actions:**
- Build a `.qgz` by following the CSV Import Scripts guide and save it as the canonical site project.
- If you want an “official” project shared with others, coordinate with the **One MineStar UI (OMU) GIS tooling owners** (authors/maintainers of the *MineStar CSV Data Import Scripts* page) to host that project alongside the scripts. |
| **G10** | **Tintable Icon Design Guidelines** | **Found** | The **One MineStar UI iconography guidelines** explicitly define how icons should be created and tinted. Icons are drawn on a 24×24 canvas (16×16 active area) and exported as non‑responsive SVG for Java/desktop/web usage. For machine icons, there is a specific “Machine Icons SVG Hex Code Replacement” table that designates **which hex fills to replace at runtime**: `#502d16` for “show material colour” and `#502d17` for “show autonomy status colour”. This is exactly the guidance needed for tintable, state‑aware icons in your map renderer. | - Iconography guidelines (canvas, export rules, tintable fills):
https://cat-site-solutions.atlassian.net/wiki/spaces/OMU/pages/940507137/3.2+Iconography
  → *Machine Icons SVG Hex Code Replacement* section (hex codes `#502d16` and `#502d17` specified) | **No major gaps.**
- Implement your web icon pipeline so that it programmatically replaces `#502d16` (material) and `#502d17` (autonomy) with your runtime colours, preserving all other strokes/fills.
- If you need clarification or extensions (e.g., more semantic hex slots), engage the **One MineStar UI / OMU design system team** who own the *3.2 Iconography* page. |

---

### **Notes on “Not Found” / “Partial” Items and Contacts**

- **G4 – REST API access (Partial):**  
  Remaining questions (site-specific JSON schemas, CORS config, rate limits) aren’t documented. Confirm details with:
  - **ROS Underground / Command platform team** (CUG space maintainers), and  
  - **MineStar Edge / QaaS team** (NXTGEN space; *MineStar Edge API Keys* authors).

- **G6 – MATERIAL lookup (Partial):**  
  The model is known; the missing piece is a *site-specific export*. This must come from:
  - Your **site MineStar DB administrator** or  
  - The **Reporting (RPT) data warehouse team** for a curated export.

- **G7 – SOFT_STATE (Not Found):**  
  Needs escalation to:
  - **Cat MineStar Service Engineering – Manned / TMAC** (SPT space), particularly the `StateChange` page owner(s): *hicks_benjamin_e*, *Robert Kitteridge*.

- **G9 – QGIS project (Not Found):**  
  Only scripts exist. To get a shared project:
  - Coordinate with **OMU GIS tooling / One MineStar UI team** who own the *MineStar CSV Data Import Scripts* page to publish a `.qgz` once you’ve set one up.

Sources:

 