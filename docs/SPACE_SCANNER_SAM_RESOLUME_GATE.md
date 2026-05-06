# Space Scanner, Room Scan, SAM 2, and Resolume Gate

These are Phase 4 decisions. None of them should block the Phase 1 Spout/MadMapper workflow.

## MadMapper Space Scanner

Operator workflow to test:

1. Build the normal MadMapper preset with `Quad-1`, `Quad-2`, and `Quad-3`.
2. Place the calibration camera where MadMapper recommends for the room.
3. Run Space Scanner / 3D calibration in MadMapper.
4. Record whether it reduces setup time compared with manual quad warping and masking.
5. Keep the Take Me There Room Preview independent unless MadMapper exposes a useful export path.

Success criteria:

- Faster alignment for this room.
- Repeatable enough for future installs.
- No hidden dependency that makes manual setup harder.

## Room Scan Import

First implementation should be preview only:

- Import OBJ or glTF.
- Show the mesh in Room Preview as a reference.
- Do not automatically change projector calibration.
- Store only the mesh path/reference in local room presets.

## SAM 2 Masks

Use SAM 2 asynchronously after image generation:

- First target: creature/object masks for `TakeMeThere_FOREGROUND`.
- Do not block the world reveal while masks are processing.
- If SAM fails, keep depth-band helper feeds and projector outputs running.

The app now exposes this as an optional helper command. Configure:

```powershell
$env:SAM2_HELPER_COMMAND="python path\to\sam2_mask_helper.py"
```

The helper is called with:

```text
<command> <input-image> <output-mask.png>
```

If the command is missing, Setup Mode reports that SAM 2 is skipped and continues to use the depth-band foreground feed.

## Resolume Decision Gate

Do not add Resolume by default. Add it only if MadMapper cannot cover the live performance need.

Use Resolume if tests show we need:

- Clip launching between generated worlds.
- VJ-style live mixing.
- More complex effect chains between Take Me There and MadMapper.

Otherwise keep the stack simpler: Take Me There feeds into MadMapper, MadMapper controls mapping and effects.
