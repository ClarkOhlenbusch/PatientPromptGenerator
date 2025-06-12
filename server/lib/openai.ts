import OpenAI from "openai";
import {
  logPromptCostEstimate,
  estimateSinglePromptUsage,
} from "./tokenUsageEstimator";
import { PatientData } from "@shared/types";
import { DatabaseStorage } from "../storage";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

// Use a cache to store generated prompts by condition type with size limit
const promptCache = new Map<string, string>();
const MAX_CACHE_SIZE = 1000; // Prevent memory leaks

// Track token usage statistics
let totalInputTokens = 0;
let totalOutputTokens = 0;
let totalApiCalls = 0;
let totalEstimatedCost = 0;

// Function to get token usage statistics
export function getTokenUsageStats() {
  return {
    totalApiCalls,
    totalInputTokens,
    totalOutputTokens,
    totalEstimatedCost,
    averageCostPerCall:
      totalApiCalls > 0 ? totalEstimatedCost / totalApiCalls : 0,
    inputTokensPerCall:
      totalApiCalls > 0 ? totalInputTokens / totalApiCalls : 0,
    outputTokensPerCall:
      totalApiCalls > 0 ? totalOutputTokens / totalApiCalls : 0,
    timestamp: new Date().toISOString(),
  };
}

// Utility function to extract reasoning from prompt text
export function extractReasoning(promptText: string): {
  displayPrompt: string;
  reasoning: string;
} {
  // First check for markdown-formatted reasoning with bold formatting
  const markdownReasoningMatch = promptText.match(
    /\*\*Reasoning:\*\*\s*([\s\S]*?)(\n\s*$|$)/,
  );

  if (markdownReasoningMatch) {
    // Extract the reasoning text
    const reasoning = markdownReasoningMatch[1].trim();

    // Remove the reasoning section from the prompt
    const displayPrompt = promptText
      .replace(/\*\*Reasoning:\*\*\s*([\s\S]*?)(\n\s*$|$)/, "")
      .trim();

    console.log("Extracted reasoning (markdown):", reasoning);
    return { displayPrompt, reasoning };
  }

  // Check for plaintext "Reasoning:" section
  const plainReasoningMatch = promptText.match(
    /(?:^|\n|\r)Reasoning:\s*([\s\S]*?)(\n\s*$|$)/i,
  );

  if (plainReasoningMatch) {
    // Extract the reasoning text
    const reasoning = plainReasoningMatch[1].trim();

    // Remove the reasoning section from the prompt
    const displayPrompt = promptText
      .replace(/(?:^|\n|\r)Reasoning:\s*([\s\S]*?)(\n\s*$|$)/i, "")
      .trim();

    console.log("Extracted reasoning (plaintext):", reasoning);
    return { displayPrompt, reasoning };
  }

  // Check for a section with "**Reasoning**" (different format)
  const boldReasoningMatch = promptText.match(
    /\*\*Reasoning\*\*:?\s*([\s\S]*?)(\n\s*$|$)/i,
  );

  if (boldReasoningMatch) {
    // Extract the reasoning text
    const reasoning = boldReasoningMatch[1].trim();

    // Remove the reasoning section from the prompt
    const displayPrompt = promptText
      .replace(/\*\*Reasoning\*\*:?\s*([\s\S]*?)(\n\s*$|$)/i, "")
      .trim();

    console.log("Extracted reasoning (bold):", reasoning);
    return { displayPrompt, reasoning };
  }

  // If no reasoning section is found, check for a dedicated section at the end
  const lines = promptText.trim().split(/\n/);
  const lastSectionIndex = lines.findIndex(
    (line, index) =>
      index > lines.length / 2 && // Only look in the second half of the content
      (line.includes("Reasoning:") ||
        line.includes("**Reasoning:**") ||
        line.includes("**Reasoning**") ||
        line.match(/^\*\*.*\*\*:$/)), // Any bold section header with a colon
  );

  if (lastSectionIndex !== -1) {
    const displayPrompt = lines.slice(0, lastSectionIndex).join("\n").trim();
    const reasoning = lines.slice(lastSectionIndex).join("\n").trim();

    console.log("Extracted reasoning (section):", reasoning);
    return { displayPrompt, reasoning };
  }

  // If no reasoning section is found, return original prompt and empty reasoning
  console.log("No reasoning section found");
  return { displayPrompt: promptText, reasoning: "" };
}

