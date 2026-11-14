# Test Fixtures

All PDF and negative test fixtures in this directory are **synthetic** and generated programmatically by `/tests/generate-fixtures.ts` (`pdf-lib`):

- `fixture-synthetic-text.pdf`: 3 pages of plain English synthetic contract-style filler text.
- `fixture-synthetic-no-text.pdf`: 3 pages containing only drawn vector shapes (no text layer).
- `fixture-synthetic-renamed-txt.pdf`: Plain text content saved with a `.pdf` extension (`not_pdf` negative case).
- `fixture-synthetic-empty.pdf`: 0-byte empty file (`not_pdf` negative case).
