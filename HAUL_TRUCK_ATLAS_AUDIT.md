# Haul Truck Atlas Audit

## Summary
The provided Figma nodes represent a 2D sprite atlas for the CAT MineStar haul trucks. The sprites are baked raster images displaying trucks facing to the right-hand side (East) with various autonomy states and physical postures. The objective of this atlas is to be served via an OpenLayers WebGL layer for a high-performance sprite rendering system.

## Atlas grid
- **Atlas purpose:** Provides the base raster art for rendering the different states of haul trucks in a top-down mining map view.
- **Estimated cell size:** Approximately **150×150 px** per truck cell.
- **Grid Layout:** Contiguous matrix structure. The exact column/row counts vary with the provided layouts, but align to a uniform grid. 
- **Padding:** Cells appear contiguous or mathematically evenly spaced. A uniform stride (e.g., 150px) should be used.
- **Centering:** The truck geometry itself is not perfectly dead-center pixel-wise but is visually anchored roughly at the centre-of-mass/rotation pivot for the truck.

## Columns
The columns define the **Autonomy / Connection Status** of the equipment. Based on standard MineStar conventions and the visual dots provided on the canopy, the columns correspond exactly to:
1. **Unknown** (Grey / Offline)
2. **Manual** (Blue / Driven)
3. **Autonomous** (Green / Auto Run)
4. **AStop / Paused** (Red / Auto Stopped)

## Rows
The rows describe the **Physical Posture and State** of the haul truck. Reading from top to bottom, the states represent combinations of bed position, material load, and selection state:
1. **Target Hidden / Base — Default**
2. **Target Hidden / Base — Selected** (features an outline highlight)
3. **Travelling Empty / Bed Down — Default**
4. **Travelling Empty / Bed Down — Selected**
5. **Travelling Full / Bed Down — Default**
6. **Travelling Full / Bed Down — Selected**
7. **Dumping / Bed Up — Default**
8. **Dumping / Bed Up — Selected**

*Note: The truck body shape fundamentally stays consistent across the rows, but the visible geometric profile changes during the "Dumping" rows as the bed overlaps the cabin differently from a top-down view.*

## Material overlay
There is a specific area designated for the `Material` payload in the tray.
- **Location:** At the rear of the truck body, matching the interior tray boundaries.
- **Visibility:** Only visible during the "Travelling Full" and "Dumping" rows. Not visible in empty states.
- **Mask Strategy:** Because the bed moves during the dumping phase (which alters the exposed geometry of the material from a top-down perspective), a **single shared mask will not work**. 
- **Recommendation:** Implement a **per-variant mask atlas** aligned 1:1 with the base atlas. The mask atlas should contain white pixels exactly where material should be rendered and be completely transparent elsewhere. This allows WebGL shaders to instantly tint the correct pixels using random material colours at runtime.

## Rotation and anchor
- **Centering:** The truck graphic is visually centered around its mechanical pivot point (usually midway between the axles). 
- **Rotation Pivot:** Rotating around the absolute **cell centre** `(0.5, 0.5)` will work perfectly, as it is confirmed the sprites were exported exactly on this pivot in Figma.
- **Heading Offset:** The artwork is drawn facing East (Right). This means standard North-up (0°) headings from the MineStar JSON data will need to be adjusted.
  - **Recommendation:** Apply a constant rotation offset of **-90 degrees (or -π/2 radians)** when mapping north-up coordinate headings to the WebGL sprite rotation.

## Recommended exports
For a complete OpenLayers WebGL integration, we recommend the following exported assets from Figma:
1. **One Full Base Atlas PNG:** Containing the fully-colored base representations (complete with shadows and autonomy dots) on a transparent background.
2. **One Material-Mask Atlas PNG:** A strictly black/transparent (or white/transparent) mapping that corresponds 1:1 with the layout of the Base Atlas.
3. **Transparent Backgrounds:** Absolute requirement.
4. **Exact Pixel Dimensions:** Documented strictly and power-of-two (e.g. 512x512, 1024x1024 or 2048x2048) if possible for mipmap memory optimization in WebGL, though arbitrary rects are supported by modern OpenLayers.

## Open questions (Resolved)
- **Pivot Validation:** **Resolved.** Confirmed that the Figma frames are precisely anchored around the mechanical pivot (axle centerline) to ensure perfect sweeping turns in OpenLayers.
- **Status Dot Segregation:** **Resolved.** The autonomy dot will remain **baked in** for the POC to keep implementation simple, as the UI assets are currently provided that way. However, it is noted that in the future, these may need to be split out into separate dynamically colored layers.