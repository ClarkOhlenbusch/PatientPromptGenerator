import OpenAI from "openai";
import { logPromptCostEstimate, estimateSinglePromptUsage } from "./tokenUsageEstimator";
import { PatientData } from '@shared/types';
import { DatabaseStorage } from "../storage";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

// Use a cache to store generated prompts by condition type
const promptCache = new Map<string, string>();

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
    averageCostPerCall: totalApiCalls > 0 ? totalEstimatedCost / totalApiCalls : 0,
    inputTokensPerCall: totalApiCalls > 0 ? totalInputTokens / totalApiCalls : 0,
    outputTokensPerCall: totalApiCalls > 0 ? totalOutputTokens / totalApiCalls : 0,
    timestamp: new Date().toISOString()
  };
}

export async function generatePrompt(patient: PatientData, batchId?: string): Promise<string> {
  try {
    // Check if we have a cached prompt for this condition type
    const cacheKey = `${patient.healthStatus}_${patient.patientId}`;
    if (promptCache.has(cacheKey)) {
      return promptCache.get(cacheKey)!;
    }

    // Generate a new prompt using OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a healthcare assistant that generates personalized patient care prompts using structured input data similar to our Demo Data. Each patient's name field includes their full name and date of birth (e.g., "John Doe (MM/DD/YYYY)"). Use the Date and Time Stamp to calculate the patient's age (ignore time of day). There is no separate age column. Your task is to:

1. Extract the patient's name and the date of birth from the name field.
2. Calculate the current age of the patient based on the extracted date of birth relative to today's date.
3. Generate a comprehensive, personalized prompt that addresses ALL of the patient's specific conditions and issues together—taking into account that the data is provided in the Demo Data style.
4. Ensure that your prompt:
   - Is written in a clear, professional tone
   - Addresses all of the patient's conditions and issues
   - Provides specific, actionable recommendations
   - Considers the patient's age and any relevant health factors
   - Is personalized to the patient's specific situation

The prompt should be detailed but concise, focusing on the most important aspects of the patient's care.`
        },
        {
          role: "user",
          content: `Generate a personalized care prompt for the following patient:

Patient ID: ${patient.patientId}
Name: ${patient.name}
Age: ${patient.age}
Condition: ${patient.condition}
Health Status: ${patient.healthStatus || 'unknown'}
${patient.isAlert ? 'Alert: Yes' : 'Alert: No'}
${patient.issues?.length ? `Issues: ${patient.issues.join(', ')}` : ''}
${patient.alertReasons?.length ? `Alert Reasons: ${patient.alertReasons.join(', ')}` : ''}
${patient.variables ? `Additional Variables: ${JSON.stringify(patient.variables, null, 2)}` : ''}`
        }
      ],
      temperature: 0.7,
      max_tokens: 500
    });

    const prompt = completion.choices[0]?.message?.content || 'No prompt generated';
    
    // Cache the prompt for future use
    promptCache.set(cacheKey, prompt);
    
    // Log token usage estimate
    const estimatedTokens = estimateSinglePromptUsage(prompt, "gpt-4o");
    logPromptCostEstimate(estimatedTokens, "gpt-4o");

    // Store the prompt in the database if we have a batch ID
    if (batchId) {
      try {
        const storage = new DatabaseStorage();
        await storage.createPatientPrompt({
          batchId,
          patientId: patient.patientId,
          name: patient.name,
          age: patient.age,
          condition: patient.condition,
          prompt,
          isAlert: patient.isAlert ? "true" : "false",
          healthStatus: patient.healthStatus || "alert",
          rawData: {
            issues: patient.issues || [],
            alertReasons: patient.alertReasons || [],
            variables: patient.variables || {}
          }
        });
      } catch (dbError) {
        console.error('Error storing prompt in database:', dbError);
        // Don't throw the error - we still want to return the generated prompt
      }
    } else {
      console.warn('No batch ID provided - prompt will not be stored in database');
    }

    return prompt;
  } catch (error) {
    console.error('Error generating prompt:', error);
    throw error;
  }
}

