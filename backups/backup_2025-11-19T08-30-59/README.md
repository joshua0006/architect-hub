# Firestore Backup

## Backup Information
- **Created**: 2025-11-19T08:31:01.179Z
- **Project ID**: BPo1ejgqniYfBTnCMJjB
- **Documents**: 425

## Files
- `documents.json`: All documents in the project
- `metadata.json`: Backup metadata

## Restore
To restore this backup, run:
```bash
npm run restore:firestore -- --backup /home/workspace/Documents/GitHub/architect-hub/backups/backup_2025-11-19T08-30-59
```

## What's Backed Up
- Document IDs
- All document fields including createdByName
- Original values before migration

## Notes
- This backup only includes the documents collection
- Storage files (PDFs, images) are NOT included
- To revert migration: restore createdByName field from this backup
