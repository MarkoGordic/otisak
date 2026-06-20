# OTISAK Documentation

Two languages:

- 🇷🇸 **Srpski (latinica)** → [`sr/`](sr/README.md)
- 🇬🇧 **English** → [`en/`](en/README.md)

Each language has four topic pages:

1. Managing exams (`exams.md`)
2. Running and conducting tests (`running-tests.md`)
3. Managing users (`users.md`)
4. Managing subjects (`subjects.md`)

In the running app, the same content lives at [`/docs`](../README.md#documentation) with a language switcher.

Images live in `assets/` and can be referenced from any doc with a relative path:

```markdown
![](../assets/screenshot.png)
```

Folder is at the docs root: `docs/assets/`. Paths are resolved relative to the
markdown file; the renderer also falls back to a basename match so a small
typo like `./assets/...` vs `../assets/...` still finds the image.

## Internal design notes

- [QUESTIONS.md](QUESTIONS.md). Design notes on question-type modelling. English, internal.
