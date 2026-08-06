# Import Security Test Matrix (P4)

Maps adversarial CSV tests in `src/lib/import/secure-csv.security.test.ts` to controls.

| # | Threat | Input | Expected rejection | Error pattern | Persistence | Audit | Test | Status |
|---|--------|-------|-------------------|---------------|---------------|-------|------|--------|
| 1 | Empty upload | Zero-byte / empty string | Reject before parse | parse errors | None | N/A | `rejects empty and zero-byte files` | pass |
| 2 | Oversize file | > maxBytes | Reject | size/bytes | None | N/A | `rejects oversize files` | pass |
| 3 | Boundary size | At maxBytes with valid shape | Accept if within row limits | — | Quarantine only | N/A | `accepts exactly maxBytes boundary` | pass |
| 4 | Invalid UTF-8 | Binary invalid sequences | Reject | parse errors | None | N/A | `rejects invalid UTF-8 sequences` | pass |
| 5 | UTF-16 BOM | UTF-16LE content | Reject | parse errors | None | N/A | `rejects UTF-16 BOM content` | pass |
| 6 | Binary masquerade | PK/ZIP magic bytes | Reject | parse errors | None | N/A | `rejects binary content renamed as CSV` | pass |
| 7 | Header attacks | Missing/duplicate/unknown headers | Reject | header errors | None | N/A | `rejects missing, duplicate, and unknown headers` | pass |
| 8 | Header reorder | Valid columns reordered | Accept | — | Quarantine | N/A | `accepts reordered valid headers` | pass |
| 9 | Row/column bomb | Too many rows/columns | Reject | limit errors | None | N/A | `rejects too many rows and columns` | pass |
| 10 | Formula injection | `=CMD`, `+HYPERLINK` cells | Flag/reject formula-like | formula detection | None | N/A | `detects formula-like cells` | pass |
| 11 | Null byte injection | `\0` in cell | Reject | null byte | None | N/A | `rejects null bytes in content` | pass |
| 12 | Row width mismatch | Extra/missing fields | Reject row | width mismatch | None | N/A | `rejects rows with incorrect field count` | pass |
| 13 | Duplicate source IDs | Same `source_transaction_id` | Reject duplicate | duplicate | None | N/A | `rejects duplicate source_transaction_id in file` | pass |
| 14 | Invalid dates | Non-ISO dates | Reject | date validation | None | N/A | `rejects invalid transaction dates` | pass |
| 15 | Invalid amounts | Non-numeric / overflow | Reject | amount validation | None | N/A | `rejects invalid amounts` | pass |
| 16 | CRLF / quoting | Escaped quotes, CRLF rows | Accept valid RFC4180 | — | Quarantine | N/A | `parses quoted fields and CRLF` | pass |
| 17 | Hash stability | Identical content | Deterministic row hash | — | Quarantine | N/A | `produces stable row content hash` | pass |

## Spreadsheet tests

No direct `.xlsx` upload in P4 production path — Excel export is server-generated only. CSV import is the adversarial surface.

## Posting boundary

Parsed rows land in quarantine (`import_batches` / staging). `rpc_import_post_batch` requires finance approval — no automatic posting from upload alone.

## CI

`npm run test:import-security` — 17 tests, zero retries in evidence sequence.