// Fallback function if OpenAI call fails or API key is not set
function generateFallbackPrompt(patient: PatientData): string {
  const { name, age, condition } = patient;

  // Basic templates based on common conditions
  const templates: Record<string, string> = {
    diabetes: `Guide ${name} through managing ${age < 18 ? "juvenile" : "Type 2"} Diabetes with specific advice on exercise, diet, and blood sugar monitoring. Include reminders about medication adherence and regular check-ups.

Focus on explaining the importance of consistent carbohydrate counting and recommend appropriate portion sizes for meals. Provide guidance on recognizing and managing hypoglycemia symptoms, especially after physical activity.

Remind ${name} to check their feet daily for any cuts or sores and to maintain regular appointments with their healthcare team, including eye exams and kidney function tests.`,

    hypertension: `Provide ${name} with personalized guidance for managing hypertension, focusing on daily blood pressure monitoring, medication adherence, and lifestyle modifications including the DASH diet and stress reduction techniques.

Emphasize the importance of limiting sodium intake to less than 2,300mg per day and increasing consumption of potassium-rich foods like bananas, spinach, and sweet potatoes. Recommend moderate physical activity for 30 minutes most days of the week.

Advise ${name} to keep a blood pressure log and bring it to all healthcare appointments. Remind them that managing hypertension reduces their risk of serious complications like stroke and heart disease.`,

    copd: `Create a tailored plan for ${name} to manage COPD, including breathing exercises, inhaler technique verification, early warning signs of exacerbation, and oxygen therapy management if prescribed.

Recommend pulmonary rehabilitation exercises appropriate for ${name}'s age (${age}) and severity level. Discuss strategies to avoid respiratory irritants and prevent respiratory infections, including vaccination schedules.

Emphasize the importance of maintaining a healthy weight and following up regularly with the healthcare team to adjust treatment as needed. Provide guidance on energy conservation techniques for daily activities.`,

    asthma: `Develop an asthma action plan for ${name} that includes instructions for daily management, recognizing worsening symptoms, and emergency response procedures.

Detail proper use of controller and rescue medications, including demonstration of proper inhaler technique. Identify common triggers like allergies, exercise, or weather changes and provide avoidance strategies.

Explain the importance of peak flow monitoring and maintaining an asthma diary to identify patterns. For this ${age}-year-old patient, include age-appropriate self-management techniques and when to seek medical help.`,

    arthritis: `Design a comprehensive arthritis management program for ${name} that balances pain management, joint protection, and maintaining mobility appropriate for someone age ${age}.

Suggest low-impact exercises like swimming, walking, or tai chi to improve joint function without causing additional pain. Discuss heat and cold therapy options and when each is most appropriate for symptom relief.

Review medication options, including timing for maximum effectiveness, and recommend assistive devices that might help with daily activities. Emphasize the importance of maintaining a healthy weight to reduce stress on affected joints.`,
  };

  // Try to match condition to a template, use default if no match
  let closestMatch = "default";
  for (const key in templates) {
    if (condition.toLowerCase().includes(key.toLowerCase())) {
      closestMatch = key;
      break;
    }
  }

  // Default template if no condition match
  if (closestMatch === "default") {
    return `Provide ${name} with personalized care guidance for managing their ${condition}, taking into account their age (${age}) and specific needs.

Recommend appropriate lifestyle modifications including diet, exercise, and stress management techniques that could help improve their condition. Include information about medication adherence if applicable.

Suggest regular monitoring practices and follow-up care schedules. Emphasize the importance of communicating any changes in symptoms with their healthcare provider promptly.`;
  }

  return templates[closestMatch];
}

/**
 * Generate a prompt using a custom template
 * This function takes a patient data object and a template string,
 * and replaces placeholders with actual patient data
 */
