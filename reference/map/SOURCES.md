# reference/map - the Paradise City source imagery for T3

These are REFERENCE ONLY, for digitising a road graph by eye.
Nothing here ships, nothing here is imported as geometry, and no extracted game data is used.
T3's scope says a faithful ROAD NETWORK with our own art, and that line is what keeps this legal.

## `street-names.jpg` - PRIMARY. Digitise from this one.

1759x1184 JPEG.
Source: <https://faqsmedia.ign.com/faqs/image/article/847/847935/snakeeysfriex_rightdevil77_burnout_paradise_2008jan30.jpg>
Found via IGN's Burnout Paradise FAQ media.
Credited on the image itself: "found by SnakeEyes Friex and Rightdevil77, image made by SnakeEyes Friex", "complete version 1.1", dated 30-1-08.

Why this is the primary:

- It is the highest-resolution whole-map view found, and the roads read clearly at 1:1.
- **District boundaries are drawn on it in red**, which no other candidate has. T3 needs districts as a first-class field in the graph.
- The five districts are labelled: **White Mountain** (west, mountain roads), **Silver Lake** (north-west, the lake), **Palm Bay Heights** (north-east), **Downtown Paradise** (east grid), **Harbor Town** (south).
- Landmarks are labelled in place: the **airport** (centre), the **quarry** (south-west), the **jumpable island** in the lake, and the **stock car circuit** (bottom left).
- The overlay markers are a bonus for later tasks, not for T3: superjumps and billboards are marked, which is placement evidence for **T8**, and the event pins are placement evidence for **T6**. Do not let them clutter the T3 graph.

The overlay dots DO obscure road detail in the dense downtown grid. Cross-check that area against `ign-map.jpg`, which is clean.

## `ign-map.jpg` - SECONDARY. Use it to read roads the overlay hides.

1349x965 JPEG.
Source: <https://oyster.ignimgs.com/mediawiki/apis.ign.com/burnout-paradise/e/ea/Map.jpg>
From IGN's Burnout Paradise World Map guide page.

Lower resolution, but the only markers are event pins, so the road network itself is much cleaner - especially the downtown grid and the motorway interchanges. It also renders the coloured road CLASSES legibly: orange/gold for the motorway ring and its spurs, grey/white for surface streets. That class distinction is what feeds the graph's `lanes` and `width` fields, so read it here rather than from the primary.

## Rejected candidates, recorded so nobody re-fetches them

| url | why not |
|---|---|
| `theaveragegamer.com/.../BurnoutParadise-OfficialMap.jpg` | Billed as the OFFICIAL map and it is, but it is **461x288**. Unusable for digitising. |
| `i.imgur.com/nQ8g0g2.jpg` | Image search reported 2663x2390; the URL actually serves a 336x478 placeholder. Dead. |
| Wikia `Paradise_City_Map_(with_Island).jpg` | Serves WebP, and the scale-to-width-down URL caps at 1200. Adds nothing over the two above. |
| Reddit "colored roads, street names" thread | Firecrawl does not support reddit.com. The image was not reachable, and no other host for it surfaced. **Street NAMES are therefore not sourced.** See below. |

## What is NOT sourced, and what to do about it

**Street names.** Neither saved map carries them. Names are cosmetic - nothing in T3's acceptance criteria needs them, and the connectivity validator does not care. Invent names in the graph's `name` field, or leave it null. Do not spend a session hunting a named map.

**Elevation.** Both maps are top-down. Paradise City has real vertical structure - the motorway is elevated over the surface streets in several places, White Mountain climbs hard, and the quarry is a pit. None of that is readable here. T3's schema has an `elevationClass` field for exactly this; it will have to be authored by judgement from the district and road class, not measured from these images.
