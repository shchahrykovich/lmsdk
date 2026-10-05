export const DECISIONS_PROVIDER = "openrouter-decisions";

export type DecisionQuestionsResult = { questions: Record<string, unknown> } | { error: string };

export const DECISION_QUESTIONS_EXAMPLE = JSON.stringify(
  {
    is_bug: {
      type: "noul",
      instructions: "Is the customer reporting a software defect?",
      criteria: {
        true: "The customer describes broken or unexpected product behavior.",
        false: "The customer is asking a question or requesting a feature.",
      },
    },
    team: {
      type: "choice",
      instructions: "Which team should own this ticket?",
      criteria: {
        account: "Login, permissions, or profile issues.",
        frontend: "Rendering, layout, or browser compatibility issues.",
        payments: "Checkout, billing, or payment processing issues.",
      },
    },
    urgency: {
      type: "score",
      instructions: "How urgent is this ticket?",
      criteria: ["Can wait for the next release", "Should be fixed this week", "Blocking revenue right now"],
    },
  },
  null,
  2
);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

const hasYesNoCriteria = (criteria: unknown): boolean =>
  isRecord(criteria) && isNonEmptyString(criteria.true) && isNonEmptyString(criteria.false);

const hasChoiceCriteria = (criteria: unknown): boolean =>
  isRecord(criteria) && Object.keys(criteria).length >= 2 && Object.values(criteria).every(isNonEmptyString);

const hasScoreCriteria = (criteria: unknown): boolean =>
  Array.isArray(criteria) && criteria.length >= 2 && criteria.every(isNonEmptyString);

const CRITERIA_RULES: Record<string, { check: (criteria: unknown) => boolean; error: string }> = {
  noul: { check: hasYesNoCriteria, error: 'criteria must have "true" and "false" descriptions' },
  choice: { check: hasChoiceCriteria, error: "criteria must map at least two option keys to descriptions" },
  score: { check: hasScoreCriteria, error: "criteria must be a list of at least two levels" },
};

const questionError = (question: unknown): string | null => {
  if (!isRecord(question)) return "must be an object";
  const rule = typeof question.type === "string" ? CRITERIA_RULES[question.type] : undefined;
  if (!rule) return 'type must be "noul", "choice" or "score"';
  if (!isNonEmptyString(question.instructions)) return "instructions are required";
  return rule.check(question.criteria) ? null : rule.error;
};

export function parseDecisionQuestions(text: string): DecisionQuestionsResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: "Questions must be valid JSON" };
  }
  if (!isRecord(parsed) || Object.keys(parsed).length === 0) {
    return { error: "Questions must be a JSON object with at least one question" };
  }
  for (const [name, question] of Object.entries(parsed)) {
    const error = questionError(question);
    if (error) return { error: `Question "${name}": ${error}` };
  }
  return { questions: parsed };
}

export function formatDecisionQuestions(body: unknown): string {
  if (!isRecord(body) || !isRecord(body.decision_questions)) return "";
  return JSON.stringify(body.decision_questions, null, 2);
}
