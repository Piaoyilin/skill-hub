# Skill Package Storage

Skill Hub uses a private Supabase Storage bucket named `skill-packages`.

## Environment

Create `.env.local` in the project root. Do not commit this file.

```env
SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
```

The service role key is server-only. It must not be imported by client components,
returned by an API, or written to logs.

Create the bucket manually in Supabase Storage:

- Name: `skill-packages`
- Public: disabled

## Object Path

Published packages use the server-generated path:

```text
skills/{slug}/{version}/skill.zip
```

The slug and version are validated before this path is created. The upload uses
`upsert: false`, so an existing object is never silently replaced.

## Publish Consistency

The publish flow:

1. Re-parses and validates the ZIP.
2. Checks the database version and Storage path.
3. Uploads the original ZIP bytes.
4. Writes Registry rows in one Prisma transaction.
5. Deletes the Storage object if the database transaction fails.

Storage and PostgreSQL do not share a transaction. If compensation deletion
also fails, the API returns `PUBLISH_COMPENSATION_FAILED` for manual inspection.

## Download

`GET /api/skills/{slug}/download` downloads the newest published version.

`GET /api/skills/{slug}/download?version=1.0.0` downloads a specific published
version. The API only reads the Storage path stored on the matching database
record and increments `Skill.downloads` after the object is downloaded.

Seed records created before package storage was added may have no `storagePath`.
They remain visible, but their download button is disabled and no ZIP is invented.

## Database Sync

The Prisma schema adds nullable metadata fields to `SkillVersion`:

- `storagePath`
- `packageSize`
- `packageHash`

For the current development database, apply the additive change with:

```bash
npx prisma db push
npx prisma generate
```

Do not use `prisma migrate reset`. Do not run seed again just to add Storage
metadata.
