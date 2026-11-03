# Legacy TTML lyrics migration

This one-time utility converts saved provider TTML in Arrangement lyrics or chord bodies into Sonivo lyric text and the validated timing timeline. It uses the same bounded TTML parser as authenticated imports.

Run from the repository root. A dry run is the default:

```powershell
dotnet run --project tools/Sonivo.LyricsMigration
```

Apply creates a JSON backup in `.scratch/` before one database transaction updates valid records. Set `SONIVO_MIGRATION_CONNECTION` to target a database other than the local development database.

```powershell
dotnet run --project tools/Sonivo.LyricsMigration -- --apply
```

Restore only works while migrated arrangements remain at the version written by this migration:

```powershell
dotnet run --project tools/Sonivo.LyricsMigration -- --restore .scratch/lyrics-ttml-backup-<timestamp>.json
```

Malformed or unsupported TTML is skipped and left unchanged.
