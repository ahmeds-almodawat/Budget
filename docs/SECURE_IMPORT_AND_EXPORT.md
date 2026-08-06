# Secure Import and Export

## Import policy (COD-H-008)

**Production path:** UTF-8 CSV only.

- Parser: `src/lib/import/secure-csv.ts`
- Limits: `src/lib/import/upload-limits.ts`
- Actions: `src/app/actions/import-actions.ts`

### Rejected formats

- `.xlsx`, `.xls`, macro-enabled workbooks
- The vulnerable `xlsx@0.18.5` package was removed from production dependencies

Users receive an explicit message when Excel uploads are attempted.

### Upload limits (defaults)

| Limit | Value |
|-------|------:|
| maxBytes | 5,242,880 (5 MiB) |
| maxRows | 25,000 |
| maxColumns | 64 |
| maxHeaderLength | 128 |
| maxCellLength | 4,096 |
| maxLineLength | 65,536 |
| maxErrors retained | 100 |
| maxWarnings retained | 200 |

### Validation

- MIME type, extension, UTF-8 validity
- Required headers, duplicate headers, row width
- Dates, UUIDs, decimals, formula-like cells
- SHA-256 hash of raw bytes before parsing
- Quarantine/validation state before posting

Malformed files create no posted actual records.

## Export policy (COD-H-013)

**Library:** `exceljs` (export only; not used for import parsing)

Central service: `src/lib/export/spreadsheet-safe.ts`

### CSV

Neutralize text cells whose effective first character is formula-like:

`=`, `+`, `-`, `@`, tab, CR, LF (after trimming leading whitespace/control chars).

Legitimate numeric negatives (e.g. `-1250.50`) remain numeric when source type is number.

### XLSX

- Explicit text cell types for untrusted text
- Numeric and date types where supported
- No user-controlled formulas
- Safe sheet names (31-char Excel limit, invalid chars stripped)

### Fidelity

| Layer | Behavior |
|-------|----------|
| Database value | Preserved in source systems |
| Export display | Neutralized where injection risk exists |
| User warning | Shown on import validation errors |