/**
 * Generate a prompt using a system prompt and a user template
 * This function takes a patient data object, system instructions, and a template,
 * separating AI instructions from the final user-facing content
 */
export async function generatePromptWithSystemAndTemplate(
  patient: PatientData, 
  systemPrompt: string, 
  template: string
): Promise<string> {
  try {
    console.log(`Generating prompt with system prompt and template for patient ${patient.patientId}`);
    
    // First, replace simple placeholders with patient data
    let processedTemplate = template;
    
    // Replace basic patient data in the template
    processedTemplate = processedTemplate
      .replace(/\{name\}/g, patient.name)
      .replace(/\{age\}/g, patient.age.toString())
      .replace(/\{condition\}/g, patient.condition);
    
    // Find all remaining placeholders in the template
    const placeholderRegex = /\{(\w+)\}/g;
    const placeholdersToFill = new Set<string>();
    let match;
    
    while ((match = placeholderRegex.exec(processedTemplate)) !== null) {
      // Skip placeholders we already replaced
      if (match[1] !== 'name' && match[1] !== 'age' && match[1] !== 'condition') {
        placeholdersToFill.add(match[1]);
      }
    }
    
    // If we have complex placeholders, use OpenAI to fill them
    if (placeholdersToFill.size > 0) {
      // Prepare the user prompt with patient information
      let userPrompt = `Generate content for placeholders in a template for patient ${patient.name}, age ${patient.age}, with ${patient.condition}.`;
      
      // Add any health issues or variables for context
      if (patient.variables) {
        userPrompt += `\nAvailable variables:\n`;
        for (const [key, value] of Object.entries(patient.variables)) {
          userPrompt += `${key}: ${value}\n`;
        }
      }
      
      // Include a section for each placeholder we need to fill
      userPrompt += `\nI need content for these placeholders:\n`;
      
      placeholdersToFill.forEach(placeholder => {
        userPrompt += `\n{${placeholder}}:`;
        
        switch (placeholder) {
          case 'reasoning':
            userPrompt += ` A brief explanation of the patient's condition and why it requires attention or monitoring. Should be 1-2 sentences focused on the most important health aspect.`;
            break;
          case 'current':
            userPrompt += ` The most relevant current health reading (with units) for this patient's condition.`;
            break;
          case 'slope':
            userPrompt += ` A trend description for the patient's condition (improving, stable, or worsening).`;
            break;
          case 'compliance':
            userPrompt += ` A percentage indicating how well the patient is following health recommendations.`;
            break;
        }
      });
      
      userPrompt += `\nProvide your response as a JSON object with each placeholder as a key. For example:
{
  "reasoning": "Your blood pressure readings show slight elevation over the past month...",
  "current": "Blood pressure: 140/90 mmHg",
  "slope": "Stable with minor fluctuations",
  "compliance": "85%"
}
Include only the placeholders I requested, and keep each value concise and focused.`;
      
      // Make the API call with retry logic
      const placeholderValues = await generatePlaceholders(systemPrompt, userPrompt);
      
      // Replace placeholders with the generated values
      for (const [key, value] of Object.entries(placeholderValues || {})) {
        if (typeof value === 'string') {
          processedTemplate = processedTemplate.replace(
            new RegExp(`\\{${key}\\}`, 'g'),
            value
          );
        }
      }
    }
    
    // Final cleanup: remove any remaining placeholders
    processedTemplate = processedTemplate
      .replace(/\{reasoning\}/g, `your recent health readings for ${patient.condition}`)
      .replace(/\{current\}/g, `within expected range`)
      .replace(/\{slope\}/g, `stable`)
      .replace(/\{compliance\}/g, `good`);
    
    return processedTemplate;
  } catch (error: unknown) {
    console.error("Error generating prompt with system prompt and template:", error);
    return template
      .replace(/\{name\}/g, patient.name)
      .replace(/\{age\}/g, patient.age.toString())
      .replace(/\{condition\}/g, patient.condition)
      .replace(/\{reasoning\}/g, `your recent health readings for ${patient.condition}`)
      .replace(/\{current\}/g, `within expected range`)
      .replace(/\{slope\}/g, `stable`)
      .replace(/\{compliance\}/g, `good`);
  }
}

