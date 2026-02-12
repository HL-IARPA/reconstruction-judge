/**
 * Reconstruction Judge (Stage 3)
 *
 * Evaluates each claim's reconstruction quality with a 0-10 score,
 * then calculates aggregate metrics programmatically.
 *
 * USAGE:
 *   # Process single document
 *   npx tsx src/index.ts --reconstruction-dir ../document-reconstructor/output \
 *       --claims-dir ../query-claim-extraction-testing/output-csv-targets \
 *       --doc-id 1976SINGAP02176
 *
 *   # Process all documents
 *   npx tsx src/index.ts --reconstruction-dir ../document-reconstructor/output \
 *       --claims-dir ../query-claim-extraction-testing/output-csv-targets \
 *       --all
 *
 *   # Generate aggregate stats only
 *   npx tsx src/index.ts --aggregate
 */

import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';
import { judge } from './judge.js';
import {
  generateReport,
  generateAggregateReport,
  calculateAggregateStats,
} from './report-generator.js';
import type { Stage1Output, ReconstructorOutput, JudgeOutput } from './types.js';

// Load environment variables
config();

interface CLIOptions {
  reconstructionDir?: string;
  claimsDir?: string;
  docId?: string;
  all?: boolean;
  aggregate?: boolean;
  outputDir?: string;
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {
    outputDir: './output',
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--reconstruction-dir':
        options.reconstructionDir = args[++i];
        break;
      case '--claims-dir':
        options.claimsDir = args[++i];
        break;
      case '--doc-id':
        options.docId = args[++i];
        break;
      case '--all':
        options.all = true;
        break;
      case '--aggregate':
        options.aggregate = true;
        break;
      case '--output':
        options.outputDir = args[++i];
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║           RECONSTRUCTION JUDGE (Stage 3)                         ║
║                                                                  ║
║  Evaluates claim reconstruction quality with 0-10 scores         ║
║  and calculates aggregate metrics                                ║
╚══════════════════════════════════════════════════════════════════╝

REQUIRED (for processing):
  --reconstruction-dir <path>   Directory with Stage 2 outputs
  --claims-dir <path>           Directory with Stage 1 outputs

INPUT SELECTION:
  --doc-id <id>                 Process single document by ID
  --all                         Process all documents with reconstructions

AGGREGATE:
  --aggregate                   Generate aggregate stats from existing outputs

OPTIONS:
  --output <dir>                Output directory (default: ./output)
  --help, -h                    Show this help

OUTPUTS:
  For each document:
    - <doc_id>.json             Evaluation with calculated metrics
    - <doc_id>.md               Human-readable report

  Combined:
    - evaluations.jsonl         All outputs as JSON lines
    - aggregate-stats.json      Cross-document statistics
    - aggregate-report.md       Summary analysis

EXAMPLE:
  npx tsx src/index.ts \\
    --reconstruction-dir ../document-reconstructor/output \\
    --claims-dir ../query-claim-extraction-testing/output-csv-targets \\
    --all
`);
}

function loadStage1Output(claimsDir: string, docId: string): Stage1Output | null {
  const jsonPath = path.join(claimsDir, `${docId}.json`);
  if (!fs.existsSync(jsonPath)) return null;

  try {
    return JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as Stage1Output;
  } catch {
    return null;
  }
}

function loadReconstruction(reconstructionDir: string, docId: string): ReconstructorOutput | null {
  const jsonPath = path.join(reconstructionDir, `${docId}.json`);
  if (!fs.existsSync(jsonPath)) return null;

  try {
    return JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as ReconstructorOutput;
  } catch {
    return null;
  }
}

function loadAllJudgeOutputs(outputDir: string): JudgeOutput[] {
  const outputs: JudgeOutput[] = [];

  const files = fs.readdirSync(outputDir).filter((f) => f.endsWith('.json') && f !== 'aggregate-stats.json');

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(outputDir, file), 'utf-8');
      const output = JSON.parse(content) as JudgeOutput;
      if (output.claim_evaluations && output.calculated_metrics) {
        outputs.push(output);
      }
    } catch {
      // Skip invalid files
    }
  }

  return outputs;
}

function getAvailableDocIds(reconstructionDir: string): string[] {
  return fs
    .readdirSync(reconstructionDir)
    .filter((f) => f.endsWith('.json') && f !== 'reconstructions.jsonl')
    .map((f) => f.replace('.json', ''));
}

async function processDocument(
  docId: string,
  claimsDir: string,
  reconstructionDir: string
): Promise<JudgeOutput | null> {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Evaluating: ${docId}`);

  // Load Stage 1 output (claims)
  const stage1 = loadStage1Output(claimsDir, docId);
  if (!stage1) {
    console.log(`  ❌ No Stage 1 output found for ${docId}`);
    return null;
  }
  console.log(`  📋 Claims: ${stage1.claims.length}`);

  // Load reconstruction
  const reconstruction = loadReconstruction(reconstructionDir, docId);
  if (!reconstruction) {
    console.log(`  ❌ No reconstruction found for ${docId}`);
    return null;
  }
  console.log(`  📝 Reconstruction: ${reconstruction.answered_questions.length} answers`);

