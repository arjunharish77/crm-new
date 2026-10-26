# Fee re-check for the new batch (12 October 2026)

The owner reported that fees changed for the new batch. All 30 programs were re-read from their official program pages on 12 October 2026. Each page was fetched directly (HTTP 200) with no forms submitted. Amounts are base tuition before promotional discounts. Structured observations, page hashes and every category panel are in [FEE_RECHECK_2026-10-12.json](FEE_RECHECK_2026-10-12.json).

## Changed (Indian applicants, INR)

| Program | Catalog | New batch | Semester payments |
|---|---:|---:|---|
| [MUJ Online MBA](https://www.onlinemanipal.com/online-mba-manipal-university-jaipur) | ₹1,80,000 | **₹1,84,000** | 4 × ₹46,000 |
| [MUJ Online BBA](https://www.onlinemanipal.com/online-bba-degree-muj) | ₹1,39,500 | **₹1,44,000** | 6 × ₹24,000 |
| [MUJ Online BCA](https://www.onlinemanipal.com/online-bca-degree-muj) | ₹1,39,500 | **₹1,44,000** | 6 × ₹24,000 |
| [MUJ Online MCA](https://www.onlinemanipal.com/online-mca-degree-muj) | ₹1,58,000 | **₹1,64,000** | 4 × ₹41,000 |
| [MUJ Online B.Com](https://www.onlinemanipal.com/online-bcom-degree-muj) | ₹99,000 | **₹1,05,000** | 6 × ₹17,500 |
| [MUJ Online MSc Mathematics](https://www.onlinemanipal.com/online-msc-mathematics-muj) | ₹80,000 | **₹84,000** | 4 × ₹21,000 |

Amity MA JMC still lists ₹1,90,000 against the catalog's ₹1,30,000. That correction was prepared on 3 October and is unchanged.

## Unchanged

- **MUJ:** M.Com ₹1,08,000; MA Economics ₹80,000; MA JMC ₹80,000.
- **SMU:** all nine programs.
- **Amity:** the other eleven programs.
- **NRI and foreign-national (USD) schedules:** the same as on 3 October for every MUJ and SMU program.

## Notes

- The MUJ 2026-27 combined prospectus PDF is byte-for-byte the file read on 3 October and still prints the earlier Indian fees. The program pages are the newer source, so the updated category-fee drafts cite them. Confirm with MUJ which batch the new fees apply to.
- Online Manipal's quoted "no-cost EMI starting" amounts are calculated on discounted prices. The site keeps its own convention: listed fee ÷ program months. The new figures are MBA ₹7,667, BBA and BCA ₹4,000, MCA ₹6,833, B.Com ₹2,917 and MSc Mathematics ₹3,500 per month.
- Nothing is published. The changes are six prepared fee corrections (`src/data/prepared-fee-corrections.json`) and updated MUJ applicant-category drafts (`src/data/prepared-category-fees.json`). In **CMS → Catalog revisions**, an administrator:
  1. loads **Load coordinated fee correction**;
  2. then loads **Load student-category fees**;
  3. reviews and submits;
  4. publishes from **Publishing checklist**.
