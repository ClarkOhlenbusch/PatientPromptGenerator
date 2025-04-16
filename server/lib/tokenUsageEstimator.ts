import { get_encoding } from '@dqbd/tiktoken';

// Constants for GPT-4o model pricing (as of May 2024)
const GPT4O_INPUT_COST_PER_1K_TOKENS = 0.01;  // $0.01 per 1K input tokens
const GPT4O_OUTPUT_COST_PER_1K_TOKENS = 0.03; // $0.03 per 1K output tokens

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
}

interface PromptUsageReport {
  batchId: string;
  timestamp: string;
  patientsProcessed: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  perPatientAvg: {
    inputTokens: number;
    outputTokens: number;
    cost: number;
  };
  promptExamples?: {
    shortest: {
      patientId: string;
      tokens: number;
      cost: number;
    };
    longest: {
      patientId: string;
      tokens: number;
      cost: number;
    };
  };
}

/**
 * Estimates the number of tokens in a string for the cl100k_base encoding used by GPT-4o
 * @param text The text to estimate tokens for
 * @returns The estimated number of tokens
 */
export function estimateTokens(text: string): number {
  try {
    const encoding = get_encoding('cl100k_base');
    const tokens = encoding.encode(text);
    const tokenCount = tokens.length;
    encoding.free();
    return tokenCount;
  } catch (error) {
    console.error('Error estimating tokens:', error);
    // Fallback estimation (approximately 4 characters per token)
    return Math.ceil(text.length / 4);
  }
}

/**
 * Estimates the cost and token usage for a single prompt
 * @param inputText The input text sent to the model
 * @param outputText The output text received from the model
 * @returns Token usage and cost information
 */
export function estimateSinglePromptUsage(inputText: string, outputText: string): TokenUsage {
  const inputTokens = estimateTokens(inputText);
  const outputTokens = estimateTokens(outputText);
  
  const inputCost = (inputTokens / 1000) * GPT4O_INPUT_COST_PER_1K_TOKENS;
  const outputCost = (outputTokens / 1000) * GPT4O_OUTPUT_COST_PER_1K_TOKENS;
  const totalCost = inputCost + outputCost;
  
  return {
    inputTokens,
    outputTokens,
    inputCost,
    outputCost,
    totalCost
  };
}

/**
 * Generates a usage report for a batch of patient prompts
 * @param batchId The ID of the batch
 * @param patientData Array of patient data including inputs and generated prompts
 * @returns A comprehensive usage report
 */
export function generateBatchUsageReport(
  batchId: string,
  patientData: Array<{ 
    patientId: string;
    inputText: string;
    prompt: string;
  }>
): PromptUsageReport {
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCost = 0;
  
  const usageByPatient = patientData.map(patient => {
    const usage = estimateSinglePromptUsage(patient.inputText, patient.prompt);
    totalInputTokens += usage.inputTokens;
    totalOutputTokens += usage.outputTokens;
    totalCost += usage.totalCost;
    
    return {
      patientId: patient.patientId,
      usage
    };
  });
  
  // Find shortest and longest prompts
  let shortestPrompt = usageByPatient[0];
  let longestPrompt = usageByPatient[0];
  
  usageByPatient.forEach(patient => {
    if (patient.usage.outputTokens < shortestPrompt.usage.outputTokens) {
      shortestPrompt = patient;
    }
    if (patient.usage.outputTokens > longestPrompt.usage.outputTokens) {
      longestPrompt = patient;
    }
  });
  
  return {
    batchId,
    timestamp: new Date().toISOString(),
    patientsProcessed: patientData.length,
    totalInputTokens,
    totalOutputTokens,
    totalCost,
    perPatientAvg: {
      inputTokens: Math.round(totalInputTokens / patientData.length),
      outputTokens: Math.round(totalOutputTokens / patientData.length),
      cost: totalCost / patientData.length
    },
    promptExamples: {
      shortest: {
        patientId: shortestPrompt.patientId,
        tokens: shortestPrompt.usage.outputTokens,
        cost: shortestPrompt.usage.totalCost
      },
      longest: {
        patientId: longestPrompt.patientId,
        tokens: longestPrompt.usage.outputTokens,
        cost: longestPrompt.usage.totalCost
      }
    }
  };
}

/**
 * Logs a cost estimation directly to the OpenAI completion request
 * This function can be used to add logging to existing OpenAI calls
 */
export function logPromptCostEstimate(inputText: string, outputText: string): void {
  const usage = estimateSinglePromptUsage(inputText, outputText);
  console.log('\n=== OpenAI API Cost Estimate ===');
  console.log(`Input tokens: ${usage.inputTokens} (est. $${usage.inputCost.toFixed(6)})`);
  console.log(`Output tokens: ${usage.outputTokens} (est. $${usage.outputCost.toFixed(6)})`);
  console.log(`Total estimated cost: $${usage.totalCost.toFixed(6)}`);
  console.log('===============================\n');
}