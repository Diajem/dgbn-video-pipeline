# Presenter assets

Do not commit heavy or sensitive source media to this public repository.

Raw presenter packs should be extracted into a private folder such as:

```text
presenter-packs/
  peter/
    images/
    voice/reference.wav
  aisha/
  denise/
  david/
```

Set `PRESENTER_PACKS_ROOT` to that folder, then run:

```bash
npm run prepare:presenters
```

The selection rules live in `config/presenter-selections.json`. The script copies only the curated master/support stills and voice reference into ignored `runtime-assets/` storage and writes safe metadata contracts into `presenters/profiles/`.

Current first-pass masters are Peet/Peter, Aisha, Denise and David. The raw packs remain private and are never committed.
