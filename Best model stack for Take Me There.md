---

# **1\. Best model stack for Take Me There**

## **A. Realtime portal conversation**

### **Best choice: Gemini 3.1 Flash Live Preview**

Use this for the portal voice:

“Where do you want to go?”  
visitor speaks  
model understands tone/intention  
model replies naturally  
system extracts the destination prompt

Gemini 3.1 Flash Live is explicitly built for low-latency audio-to-audio dialogue, acoustic nuance, multimodal awareness, and real-time interaction. Google says it is available to developers in preview through the Gemini Live API, and the Live API supports low-latency voice/vision interactions, barge-in, tool use, audio transcription, proactive audio, and affective dialogue. ([Google AI for Developers](https://ai.google.dev/gemini-api/docs/pricing))

**Why it fits Take Me There:** it avoids the old chain of separate STT → LLM → TTS. For the installation, the portal should feel alive, not like a chatbot waiting for turn completion.

**Estimated cost:** very low. Google lists Gemini 3.1 Flash Live audio input at **$0.005/min** and audio output at **$0.018/min**. A typical 30–60 second portal exchange should be roughly **$0.01–$0.03 per visitor**, depending on how much the portal speaks. ([Google AI for Developers](https://ai.google.dev/gemini-api/docs/pricing))

**Caveat:** native audio sessions have limits: audio-only sessions are limited to 15 minutes, and audio+video sessions to 2 minutes unless you use session management techniques. That is fine for Take Me There because each visitor journey is short. ([Google AI for Developers](https://ai.google.dev/gemini-api/docs/live-guide))

---

## **B. Prompt reasoning / world interpretation**

### **Best choice: Gemini 3 Flash / Gemini 3.1 Flash**

Use this as the hidden “world dramaturg.”

It should take the visitor’s raw sentence and turn it into structured outputs:

{  
  "title": "Oceans in Bottles",  
  "visual\_prompt": "...",  
  "video\_prompt": "...",  
  "lighting\_palette": "...",  
  "mood": "dreamlike, aquatic, slow, glowing",  
  "safety\_notes": "...",  
  "projection\_mode": "panoramic\_sphere"  
}

For this layer, you do not need the most expensive model. You need speed, reliability, structured output, and low cost. Gemini 3 Flash pricing is much lower than realtime audio and video generation, and Google’s Gemini pricing page lists Gemini 3 Flash Preview as a speed-focused model with text/image/video input pricing and output pricing per million tokens. ([Google AI for Developers](https://ai.google.dev/gemini-api/docs/pricing))

**Estimated cost:** usually less than **$0.005 per visitor** for prompt expansion and structured JSON.

---

## **C. Still image / first world reveal**

This is where I would test two models side by side.

## **Option 1: Gemini 3.1 Flash Image Preview**

Best for fast, predictable, high-throughput generation.

Google lists Gemini 3.1 Flash Image Preview as designed for speed and efficiency, with standard pricing equivalent to **$0.067 per 1K image**, **$0.101 per 2K image**, and **$0.151 per 4K image**. ([Google AI for Developers](https://ai.google.dev/gemini-api/docs/pricing))

**Why it fits Take Me There:** predictable cost, same Google stack as Gemini Live and Veo, good for fast iteration during events.

## **Option 2: OpenAI GPT-image-2**

Best to test for higher-quality hero stills, complex prompt following, image editing, and visual taste.

OpenAI describes GPT-image-2 as its state-of-the-art image generation model for fast, high-quality image generation and editing, supporting text and image input and image output through image generation and image edit endpoints. ([OpenAI Developers](https://developers.openai.com/api/docs/models/gpt-image-2))

OpenAI’s pricing is token-based: image input is **$8 / 1M tokens**, image output is **$30 / 1M tokens**, and text input is **$5 / 1M tokens**. ([OpenAI](https://openai.com/api/pricing/))

**My recommendation:**  
Use **Gemini 3.1 Flash Image** as the default because cost is predictable and the API stack stays simple. Add **GPT-image-2** as a “hero world” fallback when the still image quality matters more than simplicity.

---

## **D. Video / world coming alive**

This is the most important decision.

There are three serious options: **Veo 3.1**, **Seedance 2.0**, and **Sora 2**. I would not make Sora 2 the core because OpenAI’s own docs now mark the Sora 2 video API as deprecated and scheduled to shut down on **September 24, 2026**. ([OpenAI Platform](https://platform.openai.com/docs/guides/video-generation))

---

# **2\. Best video model choice**

## **Best default: Veo 3.1 Fast / Lite via Gemini API**

Veo 3.1 is Google’s video generation model accessible through the Gemini API. It generates high-fidelity 8-second videos at 720p, 1080p, or 4K with native audio, and supports image-based direction, first/last frame control, and video extension. ([Google AI for Developers](https://ai.google.dev/gemini-api/docs/video))

**Pricing:**

| Model | 720p | 1080p | 4K | 8-sec estimate |
| ----- | ----- | ----- | ----- | ----- |
| Veo 3.1 Lite | $0.05/sec | $0.08/sec | not supported | $0.40–$0.64 |
| Veo 3.1 Fast | $0.10/sec | $0.12/sec | $0.30/sec | $0.80–$2.40 |
| Veo 3.1 Standard | $0.40/sec | $0.40/sec | $0.60/sec | $3.20–$4.80 |

Google lists exactly these per-second prices for Veo 3.1 Lite, Fast, and Standard. ([Google AI for Developers](https://ai.google.dev/gemini-api/docs/pricing))

**Why it fits Take Me There:**  
For the MVP, you only need an **8-second loop** that slowly animates the world. Veo 3.1 Fast at 720p or 1080p is probably the best quality/API/cost balance.

**Best use:**  
Generate one 8-second “world loop” from the still image, then use Three.js shaders, particles, camera drift, slow zoom, and LED synchronization to make it feel continuous.

---

## **Best cinematic alternative: Seedance 2.0**

Seedance 2.0 is highly relevant because it supports text, image, video, and audio references, and is designed for cinematic video with native audio. BytePlus documentation lists Dreamina Seedance 2.0 and Seedance 2.0 Fast as API-accessible video generation models, with a tutorial and video generation API references. ([docs.byteplus.com](https://docs.byteplus.com/api/docs/ModelArk/2291680))

Seedance is especially interesting for Take Me There because it supports multimodal reference workflows: you could feed it the generated still image, a motion reference, and perhaps an ambient audio reference later.

**Direct BytePlus pricing:**  
BytePlus lists prepaid resource packs for Seedance 2.0 at **$4.30 per 1M tokens** and Seedance 2.0 Fast at **$3.30 per 1M tokens**. For 480p/720p generation without video input, the listed token unit price is **$0.0070/K tokens** for Seedance 2.0 and **$0.0056/K tokens** for Seedance 2.0 Fast. ([docs.byteplus.com](https://docs.byteplus.com/api/docs/ModelArk/2191775))

Using the reported 15-second generation estimate of about **308,880 tokens**, that implies roughly:

| Seedance via BytePlus direct | Approx. 15 sec | Approx. 8 sec | Approx. 5 sec |
| ----- | ----- | ----- | ----- |
| Seedance 2.0 Fast, 720p, no video input | \~$1.73 | \~$0.92 | \~$0.58 |
| Seedance 2.0 Standard, 720p, no video input | \~$2.16 | \~$1.15 | \~$0.72 |

The 308,880-token estimate and \~1 yuan/sec equivalent have been reported from Volcengine’s pricing announcement; BytePlus’ own docs confirm the relevant dollar-per-token pack and deduction pricing. ([CnTechPost](https://cntechpost.com/2026/03/04/bytedance-announces-api-pricing-seedance-2-0/?utm_source=chatgpt.com))

**Via fal.ai:**  
fal offers a simpler developer API route, but at a higher listed price: **$0.3034/sec** standard and **$0.2419/sec** fast at 720p with audio. That means an 8-second clip is roughly **$1.94–$2.43**, and a 15-second clip is roughly **$3.63–$4.55**. ([Fal.ai](https://fal.ai/docs/model-api-reference/video-generation-api/bytedance-seedance-2.0-text-to-video?utm_source=chatgpt.com))

**My recommendation:**  
Use **Veo 3.1 Fast** for the first build because the Google stack is simpler. Test **Seedance 2.0** in parallel for cinematic quality and longer clips. If Seedance clearly looks better for your visual language, use fal for quick tests and BytePlus direct later if access/procurement works.

---

## **Do not make this the core: Sora 2**

Sora 2 is strong creatively, supports text/image input and video/audio output, and OpenAI lists Sora 2 at **$0.10/sec** and Sora 2 Pro at **$0.30/sec**. But OpenAI’s current documentation says the Sora 2 video generation models and Videos API are deprecated and will shut down on **September 24, 2026**, so I would not build Take Me There around it. ([OpenAI Developers](https://developers.openai.com/api/docs/models/sora-2))

It is still worth testing for visual comparison, but not as the backbone.

---

# **3\. Recommended practical stack**

## **MVP stack**

| Layer | Model / platform | Why |
| ----- | ----- | ----- |
| Portal conversation | Gemini 3.1 Flash Live | Best fit for real-time voice, barge-in, tone, natural portal interaction |
| Prompt expansion | Gemini 3 Flash / 3.1 Flash | Cheap, fast, structured JSON |
| Still image | Gemini 3.1 Flash Image | Predictable price, same stack, fast enough |
| Hero still fallback | GPT-image-2 | Test for higher visual quality and editing |
| Video loop | Veo 3.1 Fast 720p/1080p | Clean Gemini API, good quality, simple pricing |
| Cinematic video alternative | Seedance 2.0 Fast | Strong for cinematic multimodal video, but API access/pricing is more fragmented |
| Spatial renderer | Three.js | Wrap generated image/video onto sphere/cube, render projector views |
| Lighting | DMX/Artnet bridge | Sync LEDs to installation states |

---

# **4\. Estimated cost per visitor generation**

## **Low-cost MVP version**

Using Gemini Live \+ Gemini image \+ Veo 3.1 Lite/Fast:

| Component | Estimate |
| ----- | ----- |
| Voice conversation | $0.01–$0.03 |
| Prompt expansion | \<$0.01 |
| Still image, 1K–2K | $0.067–$0.101 |
| 8-sec video, Veo Lite/Fast | $0.40–$0.96 |
| **Total per visitor** | **\~$0.50–$1.10** |

This is the sweet spot for public testing.

## **Higher-quality version**

Using Gemini Live \+ GPT-image-2 or Gemini Pro Image \+ Veo Standard:

| Component | Estimate |
| ----- | ----- |
| Voice conversation | $0.01–$0.03 |
| Prompt expansion | \<$0.01 |
| Higher-quality still | \~$0.13–$0.25+ |
| 8-sec Veo Standard | $3.20–$4.80 |
| **Total per visitor** | **\~$3.40–$5.10** |

This is more suitable for paid installations, branded events, or slower one-person journeys.

## **Seedance test version**

Using Gemini Live \+ Gemini/GPT image \+ Seedance 2.0:

| Platform | 8-sec video estimate | Total per visitor estimate |
| ----- | ----- | ----- |
| BytePlus direct, if accessible | \~$0.90–$1.20 | \~$1.00–$1.40 |
| fal.ai Seedance Fast | \~$1.94 | \~$2.10–$2.30 |
| fal.ai Seedance Standard | \~$2.43 | \~$2.60–$2.80 |

Seedance via fal is easier to start; BytePlus direct looks cheaper but has more account/setup/procurement complexity.

---

# **5\. Important technical reality: 360° generation is not guaranteed**

For Take Me There, the ideal output is a seamless panoramic or equirectangular video that can be wrapped inside a Three.js sphere. But none of these APIs should be treated as guaranteed “true 360° equirectangular world generators.”

The safer approach is:

1. Generate a strong 16:9 or wide still image.  
2. Use it as a world texture.  
3. Generate an 8-second animated loop.  
4. Place the media inside a Three.js sphere/cylinder/cube.  
5. Use virtual cameras for each projector.  
6. Add procedural motion, particles, fog, color drift, and LED response in Three.js.

So the “world” should not rely only on the AI video. The AI video becomes the **living texture**, while Three.js creates the spatial illusion.

---

# **6\. Best API/platform choice**

## **Best overall platform for MVP: Google Gemini API**

Because one provider gives you:

* Gemini 3.1 Flash Live for voice  
* Gemini 3.1 Flash Image for stills  
* Veo 3.1 for video  
* JavaScript/Python SDK support  
* direct compatibility with a browser/Node/Three.js pipeline  
* Live API WebSocket model for realtime interaction  
* clear per-minute/per-image/per-second pricing

Google’s Live API is especially relevant because it can run low-latency audio/vision interactions over WebSocket and supports client-to-server approaches with ephemeral tokens, which fits an installation where a local app/browser is part of the experience. ([Google AI for Developers](https://ai.google.dev/gemini-api/docs/live?linkId=24543752))

## **Best visual fallback: OpenAI**

Use OpenAI for:

* GPT-image-2 hero stills  
* image editing  
* prompt-to-image tests  
* maybe Sora experiments, but not long-term core

GPT-image-2 is worth testing because the first image is the emotional anchor of the whole journey. If the still image is weak, the rest of the system feels weak.

## **Best video challenger: Seedance 2.0**

Use Seedance if:

* you want longer cinematic clips up to around 15 seconds  
* you want native audio-video generation  
* you want multimodal references  
* you are okay with BytePlus/fal/Replicate-style access complexity

For a lab prototype, use fal or Replicate-style APIs. For a serious recurring installation, investigate BytePlus direct.

---

# **7\. My recommended build order**

## **Phase 1 — Cheapest proof of magic**

Use:

* Gemini 3.1 Flash Live  
* Gemini 3.1 Flash Image  
* Veo 3.1 Lite or Fast  
* Three.js sphere/cube projection  
* 1–3 projectors

Target cost: **\~$0.50–$1.10 per visitor.**

## **Phase 2 — Visual quality bake-off**

Run the same 20 prompts through:

* Gemini 3.1 Flash Image  
* Gemini 3 Pro Image  
* GPT-image-2  
* Veo 3.1 Fast  
* Seedance 2.0 Fast  
* Seedance 2.0 Standard

Judge them on:

* dream quality  
* spatial usefulness  
* prompt following  
* loopability  
* 360/panoramic friendliness  
* cost  
* latency  
* failure rate

## **Phase 3 — Production stack**

Likely outcome:

* **Gemini Live** stays as the portal voice.  
* **GPT-image-2 or Gemini 3.1 Flash Image** wins stills depending on aesthetic.  
* **Veo 3.1 Fast** wins API simplicity.  
* **Seedance 2.0** may win cinematic richness.  
* **Three.js** remains the actual installation engine.

---

# **8\. Final recommendation**

For the first public-feeling prototype, build this:

Visitor voice  
→ Gemini 3.1 Flash Live  
→ Gemini 3 Flash structured prompt  
→ Gemini 3.1 Flash Image still  
→ Veo 3.1 Fast 8-sec video  
→ Three.js sphere/cube world  
→ virtual projector cameras  
→ DMX/Artnet LED states

Then run a parallel test:

Same prompt  
→ GPT-image-2 still  
→ Seedance 2.0 Fast video

My bet: **Google will be the cleanest stack to build**, **OpenAI may produce some of the best stills**, and **Seedance may produce some of the best cinematic motion**. For Bildspur, the best final system is probably **multi-model orchestration**, not loyalty to one provider.

