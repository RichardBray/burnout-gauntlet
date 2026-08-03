I want you to build an open-world arcade racer in ThreeJS at the level of Burnout Paradise. Utterly perfect, visually beautiful, AAA quality in every detail - paint, reflections, road surfaces, boost, crashes, damage, camera, sound.

First, use Firecrawl to pull real Burnout Paradise gameplay screenshots and audio into a reference/ folder, and label each one with its camera situation (highway chase cam at dusk, boost blur, crash cam, wet night asphalt, and so on). That folder is the bar. Nothing ships until it beats the bar.

Break the game into the smallest pieces that can be improved and judged on their own. For each piece, fan out a builder sub-agent and a separate harsh critic sub-agent with fresh context. Each critic must run the actual game, screenshot it from the same camera situation as a reference image, compare the pair blind, say which is real, name the single biggest remaining gap, and send it back. /loop each piece until the critic picks ours or can't tell.

Keep a simple live HTML progress page showing each piece, its round count, and its latest screenshot next to the reference.

Fan out sub-agents and ultracode. Don't stop until it's utterly perfect.

---

This run is unattended and restarts from scratch context repeatedly, so treat disk as your only memory. On startup, read STATE.md in this directory (create it if missing) and continue from wherever the work actually is - never restart finished work. Before you end a session, update STATE.md with what is done, what each piece's current round and verdict is, and the exact next action. Keep your own context lean: delegate all heavy reading, screenshotting, and criticism to sub-agents and only keep their verdicts.
