Yes. After looking at GitHub projects around **depth maps, 2.5D parallax, 3D-photo inpainting, Gaussian splats, ComfyUI workflows, and video generation**, my recommendation is:

**Do not generate 3 separate images for 3 projectors.**  
Generate **one coherent world image**, create **depth/layers from it**, optionally inpaint hidden areas, then render 3 projector views from one shared spatial source.  
In parallel, test **image-to-video** because Three.js-only motion will feel artificial unless the image itself has internal movement.

This fits the original Take Me There direction: a visitor speaks a world, the system generates the world, places it into a virtual sphere/cube/scene, and uses virtual cameras for projector outputs. Your own concept already frames this as image/video → 3D environment mapping → virtual projector outputs → projection mapping.

---

# **1\. What I found on GitHub**

## **A. Best inspiration for your immediate problem: 2.5D / depth-map parallax**

These projects are closest to “make a flat generated image feel deeper.”

### **1\. DepthFlow**

DepthFlow converts static images into **3D parallax animation videos** using depth and GPU shaders. It is directly relevant because it is designed to turn a still image into motion, including seamless loops, depth of field, lens distortion, vignette effects, and GPU-accelerated GLSL rendering. ([GitHub](https://github.com/BrokenSource/DepthFlow?utm_source=chatgpt.com))

**Use for Take Me There:**  
After generating the AI still image, run it through a depth/parallax pipeline to create a short looping “alive” version. This may solve the feeling that Three.js alone is not dynamic enough.

### **2\. provos/parallax-maker**

This is one of the most useful references. It turns images into **2.5D animation workflows** using depth models, segmentation, inpainting, direct depth editing, and 3D export. It can generate **glTF scenes** that can be imported into Blender or Unreal and includes in-browser 3D preview. ([GitHub](https://github.com/provos/parallax-maker?utm_source=chatgpt.com))

**Use for Take Me There:**  
This is a strong blueprint for your local/lab pipeline:

AI image  
→ depth map  
→ segmentation cards  
→ inpaint hidden background  
→ export glTF / layered scene  
→ render in Three.js  
→ output 3 projector views

This is more useful than simply wrapping a flat image on a sphere.

### **3\. thygate/depthmap-viewer-three**

This is a small Three.js viewer that renders a plane using a displacement map. It expects an RGB image plus depth map and creates an interactive 3D depth effect. ([GitHub](https://github.com/thygate/depthmap-viewer-three?utm_source=chatgpt.com))

**Use for Take Me There:**  
Good minimal prototype reference. It gives you the simplest proof: “Does one generated image \+ one depth map feel better than a flat sphere texture?”

### **4\. DepthMap-To-3DModel**

This converts a 2D image plus depth map into a 3D model in the browser using Three.js. ([GitHub](https://github.com/junebee66/DepthMap-To-3DModel?utm_source=chatgpt.com))

**Use for Take Me There:**  
Useful as a reference for quickly turning your generated world into a mesh-like visual object.

---

## **B. Best depth-estimation model layer**

### **Depth Anything V2**

Depth Anything V2 is probably the best default monocular depth estimator to test. The repository says it outperforms V1 in fine-grained detail and robustness, and compared with SD-based depth models, it is faster, smaller, and more accurate. It also has image and video scripts, plus community support for Transformers, ONNX, TensorRT, ComfyUI, Core ML, and Android. ([GitHub](https://github.com/DepthAnything/Depth-Anything-V2?utm_source=chatgpt.com))

**Use for Take Me There:**  
Use it to generate a depth map from the AI still. Start with **Depth Anything V2 Small** or **Base** for speed. Be careful with licensing: the repo lists the Small model under Apache-2.0, but larger models under CC-BY-NC-4.0. ([GitHub](https://github.com/DepthAnything/Depth-Anything-V2?utm_source=chatgpt.com))

### **ComfyUI-DepthAnythingV2**

This is a ComfyUI node for Depth Anything V2. It auto-downloads models and makes depth estimation easy inside a node graph. ([GitHub](https://github.com/kijai/ComfyUI-DepthAnythingV2?utm_source=chatgpt.com))

**Use for Take Me There:**  
Best for quick lab testing if you want a ComfyUI workflow:

Generated image  
→ DepthAnythingV2 node  
→ depth map  
→ parallax/video/export

---

## **C. Best “turn one image into a 3D photo” reference**

### **vt-vl-lab/3d-photo-inpainting**

This is the classic CVPR 2020 project: **3D Photography using Context-aware Layered Depth Inpainting**. It converts a single RGB-D image into a layered depth image, hallucinates occluded color/depth, and renders motion-parallax videos. The repo says the process usually takes **2–3 minutes**, depending on compute. ([GitHub](https://github.com/vt-vl-lab/3d-photo-inpainting?utm_source=chatgpt.com))

**Use for Take Me There:**  
This is not fast enough for an instant live visitor flow, but it is excellent for understanding the right structure:

image \+ depth  
→ layered depth image  
→ inpaint hidden regions  
→ render camera motion

This is exactly the missing piece when flat images feel fake: when the camera moves, hidden areas need to exist. Otherwise the image stretches or tears.

### **stable-diffusion-webui-depthmap-script**

This is a very practical tool. It creates high-resolution depth maps, stereo images, normal maps, and 3D meshes, supports batch processing and video processing, and can run standalone. It integrates depth models like Marigold, MiDaS, ZoeDepth, LeReS, and 3D-Photo-Inpainting. ([GitHub](https://github.com/thygate/stable-diffusion-webui-depthmap-script?utm_source=chatgpt.com))

**Use for Take Me There:**  
Good experimental Swiss-army knife for the lab. It can help compare depth models quickly without building everything yourself first.

---

## **D. Best “real spatial scene” direction: Gaussian splats**

These are not the best first step for live generation, but they are important for the future.

### **mkkellogg/GaussianSplats3D**

This is a Three.js-based renderer for 3D Gaussian splatting. It renders splat scenes in real time and supports `.ply`, `.splat`, and compressed `.ksplat` formats. ([GitHub](https://github.com/mkkellogg/GaussianSplats3D?utm_source=chatgpt.com))

### **huggingface/gsplat.js**

This is a JavaScript Gaussian Splatting library, described as a general-purpose open-source library with functionality similar to Three.js but for Gaussian Splatting. It supports loading splat data and rendering it in a browser. ([GitHub](https://github.com/huggingface/gsplat.js?utm_source=chatgpt.com))

### **playcanvas/supersplat**

SuperSplat is a browser-based, open-source Gaussian Splat editor for inspecting, editing, optimizing, and publishing 3D Gaussian splats. ([GitHub](https://github.com/playcanvas/supersplat?utm_source=chatgpt.com))

**Use for Take Me There:**  
Not for the next immediate run, unless you already have a 3D scene or splat. But for future “real 3D worlds,” this is the direction to watch:

multi-view generated scene / captured scene  
→ Gaussian splat  
→ browser renderer  
→ projector camera outputs

---

# **2\. Should you create 3 images or split one image into 3 layers?**

## **My recommendation: one image → depth → layers, not 3 unrelated images.**

For the next run, do **not** ask the image model to create:

front wall image  
left wall image  
right wall image

That will probably create continuity problems. Each image may have slightly different lighting, scale, object positions, and visual logic. This matches your earlier concern that separately generated outputs can deviate; the transcript already points toward generating one spherical/360 source and taking different views from it instead.

Better:

One coherent hero image  
→ depth map  
→ segmented foreground/midground/background layers  
→ inpaint hidden areas  
→ Three.js scene  
→ three virtual camera outputs

So the answer is:

**Split one coherent image into depth/layers. Do not generate 3 separate wall images for the MVP.**

The only case where I would generate 3 images is if they are **not independent final walls**, but **references** for a model or pipeline:

reference image 1: wide hero world  
reference image 2: close material detail  
reference image 3: color/mood/lighting reference

That is useful for video generation, not for projector output.

---

# **3\. Best next-run experiment**

I would run **three parallel tests** with the same prompt.

Example prompt:

“A dreamlike underwater cathedral where oceans are trapped inside glowing glass bottles, floating bioluminescent particles, deep spatial perspective, cinematic, immersive, no people, no text.”

## **Test A — current baseline**

AI image  
→ Three.js sphere/cube  
→ 3 camera/projector views

Purpose: keep your current baseline.

Expected result: still may feel a bit flat, but useful for comparison.

---

## **Test B — depth/layer pipeline**

AI image  
→ Depth Anything V2  
→ 3-layer split: foreground / midground / background  
→ inpaint gaps  
→ Three.js parallax scene  
→ subtle camera drift  
→ 3 projector views

Use inspiration from DepthFlow, Parallax-Maker, depthmap-viewer-three, and 3D-Photo-Inpainting. ([GitHub](https://github.com/BrokenSource/DepthFlow?utm_source=chatgpt.com))

Expected result: this should feel **much less flat** than the current approach.

---

## **Test C — image-to-video pipeline**

AI image  
→ image-to-video model  
→ 8s or 10s loop  
→ Three.js video texture  
→ 3 projector views  
→ LED color sync

Use Veo 3.1 Fast first because the Gemini API supports Veo 3.1 programmatically, with 8-second 720p/1080p video, native audio, image-based direction, first/last frame control, and video extension. ([Google AI for Developers](https://ai.google.dev/gemini-api/docs/video?utm_source=chatgpt.com))

Also test Seedance 2.0 through fal if you want cinematic motion and can accept higher third-party API cost; fal’s Seedance 2.0 API supports text-to-video, image-to-video, and reference-to-video, with standard and fast endpoints. ([GitHub](https://github.com/fal-ai/seedance-2.0-api?utm_source=chatgpt.com))

Expected result: this should feel more alive than still-image Three.js. But it may still feel like a moving painting unless you combine it with depth/parallax or projection-space tricks.

---

# **4\. Best architecture for the next run**

For the next run, I would not make it too complex. Use this:

Prompt  
  ↓  
Generate one hero image  
  ↓  
Branch 1: Depth pipeline  
  \- Depth Anything V2  
  \- foreground/midground/background split  
  \- parallax movement  
  \- Three.js render

Branch 2: Video pipeline  
  \- Veo 3.1 Fast or Seedance 2.0 Fast  
  \- video texture  
  \- Three.js render

Branch 3: Hybrid  
  \- video as background texture  
  \- particles/fog/light beams in Three.js  
  \- depth/parallax foreground layers

The **hybrid** is likely to win.

Why? Because video gives internal motion, while Three.js gives spatial behavior. Your current issue is probably that Three.js is only moving a flat visual surface. The generated image itself does not have life inside it.

So the winning formula is probably:

**Generated video for living atmosphere \+ depth layers for parallax \+ Three.js particles/fog for real-time movement.**

---

# **5\. Recommended prototype stack**

## **Fastest useful prototype**

| Need | Tool / project |
| ----- | ----- |
| Generate image | Gemini image / GPT-image / other image API |
| Estimate depth | Depth Anything V2 |
| Quick parallax video | DepthFlow |
| More editable 2.5D scene | Parallax-Maker |
| Three.js depth test | depthmap-viewer-three |
| Inpaint hidden areas | 3D-Photo-Inpainting or ComfyUI inpainting |
| Live rendering | Three.js |
| Video generation | Veo 3.1 Fast \+ Seedance 2.0 Fast comparison |

This directly supports the Take Me There flow you already defined: still image, image-to-video, direct 360 video, Three.js spatial engine, and multiple projector outputs.

---

# **6\. Video model test: what to benchmark**

## **Veo 3.1 Fast**

Google’s docs say Veo 3.1 generates 8-second videos in 720p or 1080p with native audio and supports image-based direction with up to three reference images. ([Google AI for Developers](https://ai.google.dev/gemini-api/docs/video?utm_source=chatgpt.com))

Google’s pricing page currently lists:

* **Veo 3.1 Standard:** $0.40 / second  
* **Veo 3.1 Fast:** $0.15 / second ([Google AI for Developers](https://ai.google.dev/gemini-api/docs/pricing?utm_source=chatgpt.com))

So an 8-second Veo 3.1 Fast clip is roughly:

8 × $0.15 \= $1.20

## **Seedance 2.0 via fal**

fal’s Seedance 2.0 GitHub/API page lists:

* Standard text-to-video: **$0.3034/sec**  
* Standard image-to-video: **$0.3024/sec**  
* Fast text/image/reference-to-video: **$0.2419/sec** ([GitHub](https://github.com/fal-ai/seedance-2.0-api?utm_source=chatgpt.com))

So:

8s Seedance Fast ≈ $1.94  
10s Seedance Fast ≈ $2.42  
15s Seedance Fast ≈ $3.63

fal’s own guide repeats the same pricing and says audio is included at no extra cost. ([Fal.ai](https://fal.ai/learn/tools/how-to-use-seedance-2-0?utm_source=chatgpt.com))

## **Generation time reality**

For video, treat latency as something you must measure. A third-party Seedance API guide reports an async submit–poll–download pattern taking around **30–120 seconds depending on resolution**, but this will vary heavily by provider, queue, model tier, and time of day. ([NxCode](https://www.nxcode.io/resources/news/seedance-2-0-api-guide-pricing-setup-2026?utm_source=chatgpt.com))

For local 3D-photo inpainting, the classic 3D-Photo-Inpainting repo says the process usually takes **2–3 minutes** depending on compute. ([GitHub](https://github.com/vt-vl-lab/3d-photo-inpainting?utm_source=chatgpt.com))

So for the next run, log:

image\_generation\_ms  
depth\_generation\_ms  
layer\_split\_ms  
inpaint\_ms  
video\_generation\_ms  
download\_ms  
threejs\_load\_ms  
first\_projector\_frame\_ms

That will tell you what can be live and what needs to be pre-generated, hidden behind the portal walk, or cached.

---

# **7\. What I would test tomorrow / next session**

## **Test 1 — one image \+ depth mesh**

Use:

* one generated 16:9 or wide image  
* Depth Anything V2  
* thygate/depthmap-viewer-three or your own Three.js displacement plane

Success question:

Does the image immediately feel less flat when rendered with depth displacement?

---

## **Test 2 — one image \+ DepthFlow video**

Use:

* same generated image  
* DepthFlow to create a 5–8 second parallax loop

Success question:

Does the parallax loop feel more alive than our current Three.js animation?

---

## **Test 3 — one image \+ Veo 3.1 Fast**

Use:

* same generated image  
* Veo 3.1 Fast image-to-video  
* 8-second output as Three.js video texture

Success question:

Does generated video give enough internal life to justify the latency and cost?

---

## **Test 4 — one image \+ Seedance 2.0 Fast**

Use:

* same generated image  
* Seedance image-to-video via fal  
* same duration/aspect ratio as Veo

Success question:

Is Seedance more cinematic or spatial than Veo for our kind of dream-world prompt?

---

## **Test 5 — hybrid**

Use:

Veo/Seedance background video  
\+ Three.js particles/fog/light shafts  
\+ depth-based foreground layer  
\+ subtle camera drift

Success question:

Does hybrid feel like a world, not a video wall?

This is the one I expect to win.

---

# **8\. Practical decision: what to implement first**

## **Build this first**

/assets/session-001/  
  hero.png  
  depth.png  
  video-veo.mp4  
  video-seedance.mp4  
  layers/  
    foreground.png  
    midground.png  
    background.png  
  metadata.json

Then your Three.js app should support modes:

Mode 1: flat image  
Mode 2: sphere image  
Mode 3: depth displacement  
Mode 4: layer parallax  
Mode 5: video texture  
Mode 6: hybrid video \+ particles \+ depth foreground

This lets you compare everything in one room without rebuilding.

---

# **9\. My recommendation on the “3 images vs 3 layers” question**

Use this rule:

## **For projector outputs**

Use **one source world** and derive projector views from it.

one world → three virtual cameras → three projectors

## **For depth**

Use **one image split into layers**.

one image → depth → foreground/midground/background

## **For video**

Use **one image-to-video output**, not three separate videos.

one image → one video loop → render into 3 views

## **For reference conditioning**

Use **up to three images** only as references for style/motion/continuity, not as separate walls.

hero world image  
\+ material/detail reference  
\+ mood/color reference  
→ video generation

---

# **10\. The direction I would choose**

For Take Me There, the best near-term pipeline is:

Voice prompt  
→ prompt expansion  
→ one cinematic hero image  
→ Depth Anything V2 depth map  
→ layer split \+ optional inpainting  
→ generate 8s video from same hero image  
→ Three.js hybrid world  
   \- video background texture  
   \- parallax foreground layers  
   \- particles/fog/light shafts  
   \- 3 virtual projector cameras  
→ LED/DMX color sync

This is better than pure Three.js, better than three independent images, and more practical than full 3D world generation.

The principle should be:

**Use AI video for life, depth maps for space, and Three.js for embodiment.**

