# @kurajs/cli

The `kura` command-line tool.

```sh
kura index [--out app/_index.bin] [--model Xenova/bge-m3]
```

**`kura index`** builds the search index for a Kura docs app: it reads the June-frozen
`app/_content.ts`, embeds every doc with bge-m3 (local, via `@kurajs/transformers`), and
writes a compact index (`app/_index.bin`) that the app loads at runtime — so search never
embeds the corpus on the request thread.

Typical use in a docs app's `package.json`:

```json
{ "scripts": { "gen": "june gen && kura index", "build": "june build && kura index" } }
```

Run `june gen` first (it generates `app/_content.ts`), then `kura index`.

## License

MIT
