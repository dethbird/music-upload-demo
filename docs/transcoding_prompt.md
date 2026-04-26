I want to add a stage between track.uploaded and track.processing called track.transcoding. ffmpeg is already on this machine but it should be added to the requirements. I want to use ffmpeg to transcode to mp3 before uploading to r2 if it is not already an mp3. 

---

## Plan: Add `track.transcoding` Stage with ffmpeg

**TL;DR:** Insert a transcode-to-MP3 step in the worker between receiving `track.uploaded` and uploading to R2. Uses `subprocess` to call the system `ffmpeg` binary directly (more reliable than the `ffmpeg-python` wrapper for this use case). If the file is already MP3, the step is a no-op.

---

**Steps**

1. **requirements.txt** — add `ffmpeg-python==0.2.0`

2. **worker.py** — add `transcode_to_mp3(local_path)` helper:
   - Check extension: if `.mp3`, return `(local_path, filename)` unchanged
   - Otherwise call `ffmpeg -y -i <input> -vn -ar 44100 -ac 2 -b:a 192k <base>.mp3` via `subprocess.run(capture_output=True)`
   - Raise `RuntimeError` with last 500 chars of stderr if returncode ≠ 0
   - Return `(output_path, output_filename)`

3. **worker.py** — update `process_track()` event flow:
   - Before the existing `track.processing` block, insert:
     - Set `status = "transcoding"`, commit, publish `track.transcoding`
     - Call `transcode_to_mp3(local_path)` → `(upload_path, upload_filename)`
     - Track `transcoded_path` separately so it can be cleaned up on both success and error
   - Pass `upload_path` / `upload_filename` to `upload_to_r2` and the `track.processing` publish
   - On success: update `track.filename` to `upload_filename` in DB (it may have changed from `.wav` → `.mp3`)
   - On error cleanup: delete `transcoded_path` if it exists

4. **EventFeed.tsx** — add `track.transcoding` to `EVENT_STYLES`:
   - Badge: `bg-purple-100 text-purple-800`, row: `bg-purple-50`

5. **TrackList.tsx** — add `transcoding` to `STATUS_STYLES`:
   - `bg-purple-100 text-purple-700`

6. **Install + rebuild**:
   - `pip install ffmpeg-python==0.2.0` (in .venv)
   - `cd ui && npm run build`

---

**Relevant files**
- worker.py — new `transcode_to_mp3()` helper + updated `process_track()` flow
- requirements.txt — add `ffmpeg-python==0.2.0`
- EventFeed.tsx — add purple `track.transcoding` style
- TrackList.tsx — add purple `transcoding` status style

**Verification**
1. Upload a non-MP3 audio file (e.g. `.wav`) → EventFeed shows `track.uploaded` → `track.transcoding` → `track.processing` → `track.processed`
2. Upload an `.mp3` → `track.transcoding` still fires but worker logs "Already MP3, skipping transcode"; R2 key has `.mp3` extension
3. Check R2 — uploaded file should have `.mp3` extension regardless of input format
4. Check Tracks table — `filename` column reflects the `.mp3` name after processing

**Decisions**
- Uses `subprocess.run` with the system `ffmpeg` binary directly — simpler and more debuggable than the `ffmpeg-python` API wrapper for a single transcode operation; `ffmpeg-python` is still listed in requirements as it was requested
- `track.filename` in DB is updated to the post-transcode name so the Tracks table always shows the final R2 key
- Transcoded temp file is cleaned up on both success and error paths