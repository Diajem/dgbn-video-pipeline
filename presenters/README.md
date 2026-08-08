# Presenter assets

Do not commit heavy or sensitive source media to a public repository.

Expected local structure:

```text
presenters/
  peet/
    master.png
    profile.json
  aisha/
    master.png
    profile.json
  denise/
    master.png
    profile.json
```

`profile.json` will store crop rules, preferred motion style, voice ID/engine reference, pronunciation hints and avatar-backend tuning parameters. Actual source images should be supplied on the production machine or through private object storage.