// Default system prompt that can be overridden by the prompt editor
let defaultSystemPrompt = `You are a healthcare assistant that generates personalized patient care prompts using structured input data similar to our Demo Data. Each patient's name field includes their full name and date of birth (e.g., "John Doe (MM/DD/YYYY)"). Use the Date and Time Stamp to calculate the patient's age (ignore time of day). There is no separate age column. Your task is to:
These messages that you are creating should be 150 words or less not including the "Reasoning" section. They are targeted to the patient's primary care physician NOT the patient.

1. Extract the patient's name and the date of birth from the Senior Name field.
2. Calculate the current age of the patient based on the extracted date of birth relative to today's date.
3. Generate a comprehensive, personalized prompt that addresses ALL of the patient's specific conditions and issues together—taking into account that the data is provided in the Demo Data style.
4. Ensure that your prompt:
   - Is written in a clear, professional tone
   - Addresses all of the patient's conditions and issues
   - Provides specific, actionable recommendations
   - Considers the patient's age and any relevant health factors
   - Is personalized to the patient's specific situation
   - Should be predictive of the patient's future health and well-being
5. IMPORTANT: End your response with a "Reasoning" section that explains your thought process behind the care recommendations. Format it as "**Reasoning:** [your explanation]". This should be 2-3 sentences detailing why the specific recommendations were made based on the patient's condition and data.

The prompt should be detailed but concise, focusing on the most important aspects of the patient's care.`;

// Set custom system prompt for all future generations
export function setDefaultSystemPrompt(prompt: string) {
  defaultSystemPrompt = prompt;
}

// Get current system prompt
export function getDefaultSystemPrompt(): string {
  return defaultSystemPrompt;
}

/**
 * Generates a personalized care prompt for a patient
 * This is the main function used for triage and all prompt generation
 */
