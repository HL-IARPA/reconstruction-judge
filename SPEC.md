# Reconstruction Judge (Stage 3)

## Purpose

Evaluate how well the Stage 2 reconstruction captured the original claims. The LLM judges each claim individually with a score, then we calculate overall metrics programmatically.

**Key principle**: The LLM scores individual claims objectively. We compute percentages.

## Input

```typescript
interface JudgeInput {
  doc_id: string;

  // Ground truth (from Stage 1)
  original_claims: Claim[];
  target_document: string;  // Original cable text (for reference)

  // Reconstruction attempt (from Stage 2)
  reconstruction: ReconstructorOutput;
}
```

## Evaluation Approach

### Per-Claim Scoring

For each original claim, the LLM evaluates:

1. **Was this claim reconstructed?**
   - Match the reconstruction answers/synthesis against this specific claim

2. **Score (0-10)**:
   | Score | Meaning |
   |-------|---------|
   | 10 | Perfect reconstruction - all details correct |
   | 8-9 | Substantially correct - minor details missing |
   | 6-7 | Mostly correct - some inaccuracies or gaps |
   | 4-5 | Partial - got the gist but significant errors |
   | 2-3 | Weak - vaguely related but largely wrong |
   | 1 | Minimal - touched on topic but missed the point |
   | 0 | Not reconstructed at all |

3. **Brief justification** (1-2 sentences explaining the score)

4. **Evidence reference** (which answer(s) from Stage 2 contain this info, if any)

### What the LLM Does NOT Do

- Does NOT compute overall percentages
- Does NOT weight claims by importance (we do that)
- Does NOT make subjective "mosaic theory" judgments
- Just scores each claim objectively

## Prompt Strategy

```
You are evaluating a document reconstruction exercise.

TASK: For each original claim, determine how well it was reconstructed
from the analyst's answers below.

ORIGINAL CLAIMS (Ground Truth):
[c1] {claim_text}
[c2] {claim_text}
...

RECONSTRUCTION ATTEMPT (what the analyst produced):
Question Answers:
- Q1: {answer}
- Q2: {answer}
...

Synthesis:
{synthesis}

---

For EACH claim, provide:
1. score: 0-10 (see rubric)
2. justification: 1-2 sentences explaining the score
3. evidence: which answer(s) or part of synthesis supports this (or "none")

SCORING RUBRIC:
- 10: Perfect - all details exactly correct
- 8-9: Substantially correct - minor omissions
- 6-7: Mostly correct - some inaccuracies
- 4-5: Partial - gist correct but significant gaps
- 2-3: Weak - vaguely related but largely wrong
- 1: Minimal - topic touched but point missed
- 0: Not reconstructed

Output as JSON array.
```

## Output Format

```typescript
interface JudgeOutput {
  doc_id: string;
  timestamp: string;

  // LLM-produced scores
  claim_evaluations: ClaimEvaluation[];

  // Programmatically calculated (NOT from LLM)
  calculated_metrics: {
    total_claims: number;

    // Raw scores
    average_score: number;           // Mean of all claim scores
    weighted_average_score: number;  // Weighted by claim importance

    // Thresholds
    fully_reconstructed: number;     // score >= 8
    partially_reconstructed: number; // score 4-7
    not_reconstructed: number;       // score < 4

    // By claim type
    by_type: {
      [type: string]: {
        count: number;
        average_score: number;
      };
    };

    // By importance
    by_importance: {
      [importance: number]: {
        count: number;
        average_score: number;
      };
    };
  };

  metadata: {
    model: string;
    total_tokens: number;
    cost_usd: number;
  };
}

interface ClaimEvaluation {
  claim_id: string;
  claim_text: string;
  claim_type: string;
  importance: number;

  // LLM-produced
  score: number;           // 0-10
  justification: string;   // 1-2 sentences
  evidence_refs: string[]; // e.g., ["q3", "synthesis"]
}
```

## CLI Interface

```bash
# Process single document
npx tsx src/index.ts \
  --reconstruction-dir ../document-reconstructor/output \
  --claims-dir ../query-claim-extraction-testing/output-csv-targets \
  --doc-id 1976SINGAP02176

# Batch process all
npx tsx src/index.ts \
  --reconstruction-dir ../document-reconstructor/output \
  --claims-dir ../query-claim-extraction-testing/output-csv-targets \
  --all

# Generate aggregate stats only (after processing)
npx tsx src/index.ts --aggregate
```

## Output Files

```
output/
├── {doc_id}.json              # Full evaluation with calculated metrics
├── {doc_id}.md                # Human-readable report
├── evaluations.jsonl          # Append-only log
├── aggregate-stats.json       # Cross-document statistics
└── aggregate-report.md        # Summary analysis
```

## Aggregate Statistics (Programmatic)

After processing all documents, compute:

```typescript
interface AggregateStats {
  total_documents: number;
  total_claims: number;

  overall: {
    average_score: number;
    weighted_average_score: number;

    pct_fully_reconstructed: number;     // % claims scoring 8+
    pct_partially_reconstructed: number; // % claims scoring 4-7
    pct_not_reconstructed: number;       // % claims scoring <4
  };

  by_claim_type: {
    [type: string]: {
      count: number;
      average_score: number;
      pct_reconstructed: number;  // 8+ threshold
    };
  };

  by_importance: {
    [importance: number]: {
      count: number;
      average_score: number;
      pct_reconstructed: number;
    };
  };

  by_document: {
    doc_id: string;
    claim_count: number;
    average_score: number;
  }[];
}
```

## Implementation Notes

1. **Separation of concerns**: LLM does qualitative assessment, code does math
2. **Claim matching**: LLM sees both original claims and reconstruction side-by-side
3. **No double-dipping**: Target document shown for reference only, not to help scoring
4. **Deterministic metrics**: Same input → same calculated percentages

## Grading Rubric Details (for prompt)

| Score | Description | Example |
|-------|-------------|---------|
| 10 | Exact match - all entities, dates, relationships correct | "USMISSION NATO believes X" reconstructed as "The US mission to NATO assesses X" |
| 8-9 | Correct substance, minor details missing | Got the policy position right but missed the specific committee name |
| 6-7 | Right direction, some errors | Identified the concern but attributed it to wrong party |
| 4-5 | Partial credit - gist present | Mentioned troop reductions but wrong numbers/timeline |
| 2-3 | Tangentially related | Discussed NATO broadly but missed the specific claim |
| 1 | Barely relevant | Mentioned one entity from the claim, nothing else |
| 0 | Not present | No reconstruction attempt covers this claim |

## Dependencies

- Same as stages 1-2
- Reads from both stage 1 and stage 2 output directories
