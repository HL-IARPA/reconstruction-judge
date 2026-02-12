/**
 * Report generator for judge outputs
 */

import type { JudgeOutput, AggregateStats } from './types.js';

export function generateReport(output: JudgeOutput): string {
  const lines: string[] = [];

  lines.push(`# Evaluation Report: ${output.doc_id}`);
  lines.push('');
  lines.push(`**Timestamp:** ${output.timestamp}`);
  lines.push(`**Model:** ${output.metadata.model}`);
  lines.push(`**Tokens:** ${output.metadata.total_tokens} | **Cost:** $${output.metadata.cost_usd.toFixed(4)}`);
  lines.push('');

  // Summary metrics
  const m = output.calculated_metrics;
  lines.push('## Summary Metrics');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total Claims | ${m.total_claims} |`);
  lines.push(`| Average Score | ${m.average_score.toFixed(2)}/10 |`);
  lines.push(`| Weighted Average | ${m.weighted_average_score.toFixed(2)}/10 |`);
  lines.push(`| Fully Reconstructed (8+) | ${m.fully_reconstructed} (${((m.fully_reconstructed / m.total_claims) * 100).toFixed(1)}%) |`);
  lines.push(`| Partially Reconstructed (4-7) | ${m.partially_reconstructed} (${((m.partially_reconstructed / m.total_claims) * 100).toFixed(1)}%) |`);
  lines.push(`| Not Reconstructed (<4) | ${m.not_reconstructed} (${((m.not_reconstructed / m.total_claims) * 100).toFixed(1)}%) |`);
  lines.push('');

  // By claim type
  lines.push('### By Claim Type');
  lines.push('');
  lines.push('| Type | Count | Avg Score |');
  lines.push('|------|-------|-----------|');
  for (const [type, stats] of Object.entries(m.by_type)) {
    lines.push(`| ${type} | ${stats.count} | ${stats.average_score.toFixed(2)} |`);
  }
  lines.push('');

  // By importance
  lines.push('### By Importance');
  lines.push('');
  lines.push('| Importance | Count | Avg Score |');
  lines.push('|------------|-------|-----------|');
  for (const [imp, stats] of Object.entries(m.by_importance).sort((a, b) => Number(b[0]) - Number(a[0]))) {
    const stars = '★'.repeat(Number(imp)) + '☆'.repeat(5 - Number(imp));
    lines.push(`| ${stars} (${imp}) | ${stats.count} | ${stats.average_score.toFixed(2)} |`);
  }
  lines.push('');

  // Individual claim evaluations
  lines.push('## Claim Evaluations');
  lines.push('');

  // Sort by score (lowest first to highlight failures)
  const sortedEvals = [...output.claim_evaluations].sort((a, b) => a.score - b.score);

  for (const e of sortedEvals) {
    const scoreEmoji = e.score >= 8 ? '🟢' : e.score >= 4 ? '🟡' : '🔴';
    const stars = '★'.repeat(e.importance) + '☆'.repeat(5 - e.importance);

    lines.push(`### ${e.claim_id}: ${scoreEmoji} ${e.score}/10`);
    lines.push('');
    lines.push(`**Type:** ${e.claim_type} | **Importance:** ${stars}`);
    lines.push('');
    lines.push(`> ${e.claim_text}`);
    lines.push('');
    lines.push(`**Justification:** ${e.justification}`);
    lines.push('');
    if (e.evidence_refs.length > 0) {
      lines.push(`**Evidence from:** ${e.evidence_refs.join(', ')}`);
      lines.push('');
    }
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

export function generateAggregateReport(stats: AggregateStats): string {
  const lines: string[] = [];

  lines.push('# Aggregate Evaluation Report');
  lines.push('');
  lines.push(`**Total Documents:** ${stats.total_documents}`);
  lines.push(`**Total Claims:** ${stats.total_claims}`);
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push('');

  // Overall metrics
  lines.push('## Overall Results');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Average Score | ${stats.overall.average_score.toFixed(2)}/10 |`);
  lines.push(`| Weighted Average | ${stats.overall.weighted_average_score.toFixed(2)}/10 |`);
  lines.push(`| Fully Reconstructed (8+) | ${stats.overall.pct_fully_reconstructed.toFixed(1)}% |`);
  lines.push(`| Partially Reconstructed (4-7) | ${stats.overall.pct_partially_reconstructed.toFixed(1)}% |`);
  lines.push(`| Not Reconstructed (<4) | ${stats.overall.pct_not_reconstructed.toFixed(1)}% |`);
  lines.push('');

  // By claim type
  lines.push('## By Claim Type');
  lines.push('');
  lines.push('| Type | Count | Avg Score | % Reconstructed |');
  lines.push('|------|-------|-----------|-----------------|');
  for (const [type, data] of Object.entries(stats.by_claim_type).sort((a, b) => b[1].average_score - a[1].average_score)) {
    lines.push(`| ${type} | ${data.count} | ${data.average_score.toFixed(2)} | ${data.pct_reconstructed.toFixed(1)}% |`);
  }
  lines.push('');

  // By importance
  lines.push('## By Importance Level');
  lines.push('');
  lines.push('| Importance | Count | Avg Score | % Reconstructed |');
  lines.push('|------------|-------|-----------|-----------------|');
  for (const [imp, data] of Object.entries(stats.by_importance).sort((a, b) => Number(b[0]) - Number(a[0]))) {
    const stars = '★'.repeat(Number(imp)) + '☆'.repeat(5 - Number(imp));
    lines.push(`| ${stars} | ${data.count} | ${data.average_score.toFixed(2)} | ${data.pct_reconstructed.toFixed(1)}% |`);
  }
  lines.push('');

  // Per-document breakdown
  lines.push('## Per-Document Results');
  lines.push('');
  lines.push('| Document | Claims | Avg Score | Weighted Avg |');
  lines.push('|----------|--------|-----------|--------------|');
  for (const doc of stats.by_document.sort((a, b) => b.weighted_average_score - a.weighted_average_score)) {
    lines.push(`| ${doc.doc_id} | ${doc.claim_count} | ${doc.average_score.toFixed(2)} | ${doc.weighted_average_score.toFixed(2)} |`);
  }
  lines.push('');

  // Key findings
  lines.push('## Key Findings');
  lines.push('');

  // Best/worst claim types
  const typesSorted = Object.entries(stats.by_claim_type).sort((a, b) => b[1].average_score - a[1].average_score);
  if (typesSorted.length > 0) {
    const best = typesSorted[0];
    const worst = typesSorted[typesSorted.length - 1];
    lines.push(`- **Most reconstructable claim type:** ${best[0]} (avg: ${best[1].average_score.toFixed(2)})`);
    lines.push(`- **Least reconstructable claim type:** ${worst[0]} (avg: ${worst[1].average_score.toFixed(2)})`);
  }

  // Important vs unimportant
  const imp5 = stats.by_importance[5];
  const imp1 = stats.by_importance[1];
  if (imp5 && imp1) {
    lines.push(`- **High importance (5★) claims:** ${imp5.average_score.toFixed(2)} avg score`);
    lines.push(`- **Low importance (1★) claims:** ${imp1.average_score.toFixed(2)} avg score`);
  }

  return lines.join('\n');
}

export function calculateAggregateStats(outputs: JudgeOutput[]): AggregateStats {
  const allEvals = outputs.flatMap((o) => o.claim_evaluations);
  const total = allEvals.length;

  if (total === 0) {
    return {
      total_documents: 0,
      total_claims: 0,
      overall: {
        average_score: 0,
        weighted_average_score: 0,
        pct_fully_reconstructed: 0,
        pct_partially_reconstructed: 0,
        pct_not_reconstructed: 0,
      },
      by_claim_type: {},
      by_importance: {},
      by_document: [],
    };
  }

  // Overall
  const avgScore = allEvals.reduce((s, e) => s + e.score, 0) / total;
  const totalWeight = allEvals.reduce((s, e) => s + e.importance, 0);
  const weightedAvg = totalWeight > 0
    ? allEvals.reduce((s, e) => s + e.score * e.importance, 0) / totalWeight
    : avgScore;

  const fullyReconstructed = allEvals.filter((e) => e.score >= 8).length;
  const partiallyReconstructed = allEvals.filter((e) => e.score >= 4 && e.score < 8).length;
  const notReconstructed = allEvals.filter((e) => e.score < 4).length;

  // By type
  const by_claim_type: AggregateStats['by_claim_type'] = {};
  const types = [...new Set(allEvals.map((e) => e.claim_type))];
  for (const type of types) {
    const typeEvals = allEvals.filter((e) => e.claim_type === type);
    by_claim_type[type] = {
      count: typeEvals.length,
      average_score: typeEvals.reduce((s, e) => s + e.score, 0) / typeEvals.length,
      pct_reconstructed: (typeEvals.filter((e) => e.score >= 8).length / typeEvals.length) * 100,
    };
  }

  // By importance
  const by_importance: AggregateStats['by_importance'] = {};
  const importances = [...new Set(allEvals.map((e) => e.importance))];
  for (const imp of importances) {
    const impEvals = allEvals.filter((e) => e.importance === imp);
    by_importance[imp] = {
      count: impEvals.length,
      average_score: impEvals.reduce((s, e) => s + e.score, 0) / impEvals.length,
      pct_reconstructed: (impEvals.filter((e) => e.score >= 8).length / impEvals.length) * 100,
    };
  }

  // By document
  const by_document = outputs.map((o) => ({
    doc_id: o.doc_id,
    claim_count: o.calculated_metrics.total_claims,
    average_score: o.calculated_metrics.average_score,
    weighted_average_score: o.calculated_metrics.weighted_average_score,
  }));

  return {
    total_documents: outputs.length,
    total_claims: total,
    overall: {
      average_score: avgScore,
      weighted_average_score: weightedAvg,
      pct_fully_reconstructed: (fullyReconstructed / total) * 100,
      pct_partially_reconstructed: (partiallyReconstructed / total) * 100,
      pct_not_reconstructed: (notReconstructed / total) * 100,
    },
    by_claim_type,
    by_importance,
    by_document,
  };
}
