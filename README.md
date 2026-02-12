# Reconstruction Judge

Stage 3 of the document reconstruction pipeline. Evaluates how well the Stage 2 reconstruction captured the original claims from a target document.

## How It Works

1. Takes original claims (ground truth from Stage 1) and reconstruction attempts (from Stage 2)
2. LLM scores each claim on a 0-10 scale based on how well it was reconstructed
3. Programmatically calculates aggregate metrics (the LLM only scores, code does math)

### Scoring Rubric

| Score | Meaning |
|-------|---------|
| 10 | Perfect - all details exactly correct |
| 8-9 | Substantially correct - minor omissions |
| 6-7 | Mostly correct - some inaccuracies |
| 4-5 | Partial - gist correct but significant gaps |
| 2-3 | Weak - vaguely related but largely wrong |
| 1 | Minimal - topic touched but point missed |
| 0 | Not reconstructed at all |

## Installation

```bash
npm install
```

Create a `.env` file with your API key:
```
GEMINI_API_KEY=your_key_here
```

## Usage

```bash
# Process single document
npx tsx src/index.ts \
  --reconstruction-dir ../document-reconstructor/output \
  --claims-dir ../query-claim-extraction-testing/output-csv-targets \
  --doc-id 1976SINGAP02176

# Batch process all available documents
npx tsx src/index.ts \
  --reconstruction-dir ../document-reconstructor/output \
  --claims-dir ../query-claim-extraction-testing/output-csv-targets \
  --all

# Generate aggregate statistics (after processing)
npx tsx src/index.ts --aggregate
```

## Output

```
output/
├── {doc_id}.json         # Full evaluation with calculated metrics
├── {doc_id}.md           # Human-readable report
├── evaluations.jsonl     # Append-only processing log
├── aggregate-stats.json  # Cross-document statistics
└── aggregate-report.md   # Summary analysis
```

### Calculated Metrics

- **Average score** - Mean of all claim scores
- **Weighted average** - Weighted by claim importance
- **Reconstruction thresholds**:
  - Fully reconstructed: score >= 8
  - Partially reconstructed: score 4-7
  - Not reconstructed: score < 4
- Breakdowns by claim type and importance level

## Pipeline Context

This is **Stage 3** of a 3-stage pipeline:

1. **Claim Extraction** - Extract claims from target documents and generate questions
2. **Document Reconstructor** - Blind reconstruction from similar documents
3. **Reconstruction Judge** (this repo) - Evaluate reconstruction accuracy against ground truth
