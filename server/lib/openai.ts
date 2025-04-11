import OpenAI from "openai";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

interface PatientData {
  patientId: string;
  name: string;
  age: number;
  condition: string;
  [key: string]: any;
}

// Use a cache to store generated prompts by condition type
const promptCache = new Map<string, string>();

export async function generatePrompt(patient: PatientData): Promise<string> {
  try {
    // Handle the case where we have aggregated issues from multiple alerts
    const hasAggregatedIssues = patient.issues && patient.issues.length > 0;
    
    // Create a unique cache key based on either the combined conditions or individual condition
    const cacheKey = hasAggregatedIssues ? 
      `aggregated_${patient.patientId}_${patient.issues?.length}` : 
      `${patient.condition}`;
    
    if (promptCache.has(cacheKey)) {
      const cachedPrompt = promptCache.get(cacheKey);
      // Personalize the cached prompt with patient name
      return cachedPrompt!.replace(/\{name\}/g, patient.name).replace(/\{age\}/g, patient.age.toString());
    }
    
    // Skip OpenAI call if API key is not set
    if (!process.env.OPENAI_API_KEY) {
      return generateFallbackPrompt(patient);
    }

    // Prepare content for the prompt
    let userContent = '';
    let systemContent = '';
    
    if (hasAggregatedIssues) {
      // For aggregated patient data with multiple issues
      console.log(`Processing aggregated data with ${patient.issues.length} issues for patient ${patient.patientId}`);
      
      systemContent = `You are a healthcare assistant that creates personalized patient care prompts. 
      These prompts will be used to guide patients with multiple health issues or conditions that need attention.
      Generate a comprehensive, personalized prompt that addresses ALL of the patient's specific conditions and issues together.
      
      The prompt should:
      1. Acknowledge all of the patient's issues in a cohesive way
      2. Provide actionable guidance for managing multiple conditions
      3. Prioritize the most critical issues while addressing all concerns
      4. Include age-appropriate recommendations
      5. Suggest lifestyle adjustments that address multiple conditions at once
      6. Recommend follow-up and monitoring for all conditions
      
      Keep the tone warm, supportive, and professional. Make the prompt 2-3 paragraphs long.
      IMPORTANT: Use {name} as a placeholder for the patient's name and {age} as a placeholder for the patient's age.`;
      
      // Format all issues as a bulleted list
      const issuesList = patient.issues.map((issue: string) => `• ${issue}`).join('\n');
      
      userContent = `Generate a personalized care prompt for a patient with the following issues:
      
${issuesList}

Patient has multiple conditions requiring attention: ${patient.condition}

Use {name} as placeholder for patient name and {age} for age. Create ONE comprehensive prompt that addresses ALL issues together, not separate advice for each issue.`;
    } else {
      // For single condition patients (backward compatibility)
      systemContent = `You are a healthcare assistant that creates personalized patient care prompts. 
      These prompts will be used to guide patients with their specific medical conditions. 
      Generate a detailed, personalized prompt that addresses the patient's specific condition, age, and any other relevant factors. 
      The prompt should be informative, supportive, and provide actionable guidance.
      Focus on:
      1. Management of their specific condition
      2. Age-appropriate recommendations
      3. Lifestyle adjustments
      4. Medication adherence if applicable
      5. Follow-up and monitoring
      Keep the tone warm and supportive, but professional. Make the prompt 2-3 paragraphs long.
      IMPORTANT: Use {name} as a placeholder for the patient's name and {age} as a placeholder for the patient's age,
      so we can customize the prompt for different patients with similar conditions.`;
      
      userContent = `Generate a personalized care prompt for a patient with this condition: "${patient.condition}". Use {name} as placeholder for patient name and {age} for age.`;
    }

    // Use a fast response setting to speed up generation
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // Using the latest model
      messages: [
        {
          role: "system",
          content: systemContent
        },
        {
          role: "user",
          content: userContent
        }
      ],
      max_tokens: 600, // Increased for aggregated issues
      temperature: 0.5, // Lower temperature for more predictable responses
    });

    const prompt = response.choices[0].message.content || generateFallbackPrompt(patient);
    
    // Store the templated prompt in the cache
    promptCache.set(cacheKey, prompt);
    
    // Return a personalized version
    return prompt.replace(/\{name\}/g, patient.name).replace(/\{age\}/g, patient.age.toString());
  } catch (error: unknown) {
    console.error("Error generating prompt with OpenAI:", error);
    return generateFallbackPrompt(patient);
  }
}

// Fallback function if OpenAI call fails or API key is not set
function generateFallbackPrompt(patient: PatientData): string {
  const { name, age, condition } = patient;
  
  // Basic templates based on common conditions
  const templates: Record<string, string> = {
    "diabetes": `Guide ${name} through managing ${age < 18 ? 'juvenile' : 'Type 2'} Diabetes with specific advice on exercise, diet, and blood sugar monitoring. Include reminders about medication adherence and regular check-ups.

Focus on explaining the importance of consistent carbohydrate counting and recommend appropriate portion sizes for meals. Provide guidance on recognizing and managing hypoglycemia symptoms, especially after physical activity.

Remind ${name} to check their feet daily for any cuts or sores and to maintain regular appointments with their healthcare team, including eye exams and kidney function tests.`,

    "hypertension": `Provide ${name} with personalized guidance for managing hypertension, focusing on daily blood pressure monitoring, medication adherence, and lifestyle modifications including the DASH diet and stress reduction techniques.

Emphasize the importance of limiting sodium intake to less than 2,300mg per day and increasing consumption of potassium-rich foods like bananas, spinach, and sweet potatoes. Recommend moderate physical activity for 30 minutes most days of the week.

Advise ${name} to keep a blood pressure log and bring it to all healthcare appointments. Remind them that managing hypertension reduces their risk of serious complications like stroke and heart disease.`,

    "copd": `Create a tailored plan for ${name} to manage COPD, including breathing exercises, inhaler technique verification, early warning signs of exacerbation, and oxygen therapy management if prescribed.

Recommend pulmonary rehabilitation exercises appropriate for ${name}'s age (${age}) and severity level. Discuss strategies to avoid respiratory irritants and prevent respiratory infections, including vaccination schedules.

Emphasize the importance of maintaining a healthy weight and following up regularly with the healthcare team to adjust treatment as needed. Provide guidance on energy conservation techniques for daily activities.`,

    "asthma": `Develop an asthma action plan for ${name} that includes instructions for daily management, recognizing worsening symptoms, and emergency response procedures.

Detail proper use of controller and rescue medications, including demonstration of proper inhaler technique. Identify common triggers like allergies, exercise, or weather changes and provide avoidance strategies.

Explain the importance of peak flow monitoring and maintaining an asthma diary to identify patterns. For this ${age}-year-old patient, include age-appropriate self-management techniques and when to seek medical help.`,

    "arthritis": `Design a comprehensive arthritis management program for ${name} that balances pain management, joint protection, and maintaining mobility appropriate for someone age ${age}.

Suggest low-impact exercises like swimming, walking, or tai chi to improve joint function without causing additional pain. Discuss heat and cold therapy options and when each is most appropriate for symptom relief.

Review medication options, including timing for maximum effectiveness, and recommend assistive devices that might help with daily activities. Emphasize the importance of maintaining a healthy weight to reduce stress on affected joints.`
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
