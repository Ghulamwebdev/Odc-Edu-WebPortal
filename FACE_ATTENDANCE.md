# Face Attendance

Face attendance uses the locally bundled `@vladmandic/face-api` detector,
landmark, and face-recognition models. The browser creates 128-value face
descriptors from the live camera stream; the backend performs identity matching
against encrypted descriptors and decides which attendance records may be
created.

## Backend configuration

Set `FACE_DESCRIPTOR_ENCRYPTION_KEY` in the backend process environment or
deployment secret manager. For local development, the backend loads
`backend/.env.local` before `backend/.env`; keep this file untracked. Do not put
the key in a tracked file. Generate a key with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Keep the same key across restarts and backend instances. Changing it makes
existing registrations unreadable; those students must be registered again.
Never commit or share the key.

Optional matching settings:

- `- `FACE_MATCH_MAX_DISTANCE`: maximum Euclidean descriptor distance (default
  `0.52`; valid range `(0, 1]`).
- `FACE_MATCH_MIN_MARGIN`: required distance gap from the next candidate
  (default `0.06`).
- `FACE_DUPLICATE_MAX_DISTANCE`: registration duplicate check distance
  (default `0.36`).

The score shown in the UI is a normalized distance score, not a calibrated
probability. Tune thresholds against the actual camera, lighting, and student
population before relying on unattended attendance.

## Registration and matching

Face setup captures three live samples and sends only their descriptors to the
authenticated attendance API. MongoDB stores AES-256-GCM encrypted descriptors.
New camera captures are not stored, and roster APIs do not expose legacy face
images or hashes. Re-registering a student removes their old image and hash
fields; older hash-only registrations must be refreshed.

On a scan, the backend compares the submitted descriptor against registered
students, then checks the identified student's active enrollments, batch dates,
work schedule, holidays, and existing attendance records. Existing manual or
face records are preserved; only missing eligible batch records are inserted.
The unique attendance index is the final duplicate guard.

## Security limitations

The UI accepts camera frames rather than uploaded images, but browser-generated
descriptors alone do not prove that a live person was present. This system does
not include reliable liveness/anti-spoof detection; a sufficiently privileged
client can submit fabricated descriptors. Use supervised camera scanning and
manual review for disputed attendance. Face recognition can also produce false
matches or misses; keep a manual attendance option available.
