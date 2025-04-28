import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RefreshCw, Save, Undo2 } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

// Hardcoded initial default prompt (copied from server/lib/openai.ts)
const INITIAL_DEFAULT_SYSTEM_PROMPT = `You are a healthcare assistant that generates personalized patient care prompts using structured input data similar to our Demo Data. Each patient's name field includes their full name and date of birth (e.g., "John Doe (MM/DD/YYYY)"). Use the Date and Time Stamp to calculate the patient's age (ignore time of day). There is no separate age column. Your task is to:
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

export default function PromptEditingSandbox() {
  const [corePrompt, setCorePrompt] = useState<string>("");
  const { toast } = useToast();
  
  // Query to get the current default system prompt initially
  const { data: defaultSystemPrompt, isLoading: isPromptLoading } = useQuery({
    queryKey: ["/api/system-prompt"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/system-prompt");
        const data = await res.json();
        // On initial load, use the fetched prompt OR the hardcoded default if fetch fails
        return data.prompt || INITIAL_DEFAULT_SYSTEM_PROMPT;
      } catch (error) {
        console.error("Failed to fetch system prompt:", error);
        toast({
          title: "Error",
          description: "Failed to load system prompt, using default.",
          variant: "destructive"
        });
        // Fallback to hardcoded default if fetch fails
        return INITIAL_DEFAULT_SYSTEM_PROMPT;
      }
    }
  });

  // Update system prompt mutation (still needed for saving)
  const updateSystemPromptMutation = useMutation({
    mutationFn: async (prompt: string) => {
      const res = await apiRequest("POST", "/api/system-prompt", { prompt });
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "System prompt updated successfully! Your changes will be applied to all new patient reports.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/system-prompt"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to update system prompt: ${error.message}`,
        variant: "destructive"
      });
    }
  });

  // Get the latest batch ID for regeneration (still needed)
  const { data: latestBatch, isLoading: isBatchLoading } = useQuery({
    queryKey: ["/api/batches/latest"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/batches/latest");
      return await res.json();
    }
  });

  // Regenerate all prompts mutation (still needed)
  const regeneratePromptsMutation = useMutation({
    mutationFn: async () => {
      if (!latestBatch?.batchId) {
        throw new Error("No batch found to regenerate");
      }
      
      console.log(`Regenerating prompts for batch: ${latestBatch.batchId}`);
      const res = await apiRequest("POST", `/api/prompts/regenerate-all?batchId=${latestBatch.batchId}`);
      
      // Handle non-2xx status codes
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || `Failed with status: ${res.status}`);
      }
      
      return await res.json();
    },
    onSuccess: (data) => {
      console.log("Regeneration result:", data);
      
      // Handle cases where regeneration succeeded but no prompts were found/regenerated
      if (data.data.total === 0) {
        toast({
          title: "No Prompts Found",
          description: data.message || "No prompts were found to regenerate. Try uploading patient data first.",
          variant: "default"
        });
      } else {
        toast({
          title: "Success", 
          description: `Patient reports regenerated: ${data.data.regenerated}/${data.data.total}`,
        });
      }
      
      queryClient.invalidateQueries({ queryKey: ["/api/prompts"] });
      if (latestBatch?.batchId) {
        queryClient.invalidateQueries({ queryKey: ["/api/prompts", latestBatch.batchId] });
      }
    },
    onError: (error: Error) => {
      console.error("Regeneration error:", error);
      
      // Friendly error message with suggestions for common issues
      let errorMessage = error.message;
      
      // Check for common error patterns
      if (errorMessage.includes("not found")) {
        errorMessage = "Batch not found. The data may have been deleted. Try uploading new patient data.";
      } else if (errorMessage.includes("No prompts found")) {
        errorMessage = "No prompts found for this batch. Try uploading new patient data.";
      }
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
    }
  });

  useEffect(() => {
    // Initialize the editor with the fetched or default prompt
    if (defaultSystemPrompt) {
      setCorePrompt(defaultSystemPrompt);
    }
  }, [defaultSystemPrompt]);

  const handleSaveSystemPrompt = () => {
    updateSystemPromptMutation.mutate(corePrompt);
  };

  const handleResetToDefault = () => {
    // Simply set the local state to the hardcoded default prompt
    setCorePrompt(INITIAL_DEFAULT_SYSTEM_PROMPT);
    toast({
        title: "Reset",
        description: "Editor reset to default prompt. Save to apply.", // Clarify that save is needed
    });
    // No API call needed here anymore
  };

  const handleRegeneratePrompts = () => {
    regeneratePromptsMutation.mutate();
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Core Prompt Editor</CardTitle>
          <CardDescription>
            Edit the core AI prompt that generates patient reports. After saving, go to the Triage section to see your changes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Textarea
              placeholder="Loading prompt..."
              value={corePrompt}
              onChange={(e) => setCorePrompt(e.target.value)}
              className="min-h-[400px] font-mono text-sm"
              disabled={isPromptLoading}
            />
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleSaveSystemPrompt}
              disabled={updateSystemPromptMutation.isPending || isPromptLoading}
              className="bg-gradient-to-r from-green-500 to-emerald-700 hover:from-green-600 hover:to-emerald-800"
            >
              <Save className="w-4 h-4 mr-2" />
              Save Prompt
            </Button>
            <Button
              onClick={handleResetToDefault}
              // Disable button only while initial prompt is loading
              disabled={isPromptLoading} 
              variant="outline"
            >
              <Undo2 className="w-4 h-4 mr-2" />
              Reset to Default
            </Button>
            <Button
              onClick={handleRegeneratePrompts}
              disabled={regeneratePromptsMutation.isPending || updateSystemPromptMutation.isPending}
              variant="outline"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Regenerate All Patient Reports
            </Button>
          </div>

          {(updateSystemPromptMutation.isPending || regeneratePromptsMutation.isPending) && (
            <Alert>
              <AlertDescription>
                {updateSystemPromptMutation.isPending
                  ? "Saving your custom prompt..."
                  : "Regenerating all patient reports..."}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}