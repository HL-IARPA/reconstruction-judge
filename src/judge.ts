/**
 * Core judging logic
 *
 * Evaluates each original claim against the reconstruction attempt,
 * assigning a score from 0-10 with justification.
 */

import { callGemini } from './gemini.js';
import type {
  Claim,
  ReconstructorOutput,
  ClaimEvaluation,
  CalculatedMetrics,
  JudgeOutput,
  LLMResponse,
} from './types.js';

const SYSTEM_PROMPT = `You are evaluating a document reconstruction exercise.

An analyst was given research questions (but NOT the original document or claims) and a set of related documents. They attempted to answer the questions and synthesize what they learned.

Your task: For each original claim, determine how well it was reconstructed from the analyst's answers and synthesis.

SCORING RUBRIC (0-10):
- 10: Perfect - all details exactly correct, fully reconstructed
- 8-9: Substantially correct - minor omissions or slight imprecision
- 6-7: Mostly correct - main point captured but some inaccuracies or gaps
- 4-5: Partial - gist is correct but significant details missing or wrong
- 2-3: Weak - vaguely related content but largely missed the point
- 1: Minimal - topic barely touched, almost nothing correct
- 0: Not reconstructed - no relevant information found

IMPORTANT:
- Be strict and objective
- A claim is only "fully reconstructed" (8+) if the SPECIFIC information is present
- General discussion of the topic does NOT count as reconstruction
- Partial credit is for when specific details are partially captured

OUTPUT FORMAT (JSON):
{
  "evaluations": [
    {
      "claim_id": "c1",
      "score": 7,
      "justification": "The reconstruction captured X and Y but missed Z",
      "evidence_refs": ["t3", "q2", "synthesis"]
    }
  ]
}`;

function buildUserPrompt(
  claims: Claim[],
  reconstruction: ReconstructorOutput
): string {
  // Format claims
  const claimsText = claims
    .map((c) => `[${c.claim_id}] (${c.claim_type}, importance: ${c.importance})\n${c.claim_text}`)
    .join('\n\n');

  // Format reconstruction answers
  const answersText = reconstruction.answered_questions
    .map((q) => {
      const answer = q.answer || '(Unable to answer)';
      const confidence = q.confidence;
      return `[${q.question_id}] ${q.question_text}\nAnswer (${confidence}): ${answer}`;
    })
    .join('\n\n');

  return `ORIGINAL CLAIMS (Ground Truth - these are what the analyst should have reconstructed):

${claimsText}

${'═'.repeat(60)}

RECONSTRUCTION ATTEMPT (what the analyst produced from related documents):

QUESTION ANSWERS:
${answersText}

SYNTHESIS:
${reconstruction.synthesis}

${'═'.repeat(60)}

For each claim above, evaluate how well it was reconstructed. Output as JSON.`;
}

interface RawLLMOutput {
  evaluations: {
    claim_id: string;
    score: number;
    justification: string;
    evidence_refs: string[];
  }[];
}

/**
 * Calculate metrics from claim evaluations
 */
function calculateMetrics(
  claims: Claim[],
  evaluations: ClaimEvaluation[]
): CalculatedMetrics {
  const total = evaluations.length;
  if (total === 0) {
    return {
      total_claims: 0,
      average_score: 0,
      weighted_average_score: 0,
      fully_reconstructed: 0,
      partially_reconstructed: 0,
      not_reconstructed: 0,
      by_type: {},
      by_importance: {},
    };
  }

  // Simple average
  const average_score = evaluations.reduce((s, e) => s + e.score, 0) / total;

  // Weighted average by importance
  const totalWeight = evaluations.reduce((s, e) => s + e.importance, 0);
  const weighted_average_score = totalWeight > 0
    ? evaluations.reduce((s, e) => s + e.score * e.importance, 0) / totalWeight
    : average_score;

  // Threshold counts
  const fully_reconstructed = evaluations.filter((e) => e.score >= 8).length;
  const partially_reconstructed = evaluations.filter((e) => e.score >= 4 && e.score < 8).length;
  const not_reconstructed = evaluations.filter((e) => e.score < 4).length;

  // By claim type
  const by_type: CalculatedMetrics['by_type'] = {};
  for (const e of evaluations) {
    if (!by_type[e.claim_type]) {
      by_type[e.claim_type] = { count: 0, average_score: 0 };
    }
    by_type[e.claim_type].count++;
  }
  for (const type of Object.keys(by_type)) {
    const typeEvals = evaluations.filter((e) => e.claim_type === type);
    by_type[type].average_score = typeEvals.reduce((s, e) => s + e.score, 0) / typeEvals.length;
  }

  // By importance
  const by_importance: CalculatedMetrics['by_importance'] = {};
  for (const e of evaluations) {
    if (!by_importance[e.importance]) {
      by_importance[e.importance] = { count: 0, average_score: 0 };
    }
    by_importance[e.importance].count++;
  }
  for (const imp of Object.keys(by_importance).map(Number)) {
    const impEvals = evaluations.filter((e) => e.importance === imp);
    by_importance[imp].average_score = impEvals.reduce((s, e) => s + e.score, 0) / impEvals.length;
  }

  return {
    total_claims: total,
    average_score,
    weighted_average_score,
    fully_reconstructed,
    partially_reconstructed,
    not_reconstructed,
    by_type,
    by_importance,
  };
}

export async function judge(
  claims: Claim[],
  reconstruction: ReconstructorOutput
): Promise<LLMResponse<JudgeOutput>> {
  const userPrompt = buildUserPrompt(claims, reconstruction);

  const response = await callGemini<RawLLMOutput>(SYSTEM_PROMPT, userPrompt, {
    temperature: 0.1,
    timeout: 180000,
  });

  // Map LLM output to our structured format
  const claim_evaluations: ClaimEvaluation[] = response.data.evaluations.map((e) => {
    const originalClaim = claims.find((c) => c.claim_id === e.claim_id);

    return {
      claim_id: e.claim_id,
      claim_text: originalClaim?.claim_text || '',
      claim_type: originalClaim?.claim_type || 'unknown',
      importance: originalClaim?.importance || 1,
      score: Math.min(10, Math.max(0, e.score)),  // Clamp to 0-10
      justification: e.justification,
      evidence_refs: e.evidence_refs,
    };
  });

  // Calculate metrics programmatically
  const calculated_metrics = calculateMetrics(claims, claim_evaluations);

  const output: JudgeOutput = {
    doc_id: reconstruction.doc_id,
    timestamp: new Date().toISOString(),
    claim_evaluations,
    calculated_metrics,
    metadata: {
      model: 'gemini-2.5-flash',
      total_tokens: response.tokens,
      cost_usd: response.cost_usd,
    },
  };

  return {
    data: output,
    tokens: response.tokens,
    cost_usd: response.cost_usd,
  };
}
