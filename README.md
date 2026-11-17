# Frameforge

Independent static browser-local MP4/MOV fast-start optimizer. Published at https://1animepahe-svg.github.io/frameforge-studio/; source repository: https://github.com/1animepahe-svg/frameforge-studio. No build, packages, backend, CDN, accounts, payments, or third-party assets are required to run the app. To host your own copy, place `index.html`, `style.css`, `optimizer.js`, `snapshot.js`, and `app.js` together on a static web server. Hash navigation works under repository subpaths.

## How it works

Choose an MP4/MOV/M4V up to **200 MiB**, press Optimize, then download and verify the result in your player. The app immediately reads the whole selected file into a browser-owned temporary snapshot before preview or processing, then the optimizer reads its top-level box headers and at most 32 MiB of movie metadata; it moves a trailing `moov` ahead of the single `mdat` and updates `stco` and `co64` chunk offsets. It copies all other bytes unchanged without re-encoding. If `moov` is already before `mdat`, the original is downloaded unchanged. Keep your original backup.

The parser intentionally accepts only a conservative subset of self-contained ISO BMFF/QuickTime layouts: one `ftyp`, one `moov`, one `mdat`, one chunk table and self-contained data reference per track, complete sample-to-chunk, size and timing tables, supported sample descriptions and known nested structures. Each track is limited to 2,000,000 samples and chunks; sample mapping counts and sample byte ranges are checked against the single `mdat`. Fragmented files, multiple data boxes, extended-size and zero-size boxes, non-self-contained or encrypted tracks, unknown structures, out-of-range offsets and unsafe overflow are rejected. Some valid MP4/MOV files are unsupported, including older MOV layouts. This is a container-reordering tool, not a general-purpose validator, repair tool or transcoder; malformed media that passes structural checks is not guaranteed playable. Preview and metadata availability also depend on browser codec support. On memory-limited phones, large files may fail despite the cap.

Compare uses real original/output videos, muted and synchronized on a best-effort basis. Local analytics uses browser metadata and estimates average **whole-file** bitrate as size × 8 / duration (including audio and container overhead). No TikTok data, engagement analytics, URL download, social upload, compression bypass or quality improvement is provided. Files are processed in the browser; no file or metadata is uploaded by the app. The site host still receives normal requests for site assets and may log them.

## Verification

`test-optimizer.cjs` uses Node 20+ built-ins (not needed to run the site). With optional ffmpeg-generated sample paths, run:

```
node test-optimizer.cjs /tmp/tail.mp4 /tmp/front.mp4 /tmp/fragmented.mp4
```

Without arguments it tests synthetic `stco` and `co64` relocation plus malformed mappings, external references and unsupported boxes. Run `node test-extra.cjs` for compact sample sizes and additional rejection cases. A real-video decode comparison can additionally be checked with ffprobe and ffmpeg frame checksums. No user files are deleted by these tests.
