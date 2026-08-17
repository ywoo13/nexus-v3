# Drop the real plaza map here

Save your Blender-made plaza model into this folder as **`plaza.glb`**:

```
client/public/models/plaza.glb
```

`PlazaMap.jsx` automatically finds and loads this file, applying physics collision (a trimesh collider) matching the model's exact shape. No code changes needed — just drop the file in and it takes effect on the next reload.

If the file doesn't exist yet (the current state), the existing fallback backdrop (`PlazaBackdrop` + `PlazaProps`) is shown automatically instead.

## Blender export checklist

- `File > Export > glTF 2.0`, format `.glb` (bundles textures into a single file)
- Check "Apply Modifiers", confirm +Y Up (Three.js coordinate system)
- Centering the map at (0, 0, 0) makes it easier to position in code
- The character is about 1.6m tall — stand a human-scale reference cube in Blender to match proportions
- Aim for 50k–150k triangles total for the scene (real-time browser rendering)
