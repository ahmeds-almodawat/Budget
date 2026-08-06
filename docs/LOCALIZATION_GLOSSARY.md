# Localization Glossary (COD-M-010)

## Status

**Partially implemented.** Forecasts, authentication, and navigation keys are cataloged. Many routes still use inline `locale === "ar"` ternaries.

## Catalogs

- `messages/en.json`
- `messages/ar.json`

## Terminology (EN → AR)

| English | Arabic | Notes |
|---------|--------|-------|
| Legal entity | الكيان القانوني | Tenant selector |
| Control scope | نطاق الرقابة | Budget/forecast boundary |
| Budget version | إصدار الميزانية | Versioned baseline |
| Budget change | تغيير الميزانية | Change request workflow |
| Actual | فعلي | Posted transaction |
| Reversal | عكس | Signed reversal |
| Commitment | التزام | Open commitment value |
| Forecast | توقع | Forecast version |
| Earned value | القيمة المكتسبة | EVM metric |
| Approval | اعتماد | Workflow action |
| Import batch | دفعة استيراد | CSV import |
| Fiscal period | الفترة المالية | MTD/YTD boundary |

## Formatting rules

| Type | Rule |
|------|------|
| Currency | SAR with locale-appropriate grouping |
| Percentages | Locale numeral + `%` |
| Dates | `ar-SA` / `en-GB` via `next-intl` |
| `html lang` / `dir` | Set in `[locale]/layout.tsx` |
| Source ERP data | Not translated |

## Remaining work

- Migrate inline locale ternaries in ~35 component files
- Route-wide bilingual smoke tests
- Exported filename localization
- ARIA label catalog completion