async function generatePlaceholders(systemPrompt: string, userPrompt: string): Promise<Record<string, string>> {
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
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" },
        max_tokens: 500,
        temperature: 0.5,
      });
      
      const content = response.choices[0].message.content.trim();
      
      // Estimate tokens and log
      const { estimateSinglePromptUsage } = await import("./tokenUsageEstimator");
      const usageData = estimateSinglePromptUsage(systemPrompt + userPrompt, content);
      totalInputTokens += usageData.inputTokens;
      totalOutputTokens += usageData.outputTokens;
      totalEstimatedCost += usageData.totalCost;
      
      console.log(`=== OpenAI Template Placeholder API Cost Estimate ===`);
      console.log(`Input tokens: ${usageData.inputTokens} (est. $${usageData.inputCost.toFixed(6)})`);
      console.log(`Output tokens: ${usageData.outputTokens} (est. $${usageData.outputCost.toFixed(6)})`);
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
          console.error("Failed to parse JSON response after multiple attempts");
          return {};
        }
      }
    } catch (apiError) {
      attempts++;
      
      if (attempts >= maxAttempts) {
        console.error("Failed to generate placeholder content after multiple attempts:", apiError);
        return {};
      }
      
      // Exponential backoff
      const delay = Math.pow(2, attempts) * 1000;
      console.warn(`Attempt ${attempts} failed. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return {};
}

export async function generatePromptWithTemplate(patient: PatientData, template: string): Promise<string> {
  try {
    console.log(`Generating prompt with custom template for patient ${patient.patientId}`);
    
    // First, replace simple placeholders with patient data
    let processedTemplate = template;
    
    // Basic replacements
    processedTemplate = processedTemplate
      .replace(/\{name\}/g, patient.name || 'Patient')
      .replace(/\{age\}/g, patient.age?.toString() || 'Unknown')
      .replace(/\{condition\}/g, patient.condition || 'Unknown');
    
    // For more complex placeholders, we'll use OpenAI to generate the content
    // Check if we need to generate content for these placeholders
    const complexPlaceholders = [
      'reasoning', 
      'current', 
      'slope', 
      'compliance'
    ];
    
    const placeholdersToFill = complexPlaceholders.filter(p => 
      processedTemplate.includes(`{${p}}`)
    );
    
    if (placeholdersToFill.length > 0 && process.env.OPENAI_API_KEY) {
      // Use OpenAI to generate content for these placeholders
      
      // Build a detailed prompt for OpenAI
      const systemPrompt = `You are an expert medical communication assistant. 
You need to generate concise, accurate content to fill placeholders in a medical communication template.
Respond with well-structured JSON containing only the requested placeholder values.`;
      
      let userPrompt = `Generate content for the following placeholders in a patient communication template:
      
Patient information:
- Name: ${patient.name}
- Age: ${patient.age}
- Condition: ${patient.condition}
- Alert status: ${patient.isAlert === true ? 'Requires attention' : 'Normal readings'}
`;

      // Include health metrics if available
      if (patient.variables) {
        userPrompt += `\nHealth readings:\n`;
        for (const [key, value] of Object.entries(patient.variables)) {
          if (key !== 'patientId' && key !== 'name' && key !== 'age' && key !== 'condition') {
            userPrompt += `- ${key}: ${value}\n`;
          }
        }
      }

      // Include issues if available
      if (patient.issues && patient.issues.length > 0) {
        userPrompt += `\nHealth issues:\n- ${patient.issues.join('\n- ')}\n`;
      }
      
      // Include a section for each placeholder we need to fill
      userPrompt += `\nI need content for these placeholders:\n`;
      
      placeholdersToFill.forEach(placeholder => {
        userPrompt += `\n{${placeholder}}:`;
        
        switch (placeholder) {
          case 'reasoning':
            userPrompt += ` A brief explanation of the patient's condition and why it requires attention or monitoring. Should be 1-2 sentences focused on the most important health aspect.`;
            break;
          case 'current':
            userPrompt += ` The most relevant current health reading (with units) for this patient's condition.`;
            break;
          case 'slope':
            userPrompt += ` A trend description for the patient's condition (improving, stable, or worsening).`;
            break;
          case 'compliance':
            userPrompt += ` A percentage indicating how well the patient is following health recommendations.`;
            break;
        }
      });
      
      userPrompt += `\nProvide your response as a JSON object with each placeholder as a key. For example:
{
  "reasoning": "Your blood pressure readings show slight elevation over the past month...",
  "current": "Blood pressure: 140/90 mmHg",
  "slope": "Stable with minor fluctuations",
  "compliance": "85%"
}
Include only the placeholders I requested, and keep each value concise and focused.`;

      try {
        // Make the API call with retry logic
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
                { role: "user", content: userPrompt }
              ],
              response_format: { type: "json_object" },
              max_tokens: 500,
              temperature: 0.5,
            });
            
            const content = response.choices[0].message.content.trim();
            
            // Estimate tokens and log
            const { estimateSinglePromptUsage } = await import("./tokenUsageEstimator");
            const usageData = estimateSinglePromptUsage(systemPrompt + userPrompt, content);
            totalInputTokens += usageData.inputTokens;
            totalOutputTokens += usageData.outputTokens;
            totalEstimatedCost += usageData.totalCost;
            
            console.log(`=== OpenAI Template Placeholder API Cost Estimate ===`);
            console.log(`Input tokens: ${usageData.inputTokens} (est. $${usageData.inputCost.toFixed(6)})`);
            console.log(`Output tokens: ${usageData.outputTokens} (est. $${usageData.outputCost.toFixed(6)})`);
            console.log(`Total estimated cost: $${usageData.totalCost.toFixed(6)}`);
            console.log(`===================================================`);
            
            try {
              // Parse the JSON response
              const placeholderValues = JSON.parse(content);
              
              // Replace placeholders in the template
              for (const [key, value] of Object.entries(placeholderValues)) {
                if (typeof value === 'string') {
                  processedTemplate = processedTemplate.replace(
                    new RegExp(`\\{${key}\\}`, 'g'),
                    value
                  );
                }
              }
              
              // Break the retry loop on success
              break;
            } catch (jsonError) {
              console.error("Error parsing OpenAI JSON response:", jsonError);
              console.log("Raw response:", content);
              attempts++;
              
              if (attempts >= maxAttempts) {
                // If we've exhausted our retries, leave the placeholders as is
                break;
              }
            }
          } catch (apiError) {
            attempts++;
            
            if (attempts >= maxAttempts) {
              console.error("Failed to generate placeholder content after multiple attempts:", apiError);
              break;
            }
            
            // Exponential backoff
            const delay = Math.pow(2, attempts) * 1000;
            console.warn(`Attempt ${attempts} failed. Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      } catch (error) {
        console.error("Error generating placeholder content:", error);
        // On error, leave the placeholders as is
      }
    }
    
    // Final cleanup: remove any remaining placeholders 
    // by replacing them with appropriate default values
    processedTemplate = processedTemplate
      .replace(/\{reasoning\}/g, `your recent health readings for ${patient.condition}`)
      .replace(/\{current\}/g, `within expected range`)
      .replace(/\{slope\}/g, `stable`)
      .replace(/\{compliance\}/g, `good`);
    
    return processedTemplate;
  } catch (error) {
    console.error("Error processing template:", error);
    // Return original template with basic name replacement as fallback
    return template.replace(/\{name\}/g, patient.name || 'Patient');
  }
}
