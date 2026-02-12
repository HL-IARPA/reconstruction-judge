/**
 * Types for Reconstruction Judge (Stage 3)
 */

// Stage 1 types (claims)
export interface Stage1Output {
  doc_id: string;
  doc_subject: string;
  doc_date: string;
  claims: Claim[];
  questions: Question[];
  metadata: {
    extraction_timestamp: string;
    model: string;
    total_tokens: number;
    cost_usd: number;
  };
}

export interface Claim {
  claim_id: string;
  claim_text: string;
  claim_type: string;
  entities: string[];
  time_bounds: {
    start: string | null;
    end: string | null;
  };
  importance: number;
}

export interface Question {
  question_id: string;
  targets_claim_id: string;
  targets_claim_ids: string[];
  question_text: string;
  question_style: 'targeted' | 'contextual' | 'thematic';
  answer_type: string;
  leakage_score: number;
}

// Stage 2 types (reconstruction)
export interface ReconstructorOutput {
  doc_id: string;
  timestamp: string;
  answered_questions: AnsweredQuestion[];
  synthesis: string;
  stats: {
    total_questions: number;
    answered_high_confidence: number;
    answered_medium_confidence: number;
    answered_low_confidence: number;
    unable_to_answer: number;
  };
  metadata: {
    model: string;
    total_tokens: number;
    cost_usd: number;
    retrieved_doc_count: number;
  };
}

export interface AnsweredQuestion {
  question_id: string;
  question_text: string;
  question_style: 'targeted' | 'contextual' | 'thematic';
  answer: string | null;
  confidence: 'high' | 'medium' | 'low' | 'none';
  supporting_evidence: Evidence[];
  reasoning: string;
}

export interface Evidence {
  doc_rank: number;
  doc_id: string;
  quote: string;
}

// Judge output types
export interface JudgeOutput {
  doc_id: string;
  timestamp: string;

  // LLM-produced scores
  claim_evaluations: ClaimEvaluation[];

  // Programmatically calculated
  calculated_metrics: CalculatedMetrics;

  metadata: {
    model: string;
    total_tokens: number;
    cost_usd: number;
  };
}

export interface ClaimEvaluation {
  claim_id: string;
  claim_text: string;
  claim_type: string;
  importance: number;

  // LLM-assigned
  score: number;           // 0-10
  justification: string;   // 1-2 sentences
  evidence_refs: string[]; // e.g., ["t3", "synthesis"]
}

export interface CalculatedMetrics {
  total_claims: number;
  average_score: number;
  weighted_average_score: number;  // By importance

  // Threshold counts
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
}

// Aggregate stats across all documents
export interface AggregateStats {
  total_documents: number;
  total_claims: number;

  overall: {
    average_score: number;
    weighted_average_score: number;
    pct_fully_reconstructed: number;
    pct_partially_reconstructed: number;
    pct_not_reconstructed: number;
  };

  by_claim_type: {
    [type: string]: {
      count: number;
      average_score: number;
      pct_reconstructed: number;  // score >= 8
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
    weighted_average_score: number;
  }[];
}

// LLM Response wrapper
export interface LLMResponse<T> {
  data: T;
  tokens: number;
  cost_usd: number;
}
