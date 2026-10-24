# Making a documentary: the fast path

This is the workflow that finished *The Land Question*, turned into tools you can repeat. Every step is a command; every command can be stopped and run again, and it carries on where it left off.

You need: the Video Studio running (`npm run studio`, or the desktop shortcut), Python 3 with Pillow (`pip install pillow`), and FFmpeg.

All commands take the form:

```bash
npm run doc -- --dir documentaries/my-film <command>
```

(`documentaries/` is ignored by git. You can use any folder; or set `DOC_DIR` once and leave out `--dir`.)

## House rules the tools follow

- British English in scripts, cards and descriptions.
- Every picture shows the actual story or place being narrated. A generic stand-in must be labelled ILLUSTRATIVE IMAGE or ILLUSTRATIVE FOOTAGE (add `|ILLUSTRATIVE IMAGE` to the plan item).
- AI visuals only for history, culture or statistics, labelled AI-GENERATED ILLUSTRATION (the Studio does this when a clip is marked `"ai": true`).
- Few cards: key numbers only.
- Pictures come from Wikimedia Commons (public domain / CC, credited automatically) or are made in-house. No Pexels or Unsplash.
- Nothing here spends money. The only paid service is the Google voice, and it is used only when you ask for it with `--voice google`.
- Wikimedia limits requests hard. The tools work one request at a time, pace themselves, and wait and retry on "HTTP 429". If a search still fails, run the same command again later.

## The six steps

### 1. Chapters in

Write `chapters.json` (one file for the whole film), then:

```bash
npm run doc -- --dir documentaries/my-film init path/to/chapters.json
```

```json
{
  "meta": {
    "title": "The Land Question",
    "brand": "DGBN", "format": "long", "orientation": "LANDSCAPE",
    "voice": "en-GB-Chirp3-HD-Charon",
    "cardNote": "Figures as stated in the narration script (fact-checked 16 Oct 2026).",
    "summary": "One or two lines for the top of the YouTube description.",
    "sources": ["Natives Land Act, No. 27 of 1913", "Land Audit Report, 2017"],
    "extraCredits": ["Archive footage: The White House / Public domain"]
  },
  "chapters": [
    {
      "n": 1,
      "title": "The Land Question - Chapter 1: Two Scenes",
      "short": "Two Scenes",
      "headline": "Two scenes. Two stories. One land question.",
      "storyType": "present",
      "scenes": [
        {"text": "One paragraph of narration per scene.",
         "visuals": [
           {"t": "commons", "q": "Cyril Ramaphosa 2026"},
           {"t": "card", "big": "2.5 million", "sub": "hectares of state land for Black farmers", "small": "Source: The Presidency"}
         ]}
      ]
    }
  ]
}
```

Each scene's text is one paragraph (no blank lines): the Studio makes one scene per paragraph. `storyType` is one of `present`, `past`, `data`, `graphic`. `short` is the chapter name used for YouTube chapters. A card's `small` line starting `Source:` becomes its rights note; otherwise `cardNote` is used.

`init` also writes a first `plan.json` with every card and every Commons search, photos still to be picked.

### 2. Search and contact sheets

```bash
npm run doc -- --dir documentaries/my-film survey
```

This searches Commons for every `commons` visual and saves a contact sheet per search in `survey/` (e.g. `survey/c1s0v0.jpg`: chapter 1, scene 1, visual 1; numbered from 0). Look at the sheets and note the number in square brackets of each picture that truly shows what is being narrated.

- No good result? Search again with simpler words: `survey c3s1v1="Xhosa war"`. Extra searches can have any key: `survey q_parliament="Parliament of South Africa Cape Town"`.
- A sheet came out blank (thumbnails were rate-limited)? `sheets` rebuilds the blank ones.
- Footage: `vsurvey rural="Eastern Cape village"` makes `survey/v_rural.jpg`. Download the ones you like with `vfetch rural:0 rural:4`; each gets a sheet of frames with timestamps (`survey/vf_rural_0.jpg`) so you can choose where to cut.

### 3. The plan

Edit `plan.json`: for each scene, the pictures in the order they should appear.

```json
{
  "clips": {
    "ec_village": {"from": "rural:0", "start": 12, "duration": 6, "label": "ILLUSTRATIVE FOOTAGE"},
    "wan_map":    {"file": "clips/wan_map.mp4", "ai": true}
  },
  "chapters": {
    "1": [["clip:ec_village", "photo:c1s0v0:2"], ["photo:q_union:0", "card:1"], ["photo:q_cows:3|ILLUSTRATIVE IMAGE"]]
  }
}
```

- `card:N` - the card that is visual N of that scene in `chapters.json`.
- `photo:KEY:N` - picture N on contact sheet KEY. `photo:KEY:?` means not picked yet.
- `clip:NAME` - a clip from `clips`. Commons clips need `from`, `start`, `duration` (seconds) and a `label` (FILE FOOTAGE, ILLUSTRATIVE FOOTAGE or ARCHIVE). Your own files need `label`, `credit` and `rightsNote`; AI clips need `"ai": true`.

Then cut the clips and check the plan:

```bash
npm run doc -- --dir documentaries/my-film clips
npm run doc -- --dir documentaries/my-film plan
```

`plan` lists errors (must fix) and what is still to do.

### 4. Build every chapter

```bash
npm run doc -- --dir documentaries/my-film build
```

One Studio project per chapter: script, headline, scenes, cards (made in the house style and uploaded as GRAPHIC with a rights note), Commons photos (at 1280px, credited, licence checked) and clips (labelled and credited), plus the free draft Windows voice. Chapters are marked first / middle / last, so only the first gets the brand intro and only the last gets the outro and the credits. Before the last chapter renders, every credit used anywhere in the film (plus `extraCredits`) is copied onto it, so the end roll covers the whole film.

Build one chapter with `build 3`. If you change a chapter's plan after building it, run `build 3 --rebuild` to replace its pictures in the new order. Once the script is final, add the real voice with `build --voice google` (this is the paid step).

### 5. Draft renders and frame sheets

```bash
npm run doc -- --dir documentaries/my-film draft
npm run doc -- --dir documentaries/my-film film --draft
```

Each chapter gets a 720p preview in `out/previews/` and a sheet of 16 timed frames in `out/frames/` - check every frame against the narration. `film --draft` joins the drafts into one film for watching end to end. `check` lists any Studio warnings.

### 6. After approval: final film and description

Listen to each chapter's Google narration and approve it (in the Studio, or for all chapters with `approve`). Then:

```bash
npm run doc -- --dir documentaries/my-film film
npm run doc -- --dir documentaries/my-film description
```

`film` makes final renders (keeping ones already done; `--rerender` to redo), joins them without re-encoding into `out/<title>-full-film.mp4`, makes a 720p preview and writes `out/youtube-chapters.txt`. `description` writes `out/youtube-description.txt`: chapters, sources, every image and footage credit, and the labelling note. Optional: `sources-card` puts a SOURCES card on the last scene.

`status` shows what has been built and rendered at any point.

## Good to know

- Everything the tools learn is kept in the working folder: `state.json` (project ids, finished steps, renders), `survey/` (search results). Deleting `state.json` makes `build` start new Studio projects.
- If the Studio runs from a different folder, renders are fetched over HTTP into `out/renders/`. `STUDIO_URL` changes the Studio address.
- Set `STUDIO_CONTACT` (an email address) so Wikimedia can see who is making requests.
- Offline tests: `npm run test:documentary`. A two-chapter sample brief is in `scripts/documentary/sample/`.
