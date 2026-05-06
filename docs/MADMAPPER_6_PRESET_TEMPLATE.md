# MadMapper 6.0.10 Preset Template

Take Me There should generate stable feeds. MadMapper owns projector assignment, warping, masks, cues, and final output routing.

## Required Media

Create these media inputs in MadMapper with the exact names:

| Feed | Role | MadMapper use |
| --- | --- | --- |
| `TakeMeThere_LEFT` | Projector | Assign to `Quad-1` |
| `TakeMeThere_FRONT` | Projector | Assign to `Quad-2` |
| `TakeMeThere_RIGHT` | Projector | Assign to `Quad-3` |
| Additional `TakeMeThere_*` names | Projector | Assign to added camera/projector surfaces |

For the current Windows install, use NDI inputs for final projector camera feeds. Depth, foreground, atmosphere, and masks are layer controls inside the app first; only publish them to MadMapper later if we decide to add a separate effects layer.

## Surface Layout

Use these surface names for the first room preset:

| Surface | Media |
| --- | --- |
| `Quad-1` | `TakeMeThere_LEFT` |
| `Quad-2` | `TakeMeThere_FRONT` |
| `Quad-3` | `TakeMeThere_RIGHT` |

Keep all physical mesh warping, masks, blend zones, and projector output routing inside MadMapper.

## Setup Cues

Create cue cells or controls for these operator actions:

| Cue name | Default app key | Default OSC path |
| --- | --- | --- |
| `SETUP_GRID` | `setupGrid` | `/timelines/Bank-1/by_cell/col_1/cue_row_1/play` |
| `IDENTIFY_LEFT` | `identifyLeft` | `/timelines/Bank-1/by_cell/col_2/cue_row_1/play` |
| `IDENTIFY_FRONT` | `identifyFront` | `/timelines/Bank-1/by_cell/col_3/cue_row_1/play` |
| `IDENTIFY_RIGHT` | `identifyRight` | `/timelines/Bank-1/by_cell/col_4/cue_row_1/play` |
| `WORLD_IDLE` | `worldIdle` | `/timelines/Bank-1/by_cell/col_1/cue_row_2/play` |
| `PORTAL_OPENING` | `portalOpening` | `/timelines/Bank-1/by_cell/col_2/cue_row_2/play` |
| `ARRIVAL` | `arrival` | `/timelines/Bank-1/by_cell/col_3/cue_row_2/play` |
| `BLACKOUT` | `blackout` | `/timelines/Bank-1/by_cell/col_4/cue_row_2/play` |

The app uses OSCQuery as the discovery source of truth at `http://127.0.0.1:8010/?` by default. If the final cue paths differ, update them in the local room preset.

## Suggested Effects

Use projector feeds as the base image. Keep physical warping, masks, blends, and projector routing inside MadMapper. The app now composites subtle depth/foreground/atmosphere layers before the final NDI camera feed.
