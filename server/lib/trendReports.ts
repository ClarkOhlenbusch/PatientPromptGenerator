import OpenAI from "openai";
import { storage } from "../storage";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function generateTrendReport(
  patientData: any,
  batchId?: string
): Promise<string> {
  try {
    // Get the trend report prompt
    const trendPrompt = await storage.getTrendReportPrompt(batchId);
    const systemPrompt = trendPrompt?.prompt || storage.getDefaultTrendReportPrompt();

    // Extract the user prompt part and replace variables
    const userPromptTemplate = systemPrompt.split('role: "user"')[1] || systemPrompt;
    
    const userPrompt = userPromptTemplate
      .replace(/\$\{patient\.name\}/g, patientData.name || 'Unknown Patient')
      .replace(/\$\{patient\.age\}/g, patientData.age?.toString() || 'Unknown Age')
      .replace(/\$\{patient\.condition\}/g, patientData.condition || 'No condition specified')
      .replace(/\$\{patient\.isAlert \? 'Alert: Yes' : 'Alert: No'\}/g, 
        patientData.isAlert ? 'Alert: Yes' : 'Alert: No')
      .replace(/\$\{patient\.variables \? `Additional Variables: \$\{JSON\.stringify\(patient\.variables, null, 2\)\}` : ''\}/g,
        patientData.variables ? `Additional Variables: ${JSON.stringify(patientData.variables, null, 2)}` : '');

    // Use the system prompt part
    const systemPromptPart = systemPrompt.split('role: "user"')[0] || 
      `Senior Health Report, 250 words, easy to understand. 
You are a care team assistant that delivers reports based on the senior's unique health/activity data.
The goal is to provide a health and activity summary, highlighting data trends, improvements and also problematic points.
Your task is to:
1. Create a generic summary of around 100 words, the generated summary should be encased between the beginning start tag of <summary> and end tag of </summary>. 
   Analyze the provided measurements and look for trends and connections between data points.
   At the end make a small recommendation on what the care team's next steps should be with this patient (e.g.: continue monitoring, call in for a in person assessment etc)
2. Create a data submission compliance paragraph of around 30 words, the generated summary should be encased between the beginning start tag of <compliance> and end tag of </compliance>. 
   Taking into consideration that the patient needs to answer some questions, and make device measurements (as smart blood pressure cuff or sp02 devices) so that we have data to analyze, evaluate the patient's data submission compliance behavior.
   Point specific weaknesses or strong points when it comes to data submission consistency and clearly state the variables names for this situations (e.g.: Data appears consistent with all days having submission for blood pressure and heart rate).    
3. Create an insights paragraph of around 30 words, the generated summary should be encased between the beginning start tag of <insights> and end tag of </insights>. 
   For the provided data, extract a final insights paragraph that should make reference to the patient's condition.`;

    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        {
          role: "system",
          content: systemPromptPart.trim(),
        },
        {
          role: "user",
          content: userPrompt.trim(),
        },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    return response.choices[0].message.content || "Failed to generate trend report";
  } catch (error) {
    console.error("Error generating trend report:", error);
    throw new Error(`Failed to generate trend report: ${error instanceof Error ? error.message : String(error)}`);
  }
}