  // Run judge
  console.log(`  ⚖️  Judging...`);
  const startTime = Date.now();

  try {
    const { data: output, tokens, cost_usd } = await judge(stage1.claims, reconstruction);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    const m = output.calculated_metrics;

    console.log(`  ✅ Complete in ${elapsed}s`);
    console.log(`  📊 Avg Score: ${m.average_score.toFixed(2)}/10 | Weighted: ${m.weighted_average_score.toFixed(2)}/10`);
    console.log(`  🟢 Full: ${m.fully_reconstructed} | 🟡 Partial: ${m.partially_reconstructed} | 🔴 None: ${m.not_reconstructed}`);
    console.log(`  💰 Tokens: ${tokens} | Cost: $${cost_usd.toFixed(4)}`);

    return output;
  } catch (error) {
    console.error(`  ❌ Judging failed:`, error);
    return null;
  }
}

async function main(): Promise<void> {
  const options = parseArgs();

  // Ensure output directory exists
  fs.mkdirSync(options.outputDir!, { recursive: true });

  // Aggregate mode
  if (options.aggregate) {
    console.log('📊 Generating aggregate statistics...');
    const outputs = loadAllJudgeOutputs(options.outputDir!);

    if (outputs.length === 0) {
      console.error('❌ No evaluation outputs found');
      process.exit(1);
    }

    const stats = calculateAggregateStats(outputs);

    // Write aggregate stats
    const statsPath = path.join(options.outputDir!, 'aggregate-stats.json');
    fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));

    const reportPath = path.join(options.outputDir!, 'aggregate-report.md');
    fs.writeFileSync(reportPath, generateAggregateReport(stats));

    console.log(`✅ Generated aggregate stats from ${outputs.length} documents`);
    console.log(`   - ${statsPath}`);
    console.log(`   - ${reportPath}`);
    return;
  }

  // Validate required options
  if (!options.reconstructionDir) {
    console.error('❌ --reconstruction-dir is required');
    process.exit(1);
  }

  if (!options.claimsDir) {
    console.error('❌ --claims-dir is required');
    process.exit(1);
  }

  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║           RECONSTRUCTION JUDGE (Stage 3)                         ║
╚══════════════════════════════════════════════════════════════════╝
`);
  console.log(`📁 Reconstructions: ${options.reconstructionDir}`);
  console.log(`📁 Claims: ${options.claimsDir}`);
  console.log(`📂 Output: ${options.outputDir}`);

  // Determine which documents to process
  let docIds: string[] = [];

  if (options.docId) {
    docIds = [options.docId];
  } else if (options.all) {
    docIds = getAvailableDocIds(options.reconstructionDir);
  } else {
    console.error('❌ Specify --doc-id <id> or --all');
    process.exit(1);
  }

  console.log(`📄 Documents to evaluate: ${docIds.length}`);

  // Process each document
  const results: JudgeOutput[] = [];
  let totalCost = 0;

  for (let i = 0; i < docIds.length; i++) {
    const docId = docIds[i];
    console.log(`\n[${i + 1}/${docIds.length}]`);

    const result = await processDocument(docId, options.claimsDir, options.reconstructionDir);

    if (result) {
      results.push(result);
      totalCost += result.metadata.cost_usd;

      // Write individual outputs
      const jsonPath = path.join(options.outputDir!, `${result.doc_id}.json`);
      fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));

      const mdPath = path.join(options.outputDir!, `${result.doc_id}.md`);
      fs.writeFileSync(mdPath, generateReport(result));

      console.log(`  📄 Saved: ${result.doc_id}.json, ${result.doc_id}.md`);
    }
  }

  // Write combined outputs
  if (results.length > 0) {
    // JSONL
    const jsonlPath = path.join(options.outputDir!, 'evaluations.jsonl');
    const jsonl = results.map((r) => JSON.stringify(r)).join('\n');
    fs.writeFileSync(jsonlPath, jsonl);

    // Aggregate stats
    const stats = calculateAggregateStats(results);
    const statsPath = path.join(options.outputDir!, 'aggregate-stats.json');
    fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));

    const reportPath = path.join(options.outputDir!, 'aggregate-report.md');
    fs.writeFileSync(reportPath, generateAggregateReport(stats));

    // Final summary
    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                         SUMMARY                                  ║
╚══════════════════════════════════════════════════════════════════╝
`);
    console.log(`✓ Evaluated: ${results.length} documents`);
    console.log(`✓ Total claims: ${stats.total_claims}`);
    console.log(`✓ Overall avg score: ${stats.overall.average_score.toFixed(2)}/10`);
    console.log(`✓ Weighted avg score: ${stats.overall.weighted_average_score.toFixed(2)}/10`);
    console.log(`✓ Fully reconstructed: ${stats.overall.pct_fully_reconstructed.toFixed(1)}%`);
    console.log(`✓ Partially reconstructed: ${stats.overall.pct_partially_reconstructed.toFixed(1)}%`);
    console.log(`✓ Not reconstructed: ${stats.overall.pct_not_reconstructed.toFixed(1)}%`);
    console.log(`✓ Total cost: $${totalCost.toFixed(4)}`);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
