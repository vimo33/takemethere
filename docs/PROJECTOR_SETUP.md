# Projector Setup

## Prototype Baseline

Use the cabled baseline first:

1. Put the 4K projector on the front wall.
2. Put HD projectors on left and right walls.
3. Start the app and confirm the three projector frame windows are open:
   - `TakeMeThere_LEFT`
   - `TakeMeThere_FRONT`
   - `TakeMeThere_RIGHT`
4. Use a Spout window-capture bridge to publish each frame as a Spout sender.
5. In MadMapper, add one Spout input per sender.
6. Warp each input to the matching wall.
7. Only test wireless or NDI after this baseline is stable.

## Output Layouts

Three-wall mode:

```text
Left | Front | Right
```

Ceiling mode:

```text
Left | Front | Right | Ceiling
```

Ceiling mode is included for experiments but is not part of the first success criteria.

## MadMapper Notes

- See `docs/SPOUT_MADMAPPER_SETUP.md` for the three-frame Spout workflow.
- Use test cards first, then switch to world output.
- Keep the room as dark as possible.
- Avoid projector overlap until the slices are stable.
- Save one MadMapper preset per room layout.
- Use front wall brightness as the reference and dim side walls if needed.