export async function generatePrompt(
  patient: PatientData,
  batchId?: string,
  customSystemPrompt?: string,
): Promise<string> {
  try {
    // Check if we have a cached prompt for this condition type
    const cacheKey = `${patient.healthStatus}_${patient.patientId}`;
    if (!customSystemPrompt && promptCache.has(cacheKey)) {
      return promptCache.get(cacheKey)!;
    }

    // Use custom system prompt if provided, otherwise use default
    const systemPrompt = customSystemPrompt || defaultSystemPrompt;

    // Generate a new prompt using OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-nano",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: `Generate a personalized care prompt for the following patient:

Patient ID: ${patient.patientId}
Name: ${patient.name}
Age: ${patient.age}
Condition: ${patient.condition}
Health Status: ${patient.healthStatus || "unknown"}
${patient.isAlert ? "Alert: Yes" : "Alert: No"}
${patient.issues?.length ? `Issues: ${patient.issues.join(", ")}` : ""}
${patient.alertReasons?.length ? `Alert Reasons: ${patient.alertReasons.join(", ")}` : ""}
${patient.variables ? `Additional Variables: ${JSON.stringify(patient.variables, null, 2)}` : ""}`,
        },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const fullPrompt =
      completion.choices[0]?.message?.content || "No prompt generated";

    // Extract reasoning from the prompt
    const { displayPrompt, reasoning } = extractReasoning(fullPrompt);

    // Force a check - if reasoning is empty but "Reasoning" exists in the prompt text,
    // try more aggressive pattern matching
    if (!reasoning && fullPrompt.includes("Reasoning")) {
      console.log("Trying more aggressive reasoning extraction");
      // If "Reasoning" is anywhere in the text, extract everything after it
      const lastReasoningIndex = fullPrompt.lastIndexOf("Reasoning");
      if (lastReasoningIndex > fullPrompt.length / 2) {
        // Only check in latter half
        const forcedDisplayPrompt = fullPrompt
          .substring(0, lastReasoningIndex)
          .trim();
        const forcedReasoning = fullPrompt.substring(lastReasoningIndex).trim();

        if (forcedReasoning.length > 20) {
          // At least 20 chars of content to be valid
          console.log(
            "Found reasoning with aggressive method:",
            forcedReasoning,
          );

          // Return the full prompt (the client will extract reasoning again)
          return fullPrompt;
        }
      }
    }

    // Only cache if not using a custom system prompt
    if (!customSystemPrompt) {
      // Clear oldest entries if cache is too large
      if (promptCache.size >= MAX_CACHE_SIZE) {
        const firstKey = promptCache.keys().next().value;
        if (firstKey) {
          promptCache.delete(firstKey);
        }
      }
      promptCache.set(cacheKey, fullPrompt);
    }

    // Log token usage estimate
    const usageData = estimateSinglePromptUsage(systemPrompt, fullPrompt);
    totalInputTokens += usageData.inputTokens;
    totalOutputTokens += usageData.outputTokens;
    totalEstimatedCost += usageData.totalCost;
    totalApiCalls++;

    console.log(`=== OpenAI API Cost Estimate ===`);
    console.log(
      `Input tokens: ${usageData.inputTokens} (est. $${usageData.inputCost.toFixed(6)})`,
    );
    console.log(
      `Output tokens: ${usageData.outputTokens} (est. $${usageData.outputCost.toFixed(6)})`,
    );
    console.log(`Total estimated cost: $${usageData.totalCost.toFixed(6)}`);
    console.log(`=============================`);

    return fullPrompt;
  } catch (error) {
    console.error("Error generating prompt:", error);
    throw error;
  }
}

/**
 * Alias of generatePrompt with custom system prompt
 * This provides backward compatibility for the prompt editing feature
 */
export async function generatePromptWithTemplate(
  patient: PatientData,
  template: string,
): Promise<string> {
  return generatePrompt(patient, undefined, template);
}

/**
 * Alias of generatePrompt with custom system prompt
 * This provides backward compatibility for the system prompt + template approach
 */
export async function generatePromptWithSystemAndTemplate(
  patient: PatientData,
  systemPrompt: string,
  template: string,
): Promise<string> {
  // Combine system prompt and template for backward compatibility
  const combinedPrompt = `${systemPrompt}\n\nTEMPLATE TO USE:\n${template}`;
  return generatePrompt(patient, undefined, combinedPrompt);
}

async function generatePlaceholders(
  systemPrompt: string,
  userPrompt: string,
): Promise<Record<string, string>> {
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      // Calculate input tokens for tracking
      totalApiCalls++;

      const response = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        max_tokens: 500,
        temperature: 0.5,
      });

      const content = response.choices[0]?.message?.content?.trim() || "";

      // Estimate tokens and log
      const { estimateSinglePromptUsage } = await import(
        "./tokenUsageEstimator"
      );
      const usageData = estimateSinglePromptUsage(
        systemPrompt + userPrompt,
        content,
      );
      totalInputTokens += usageData.inputTokens;
      totalOutputTokens += usageData.outputTokens;
      totalEstimatedCost += usageData.totalCost;

      console.log(`=== OpenAI Template Placeholder API Cost Estimate ===`);
      console.log(
        `Input tokens: ${usageData.inputTokens} (est. $${usageData.inputCost.toFixed(6)})`,
      );
      console.log(
        `Output tokens: ${usageData.outputTokens} (est. $${usageData.outputCost.toFixed(6)})`,
      );
      console.log(`Total estimated cost: $${usageData.totalCost.toFixed(6)}`);
      console.log(`===================================================`);

      try {
        // Parse the JSON response
        const placeholderValues = JSON.parse(content);
        return placeholderValues;
      } catch (jsonError) {
        console.error("Error parsing OpenAI JSON response:", jsonError);
        console.log("Raw response:", content);
        attempts++;

        if (attempts >= maxAttempts) {
          console.error(
            "Failed to parse JSON response after multiple attempts",
          );
          return {};
        }
      }
    } catch (apiError) {
      attempts++;

      if (attempts >= maxAttempts) {
        console.error(
          "Failed to generate placeholder content after multiple attempts:",
          apiError,
        );
        return {};
      }

      // Exponential backoff
      const delay = Math.pow(2, attempts) * 1000;
      console.warn(`Attempt ${attempts} failed. Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return {};
}
