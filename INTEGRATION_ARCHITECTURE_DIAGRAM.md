# MineStar Sprite Rendering — Integration Architecture

> Generated 24 Feb 2026. Use a Mermaid renderer (VS Code preview, GitHub, Mermaid Live Editor) to view.

## Diagram 1 — End-to-End Data Flow

```mermaid
graph TB
    subgraph MINESTAR["MineStar Server (Site VM)"]
        ROS["ROS REST API<br/><b>GET /api/machines</b><br/>HTTP Basic Auth"]
        MATAPI["Material REST<br/><b>GET /material/find</b><br/>Returns name + ARGB colour"]
        DB[("MineStar DB<br/>msmodel.MATERIAL<br/>Machine telemetry")]
        ROS --- DB
        MATAPI --- DB
    end

    subgraph PROXY["Backend Proxy (Required)"]
        direction TB
        P["Node/Express Proxy<br/>── CORS not enabled on ROS ──<br/>Forwards auth headers"]
    end

    subgraph ICONS["Icon Assets"]
        REPO["pitsupervisor/<b>minestar-icons</b><br/>src/svg/ — canonical SVGs"]
        TINT["Sentinel Tinting<br/>#502d16 → material colour<br/>#502d17 → autonomy colour"]
        REPO --> TINT
    end

    subgraph PROTOTYPE["Sprite Renderer (Browser)"]
        POLL["PollingService<br/>5s interval<br/>fetch → reconcileFeatures()"]
        ATLAS["Sprite Atlas<br/>17 types × 3 load states<br/>48px cells on Canvas"]
        CRS["Projection<br/><b>EPSG:70007</b><br/>Transverse Mercator / WGS84"]
        STYLES["WebGL Flat Styles<br/>6 status colours<br/>3 LOD regimes"]
        MAP["OpenLayers Map<br/>WebGLVectorLayer<br/>500+ machines @ 60fps"]
        POLL --> MAP
        ATLAS --> MAP
        CRS --> MAP
        STYLES --> MAP
    end

    ROS -- "JSON (schema TBC)" --> P
    P -- "proxied response" --> POLL
    TINT -. "future: SVG → atlas pipeline" .-> ATLAS

    classDef resolved fill:#c8e6c9,stroke:#388e3c,color:#1b5e20
    classDef partial fill:#fff9c4,stroke:#f9a825,color:#e65100
    classDef open fill:#ffcdd2,stroke:#c62828,color:#b71c1c
    classDef default fill:#e3f2fd,stroke:#1565c0,color:#0d47a1

    class ROS resolved
    class MATAPI partial
    class P open
    class REPO resolved
    class TINT resolved
    class CRS resolved
    class POLL resolved
    class ATLAS resolved
    class STYLES resolved
    class MAP resolved
```

**Colour key:** 🟢 Green = confirmed/resolved | 🟡 Yellow = schema known, need site data | 🔴 Red = must be built

---

## Diagram 2 — Gap Status & Build Dependencies

```mermaid
graph LR
    subgraph RESOLVED["✅ Resolved (9 of 11)"]
        G1["G1 CRS<br/>EPSG:70007"]
        G2["G2 STATUS<br/>0–5 confirmed"]
        G3["G3 LOADSTATUS<br/>0–2 only"]
        G5["G5 SVG Icons<br/>minestar-icons repo"]
        G8["G8 Sub-types<br/>Dozer, Grader, etc."]
        G10["G10 Icon Guidelines<br/>sentinel tinting"]
        G13["G13 AIMS<br/>4 states confirmed"]
        G4["G4 REST API<br/>HTTP Basic, no CORS"]
        G9["G9 QGIS<br/>no .qgz exists"]
    end

    subgraph PARTIAL["⚠️ Action Needed (2)"]
        G6["G6 Materials<br/>Schema ✓ — need<br/>site VM export"]
        G7["G7 SOFT_STATE<br/>Not in Confluence<br/>Contact: SPT team"]
    end

    subgraph BUILD["🔨 To Build"]
        PROXY["Backend Proxy<br/>(CORS workaround)"]
        SVGPIPE["SVG → Atlas Pipeline<br/>(resvg + sharp)"]
        PROJ4["proj4js Integration<br/>(EPSG:70007 → OL)"]
    end

    G4 --> PROXY
    G5 --> SVGPIPE
    G10 --> SVGPIPE
    G1 --> PROJ4

    classDef resolved fill:#c8e6c9,stroke:#388e3c,color:#1b5e20
    classDef partial fill:#fff9c4,stroke:#f9a825,color:#e65100
    classDef build fill:#e1bee7,stroke:#7b1fa2,color:#4a148c

    class G1,G2,G3,G4,G5,G8,G9,G10,G13 resolved
    class G6,G7 partial
    class PROXY,SVGPIPE,PROJ4 build
```

**Arrows** show which resolved gaps feed into the three build items for Phase 2.
