# Seestar native telephoto FOV presets

The two presets represent complete telescope/camera combinations. Choosing either
its telescope or built-in camera selects the matching equipment and a native 1×
factor. This works in the main setup, each comparison card, and the mosaic planner.
Nothing is selected automatically on initial page load. Existing rotation controls
rotate these portrait frames normally; all fields remain editable for custom use.

| Preset | Aperture | Focal length | Native pixels (width × height) | Pixel pitch | Active area (width × height) | Calculated FOV |
| --- | --- | --- | --- | --- | --- | --- |
| S30 | 30 mm | 150 mm | 1080 × 1920 | 2.9 µm | 3.132 × 5.568 mm | ≈ 1.20° × 2.13° |
| S30 Pro | 30 mm | 160 mm | 2160 × 3840 | 2.9 µm | 6.264 × 11.136 mm | ≈ 2.24° × 3.99° |

Active areas are derived from native capture resolution × pixel pitch. Each axis
uses the existing calculator formula, `2 × atan(sensor dimension / (2 × focal
length))`. These are ideal single-frame estimates, not stitched mosaics, upscaled
image resolutions, or the secondary wide-angle lens. Stacking/alignment crops can
reduce usable coverage. Manufacturer single-number FOV specifications are not used
as rectangle width or height. A separate manufacturer image-circle diameter is
not published, so the insight bar keeps that value unknown.

Sources checked September 10, 2026:

- [Seestar S30 specifications](https://www.seestar.com/products/seestar-s30-all-in-one-smart-telescope)
- [Seestar S30 Pro specifications](https://us.seestar.com/products/seestar-s30-pro)
- [Sony IMX585 pixel pitch](https://www.sony-semicon.com/en/news/2021/2021062901.html)
- [ZWO IMX662 camera sensor specifications](https://us.zwoastro.com/products/asi662mc)
