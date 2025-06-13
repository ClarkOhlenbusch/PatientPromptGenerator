import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  RefreshCw,
  Save,
  Undo2,
  Phone,
  Volume2,
  BarChart3,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  const [patientPrompt, setPatientPrompt] = useState<string>("");
  const [trendReportPrompt, setTrendReportPrompt] = useState<string>("");
  const [vapiConfig, setVapiConfig] = useState({
    firstMessage:
      "Hello, this is your healthcare assistant calling with an important update about your health. Do you have a moment to speak?",
    systemPrompt:
      "You are a professional healthcare assistant calling a patient. Speak clearly, compassionately, and keep the conversation focused on their health needs. Always be respectful of their time and provide clear, actionable information.",
    voiceProvider: "vapi",
    voiceId: "Kylie",
    model: "gpt-4o-mini",
  });
  const [testPhoneNumber, setTestPhoneNumber] = useState("");
  const { toast } = useToast();

  // Default patient prompt
  const INITIAL_DEFAULT_PATIENT_PROMPT = `You are generating a personalized health message directly for a patient. This message should be warm, reassuring, and easy to understand for the patient themselves.

Your task is to:
1. Create a friendly, encouraging message that speaks directly to the patient
2. Use simple, non-medical language that patients can easily understand
3. Focus on positive health actions they can take
4. Keep the message supportive and empowering
5. Include specific, actionable steps they can follow
6. Address their condition with empathy and understanding

The message should be around 100-150 words and written in a warm, caring tone that helps patients feel supported in their health journey.

Important: This message is FOR the patient, not about them. Write as if you're speaking directly to them.`;

// Default trend report prompt
const INITIAL_DEFAULT_TREND_REPORT_PROMPT = `role: "system"
Senior Health Report, 250 words, easy to understand. 
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
   For the provided data, extract a final insights paragraph that should make reference to the patient's condition.
 
role: "user"
Generate a personalized health report for the following patient:
Name: \${patient.name}
Age: \${patient.age}
Condition: \${patient.condition}
\${patient.isAlert ? 'Alert: Yes' : 'Alert: No'}
\${patient.variables ? \`Additional Variables: \${JSON.stringify(patient.variables, null, 2)}\` : ''} <-- in here we send a summary of the health and activity data for the selected period`;

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
          variant: "destructive",
        });
        // Fallback to hardcoded default if fetch fails
        return INITIAL_DEFAULT_SYSTEM_PROMPT;
      }
    },
  });

  // Query to get current Vapi agent configuration
  const { data: vapiAgentConfig, isLoading: isVapiLoading } = useQuery({
    queryKey: ["/api/vapi/agent"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/vapi/agent");
        return await res.json();
      } catch (error) {
        console.error("Failed to fetch Vapi agent config:", error);
        toast({
          title: "Info",
          description:
            "Could not load current agent settings. You can configure them below.",
          variant: "default",
        });
        return null;
      }
    },
  });

  // Query to get current voice agent template
  const { data: voiceAgentTemplate } = useQuery({
    queryKey: ["/api/voice-agent-template"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/voice-agent-template");
        const data = await res.json();
        return data.template;
      } catch (error) {
        console.error("Failed to fetch voice agent template:", error);
        return null;
      }
    },
  });

  // Query to get the current patient system prompt
  const { data: defaultPatientPrompt, isLoading: isPatientPromptLoading } = useQuery({
    queryKey: ["/api/patient-system-prompt"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/patient-system-prompt");
        const data = await res.json();
        return data.prompt || INITIAL_DEFAULT_PATIENT_PROMPT;
      } catch (error) {
        console.error("Failed to fetch patient system prompt:", error);
        toast({
          title: "Error",
          description: "Failed to load patient system prompt, using default.",
          variant: "destructive",
        });
        return INITIAL_DEFAULT_PATIENT_PROMPT;
      }
    },
  });

  // Query to get the current trend report prompt
  const { data: defaultTrendReportPrompt, isLoading: isTrendPromptLoading } = useQuery({
    queryKey: ["/api/trend-report-prompt"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/trend-report-prompt");
        const data = await res.json();
        return data.data?.prompt || INITIAL_DEFAULT_TREND_REPORT_PROMPT;
      } catch (error) {
        console.error("Failed to fetch trend system prompt:", error);
        toast({
          title: "Error",
          description: "Failed to load trend report prompt, using default.",
          variant: "destructive",
        });
        return INITIAL_DEFAULT_TREND_REPORT_PROMPT;
      }
    },
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
        description:
          "System prompt updated successfully! Your changes will be applied to all new patient reports.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/system-prompt"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to update system prompt: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Update patient system prompt mutation
  const updatePatientPromptMutation = useMutation({
    mutationFn: async (prompt: string) => {
      const res = await apiRequest("POST", "/api/patient-system-prompt", { prompt });
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description:
          "Patient system prompt updated successfully! Your changes will be applied to all new patient messages.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/patient-system-prompt"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to update patient system prompt: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Update trend report prompt mutation
  const updateTrendReportPromptMutation = useMutation({
    mutationFn: async (prompt: string) => {
      const res = await apiRequest("POST", "/api/trend-report-prompt", { prompt });
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Trend report prompt updated successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/trend-report-prompt"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to update trend report prompt: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Get the latest batch ID for regeneration (still needed)
  const { data: latestBatch, isLoading: isBatchLoading } = useQuery({
    queryKey: ["/api/batches/latest"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/batches/latest");
      return await res.json();
    },
  });

  // Update Vapi agent configuration mutation
  const updateVapiAgentMutation = useMutation({
    mutationFn: async (config: typeof vapiConfig) => {
      const res = await apiRequest("PATCH", "/api/vapi/agent", config);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Voice agent configuration updated successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/vapi/agent"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to update voice agent: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Test call mutation
  const testCallMutation = useMutation({
    mutationFn: async ({
      phoneNumber,
      config,
    }: {
      phoneNumber: string;
      config: typeof vapiConfig;
    }) => {
      const res = await apiRequest("POST", "/api/vapi/test-call", {
        phoneNumber,
        ...config,
      });
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Test Call Initiated",
        description:
          "Test call started successfully! You should receive a call shortly.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Test Call Failed",
        description: `Failed to initiate test call: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Regenerate all prompts mutation (updated for consistency with other components)
  const regeneratePromptsMutation = useMutation({
    mutationFn: async () => {
      if (!latestBatch?.batchId) {
        throw new Error("No batch found to regenerate");
      }

      console.log(`Regenerating prompts for batch: ${latestBatch.batchId}`);
      const res = await apiRequest(
        "POST",
        `/api/prompts/regenerate-all?batchId=${latestBatch.batchId}`,
      );

      // Handle non-2xx status codes
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || `Failed with status: ${res.status}`);
      }

      return await res.json();
    },
    onSuccess: (response) => {
      console.log("Regeneration result:", response);

      // If we have data, show appropriate success message
      if (response.data) {
        const { regenerated, total, failedPrompts } = response.data;
        const hasFailures = failedPrompts && failedPrompts.length > 0;

        if (total === 0) {
          toast({
            title: "No Prompts Found",
            description:
              response.message ||
              "No prompts were found to regenerate. Try uploading patient data first.",
            variant: "default",
          });
        } else {
          toast({
            title: "Success",
            description: hasFailures
              ? `Regenerated ${regenerated}/${total} prompts. ${failedPrompts.length} failed.`
              : `Successfully regenerated ${regenerated}/${total} prompts`,
          });
        }
      } else {
        // Generic success message if no data
        toast({
          title: "Success",
          description:
            response.message || "All prompts regenerated successfully",
        });
      }

      // Invalidate both prompts and patient-prompts queries to ensure data consistency
      queryClient.invalidateQueries({ queryKey: ["/api/prompts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/patient-prompts"] });

      if (latestBatch?.batchId) {
        queryClient.invalidateQueries({
          queryKey: ["/api/prompts", latestBatch.batchId],
        });
        queryClient.invalidateQueries({
          queryKey: ["/api/patient-prompts", latestBatch.batchId],
        });
      }
    },
    onError: (error: Error) => {
      console.error("Regeneration error:", error);

      // Friendly error message with suggestions for common issues
      let errorMessage = error.message;

      // Check for common error patterns
      if (errorMessage.includes("not found")) {
        errorMessage =
          "Batch not found. The data may have been deleted. Try uploading new patient data.";
      } else if (errorMessage.includes("No prompts found")) {
        errorMessage =
          "No prompts found for this batch. Try uploading new patient data.";
      }

      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    // Initialize the editor with the fetched or default prompt
    if (defaultSystemPrompt) {
      setCorePrompt(defaultSystemPrompt);
    }
  }, [defaultSystemPrompt]);

  useEffect(() => {
    // Initialize the patient prompt editor with the fetched or default prompt
    if (defaultPatientPrompt) {
      setPatientPrompt(defaultPatientPrompt);
    }
  }, [defaultPatientPrompt]);

  useEffect(() => {
    // Initialize the trend report prompt editor with the fetched or default prompt
    if (defaultTrendReportPrompt) {
      setTrendReportPrompt(defaultTrendReportPrompt);
    }
  }, [defaultTrendReportPrompt]);

  useEffect(() => {
    // Initialize Vapi config when agent data is loaded
    if (vapiAgentConfig && vapiAgentConfig.success) {
      const agent = vapiAgentConfig.data;
      setVapiConfig({
        firstMessage: agent.firstMessage || "",
        systemPrompt:
          voiceAgentTemplate || agent.model?.messages?.[0]?.content || "",
        voiceProvider: agent.voice?.provider || "playht",
        voiceId: agent.voice?.voiceId || "jennifer",
        model: agent.model?.model || "gpt-4",
      });
    }
  }, [vapiAgentConfig, voiceAgentTemplate]);

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

  const handleSavePatientPrompt = () => {
    updatePatientPromptMutation.mutate(patientPrompt);
  };

  const handleResetPatientToDefault = () => {
    // Simply set the local state to the hardcoded default patient prompt
    setPatientPrompt(INITIAL_DEFAULT_PATIENT_PROMPT);
    toast({
      title: "Reset",
      description: "Patient prompt reset to default. Save to apply.",
    });
  };

  const handleSaveTrendReportPrompt = () => {
    updateTrendReportPromptMutation.mutate(trendReportPrompt);
  };

  const handleResetTrendReportToDefault = () => {
    setTrendReportPrompt(INITIAL_DEFAULT_TREND_REPORT_PROMPT);
    toast({
      title: "Reset",
      description: "Trend report prompt reset to default. Save to apply.",
    });
  };

  const handleRegeneratePrompts = () => {
    regeneratePromptsMutation.mutate();
  };

  // Vapi Agent handlers
  const handleSaveVapiAgent = async () => {
    try {
      // First save the template to our database
      const templateResponse = await fetch("/api/voice-agent-template", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          template: vapiConfig.systemPrompt,
        }),
      });

      if (!templateResponse.ok) {
        throw new Error("Failed to save voice agent template");
      }

      // Then update the VAPI agent configuration
      updateVapiAgentMutation.mutate(vapiConfig);

      toast({
        title: "Template Saved",
        description:
          "Voice agent template saved successfully. This template will be used for all patient calls with dynamic patient data.",
      });
    } catch (error) {
      console.error("Error saving voice agent template:", error);
      toast({
        title: "Error",
        description: "Failed to save voice agent template. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleResetVapiAgent = () => {
    if (vapiAgentConfig && vapiAgentConfig.success) {
      const agent = vapiAgentConfig.data;
      setVapiConfig({
        firstMessage: agent.firstMessage || "",
        systemPrompt: agent.model?.messages?.[0]?.content || "",
        voiceProvider: agent.voice?.provider || "playht",
        voiceId: agent.voice?.voiceId || "jennifer",
        model: agent.model?.model || "gpt-4",
      });
    }
    toast({
      title: "Reset",
      description: "Voice agent configuration reset to current saved settings.",
    });
  };

  const handleResetVapiToDefault = () => {
    const defaultSystemPrompt = `You are a healthcare AI assistant calling PATIENT_NAME, a PATIENT_AGE-year-old patient with PATIENT_CONDITION.

PATIENT INFORMATION:
- Name: PATIENT_NAME
- Age: PATIENT_AGE
- Primary Condition: PATIENT_CONDITION

LATEST CARE ASSESSMENT:
PATIENT_PROMPT

CONVERSATION_HISTORY

CALL INSTRUCTIONS:
- You are calling on behalf of their healthcare team
- Be warm, professional, and empathetic in your approach
- Address the patient by their name (PATIENT_NAME)
- Reference their specific health condition (PATIENT_CONDITION) and any concerns mentioned above
- Ask about their current symptoms, medication adherence, and overall well-being
- Provide appropriate health guidance based on their condition and the care assessment
- Offer to schedule follow-up appointments if needed
- Keep the conversation focused on their health but maintain a natural, caring tone
- If they have questions about their condition or treatment, provide helpful information based on the care assessment

IMPORTANT: You have access to their latest health data and personalized care recommendations above. Use this information throughout the conversation to provide relevant, personalized care.`;

    setVapiConfig((prev) => ({
      ...prev,
      systemPrompt: defaultSystemPrompt,
    }));

    toast({
      title: "Reset to Default",
      description:
        "System prompt reset to default template with patient placeholders. Save to apply changes.",
    });
  };

  const handleTestCall = () => {
    if (!testPhoneNumber || testPhoneNumber.trim() === "") {
      toast({
        title: "Phone Number Required",
        description: "Please enter a phone number for the test call",
        variant: "destructive",
      });
      return;
    }

    // Basic phone number validation
    const cleanPhone = testPhoneNumber.replace(/[^\d+]/g, ""); // Keep the + for international numbers
    
    // Check if it's a valid E.164 format (starts with + and 7-15 digits total)
    if (!cleanPhone.startsWith('+')) {
      toast({
        title: "Invalid Phone Number",
        description: "Please enter a phone number in international format (starting with +)",
        variant: "destructive",
      });
      return;
    }
    
    const digitsOnly = cleanPhone.substring(1); // Remove the +
    if (digitsOnly.length < 7 || digitsOnly.length > 15) {
      toast({
        title: "Invalid Phone Number",
        description: "Please enter a valid international phone number (7-15 digits after country code)",
        variant: "destructive",
      });
      return;
    }

    // Use the phone number as-is since it's already in E.164 format
    const formattedPhone = cleanPhone;

    testCallMutation.mutate({
      phoneNumber: formattedPhone,
      config: vapiConfig,
    });
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Prompt Editing</h1>
          <p className="text-gray-600 mt-2">
            Customize AI prompts for triage, companion calls, and monthly
            reports
          </p>
        </div>
      </div>

      <Tabs defaultValue="triage" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="triage" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Triage Prompts
          </TabsTrigger>
          <TabsTrigger value="voice" className="flex items-center gap-2">
            <Volume2 className="w-4 h-4" />
            Companion Prompts
          </TabsTrigger>
          <TabsTrigger value="trends" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Trend Reports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="triage">
          <Card>
            <CardHeader>
              <CardTitle>Core Prompt Editor</CardTitle>
              <CardDescription>
                Edit the core AI prompt that generates patient reports. After
                saving, go to the Triage section to see your changes.
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
                  disabled={
                    updateSystemPromptMutation.isPending || isPromptLoading
                  }
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
                  disabled={
                    regeneratePromptsMutation.isPending ||
                    updateSystemPromptMutation.isPending
                  }
                  variant="outline"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Regenerate All Patient Reports
                </Button>
              </div>

              {(updateSystemPromptMutation.isPending ||
                regeneratePromptsMutation.isPending) && (
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

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Patient Message Prompts</CardTitle>
              <CardDescription>
                Edit the AI prompt that generates direct patient messages. These are separate from caregiver prompts and speak directly to patients.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Textarea
                  placeholder="Loading patient message prompt..."
                  value={patientPrompt}
                  onChange={(e) => setPatientPrompt(e.target.value)}
                  className="min-h-[400px] font-mono text-sm"
                  disabled={isPatientPromptLoading}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleSavePatientPrompt}
                  disabled={
                    updatePatientPromptMutation.isPending || isPatientPromptLoading
                  }
                  className="bg-gradient-to-r from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save Patient Prompt
                </Button>
                <Button
                  onClick={handleResetPatientToDefault}
                  disabled={isPatientPromptLoading}
                  variant="outline"
                >
                  <Undo2 className="w-4 h-4 mr-2" />
                  Reset to Default
                </Button>
              </div>

              {updatePatientPromptMutation.isPending && (
                <Alert>
                  <AlertDescription>
                    Saving your patient message prompt...
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="voice">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Volume2 className="w-5 h-5" />
                AI Voice Agent Configuration
              </CardTitle>
              <CardDescription>
                Configure your AI voice agent's behavior, voice, and responses
                for patient calls.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* First Message Configuration */}
              <div className="space-y-2">
                <Label htmlFor="firstMessage">First Message (Greeting)</Label>
                <Textarea
                  id="firstMessage"
                  placeholder="Hello, this is your healthcare assistant calling with an update..."
                  value={vapiConfig.firstMessage}
                  onChange={(e) =>
                    setVapiConfig((prev) => ({
                      ...prev,
                      firstMessage: e.target.value,
                    }))
                  }
                  className="min-h-[100px]"
                  disabled={isVapiLoading}
                />
                <p className="text-sm text-gray-500">
                  The greeting message your AI agent will speak when calls are
                  answered.
                </p>
              </div>

              {/* System Prompt Configuration */}
              <div className="space-y-2">
                <Label htmlFor="vapiSystemPrompt">AI Agent System Prompt</Label>
                <Textarea
                  id="vapiSystemPrompt"
                  placeholder="You are a professional healthcare assistant. Speak clearly and compassionately..."
                  value={vapiConfig.systemPrompt}
                  onChange={(e) =>
                    setVapiConfig((prev) => ({
                      ...prev,
                      systemPrompt: e.target.value,
                    }))
                  }
                  className="min-h-[200px] font-mono text-sm"
                  disabled={isVapiLoading}
                />
                <p className="text-sm text-gray-500">
                  Instructions that define your AI agent's personality, role,
                  and conversation guidelines.
                </p>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-2">
                  <p className="text-sm font-medium text-blue-800 mb-2">
                    💡 Dynamic Patient Context
                  </p>
                  <p className="text-sm text-blue-700 mb-2">
                    Use these placeholders in your prompt to automatically
                    inject patient-specific information:
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-xs text-blue-600 font-mono">
                    <div>
                      <code>PATIENT_NAME</code> - Patient's full name
                    </div>
                    <div>
                      <code>PATIENT_AGE</code> - Patient's age
                    </div>
                    <div>
                      <code>PATIENT_CONDITION</code> - Patient's medical
                      condition
                    </div>
                    <div>
                      <code>PATIENT_PROMPT</code> - Latest generated care prompt
                    </div>
                    <div>
                      <code>CONVERSATION_HISTORY</code> - Previous call history
                    </div>
                  </div>
                  <p className="text-xs text-blue-600 mt-2">
                    ⚠️ Note: These placeholders will be replaced with actual
                    patient data when making calls.
                  </p>
                </div>
              </div>

              {/* Voice and Model Configuration */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="voiceProvider">Voice Provider</Label>
                  <Select
                    value={vapiConfig.voiceProvider}
                    onValueChange={(value) => {
                      // Reset voice ID when provider changes to avoid invalid combinations
                      const defaultVoices = {
                        vapi: "Kylie",
                        playht: "jennifer",
                        aws: "joanna",
                        azure: "jenny",
                        deepgram: "aura-asteria-en",
                      };
                      setVapiConfig((prev) => ({
                        ...prev,
                        voiceProvider: value,
                        voiceId:
                          defaultVoices[value as keyof typeof defaultVoices] ||
                          "jennifer",
                      }));
                    }}
                    disabled={isVapiLoading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select provider" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vapi">Vapi (Current)</SelectItem>
                      <SelectItem value="playht">PlayHT</SelectItem>
                      <SelectItem value="aws">Amazon Polly</SelectItem>
                      <SelectItem value="azure">Azure Speech</SelectItem>
                      <SelectItem value="deepgram">Deepgram</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="voiceId">Voice ID</Label>
                  <Select
                    value={vapiConfig.voiceId}
                    onValueChange={(value) =>
                      setVapiConfig((prev) => ({ ...prev, voiceId: value }))
                    }
                    disabled={isVapiLoading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select voice" />
                    </SelectTrigger>
                    <SelectContent>
                      {vapiConfig.voiceProvider === "vapi" && (
                        <>
                          <SelectItem value="Kylie">Kylie (Female)</SelectItem>
                          <SelectItem value="Elliot">Elliot (Male)</SelectItem>
                          <SelectItem value="Rohan">Rohan (Male)</SelectItem>
                          <SelectItem value="Lily">Lily (Female)</SelectItem>
                          <SelectItem value="Savannah">
                            Savannah (Female)
                          </SelectItem>
                          <SelectItem value="Hana">Hana (Female)</SelectItem>
                          <SelectItem value="Thomas">Thomas (Male)</SelectItem>
                          <SelectItem value="Henry">Henry (Male)</SelectItem>
                          <SelectItem value="Paige">Paige (Female)</SelectItem>
                          <SelectItem value="Spencer">
                            Spencer (Male)
                          </SelectItem>
                        </>
                      )}
                      {vapiConfig.voiceProvider === "playht" && (
                        <>
                          <SelectItem value="jennifer">
                            Jennifer (Female, Natural)
                          </SelectItem>
                          <SelectItem value="melissa">
                            Melissa (Female, Professional)
                          </SelectItem>
                          <SelectItem value="will">
                            Will (Male, Warm)
                          </SelectItem>
                          <SelectItem value="chris">
                            Chris (Male, Clear)
                          </SelectItem>
                          <SelectItem value="matt">
                            Matt (Male, Friendly)
                          </SelectItem>
                          <SelectItem value="ruby">
                            Ruby (Female, Energetic)
                          </SelectItem>
                        </>
                      )}
                      {vapiConfig.voiceProvider === "aws" && (
                        <>
                          <SelectItem value="joanna">
                            Joanna (Female, US English)
                          </SelectItem>
                          <SelectItem value="matthew">
                            Matthew (Male, US English)
                          </SelectItem>
                          <SelectItem value="ivy">
                            Ivy (Female, US English)
                          </SelectItem>
                          <SelectItem value="justin">
                            Justin (Male, US English)
                          </SelectItem>
                          <SelectItem value="kendra">
                            Kendra (Female, US English)
                          </SelectItem>
                          <SelectItem value="kimberly">
                            Kimberly (Female, US English)
                          </SelectItem>
                          <SelectItem value="salli">
                            Salli (Female, US English)
                          </SelectItem>
                          <SelectItem value="joey">
                            Joey (Male, US English)
                          </SelectItem>
                        </>
                      )}
                      {vapiConfig.voiceProvider === "azure" && (
                        <>
                          <SelectItem value="jenny">
                            Jenny (Female, Neural)
                          </SelectItem>
                          <SelectItem value="guy">
                            Guy (Male, Neural)
                          </SelectItem>
                          <SelectItem value="aria">
                            Aria (Female, Neural)
                          </SelectItem>
                          <SelectItem value="davis">
                            Davis (Male, Neural)
                          </SelectItem>
                          <SelectItem value="jane">
                            Jane (Female, Neural)
                          </SelectItem>
                          <SelectItem value="jason">
                            Jason (Male, Neural)
                          </SelectItem>
                        </>
                      )}
                      {vapiConfig.voiceProvider === "deepgram" && (
                        <>
                          <SelectItem value="aura-asteria-en">
                            Asteria (Female, Conversational)
                          </SelectItem>
                          <SelectItem value="aura-luna-en">
                            Luna (Female, Warm)
                          </SelectItem>
                          <SelectItem value="aura-stella-en">
                            Stella (Female, Professional)
                          </SelectItem>
                          <SelectItem value="aura-athena-en">
                            Athena (Female, Clear)
                          </SelectItem>
                          <SelectItem value="aura-hera-en">
                            Hera (Female, Confident)
                          </SelectItem>
                          <SelectItem value="aura-orion-en">
                            Orion (Male, Strong)
                          </SelectItem>
                          <SelectItem value="aura-arcas-en">
                            Arcas (Male, Friendly)
                          </SelectItem>
                          <SelectItem value="aura-perseus-en">
                            Perseus (Male, Professional)
                          </SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500">
                    Voice options vary by provider. PlayHT recommended for best
                    quality.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="model">AI Model</Label>
                  <Select
                    value={vapiConfig.model}
                    onValueChange={(value) =>
                      setVapiConfig((prev) => ({ ...prev, model: value }))
                    }
                    disabled={isVapiLoading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gpt-4o-mini">
                        GPT-4o Mini (Current - Fast & Cost-Effective)
                      </SelectItem>
                      <SelectItem value="gpt-4">GPT-4 (Advanced)</SelectItem>
                      <SelectItem value="gpt-4-turbo">
                        GPT-4 Turbo (Fast & Advanced)
                      </SelectItem>
                      <SelectItem value="gpt-3.5-turbo">
                        GPT-3.5 Turbo (Standard)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500">
                    GPT-4 provides better conversation quality for healthcare
                    scenarios.
                  </p>
                </div>
              </div>

              {/* Test Call Section */}
              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold mb-4">
                  Test Your Voice Agent
                </h3>
                <div className="flex gap-2">
                  <Input
                    type="tel"
                    placeholder="+1234567890 (US) or +40753837147 (Romania)"
                    value={testPhoneNumber}
                    onChange={(e) => setTestPhoneNumber(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    onClick={handleTestCall}
                    disabled={testCallMutation.isPending}
                    variant="outline"
                    className="flex-shrink-0"
                  >
                    <Phone className="w-4 h-4 mr-2" />
                    Test Call
                  </Button>
                </div>
                <p className="text-sm text-gray-500 mt-2">
                  Enter your phone number in international format starting with country code (e.g., +1 for US, +40 for Romania).
                  <br />
                  <span className="text-amber-600 font-medium">
                    ⚠️ Note:
                  </span>{" "}
                  Any dynamic patient context placeholders (PATIENT_NAME,
                  PATIENT_AGE, etc.) will be spoken literally since no patient
                  batch is attached to test calls.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 flex-wrap">
                <Button
                  onClick={handleSaveVapiAgent}
                  disabled={updateVapiAgentMutation.isPending || isVapiLoading}
                  className="bg-gradient-to-r from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save Agent Config
                </Button>
                <Button
                  onClick={handleResetVapiAgent}
                  disabled={isVapiLoading}
                  variant="outline"
                >
                  <Undo2 className="w-4 h-4 mr-2" />
                  Reset to Saved
                </Button>
                <Button
                  onClick={handleResetVapiToDefault}
                  disabled={isVapiLoading}
                  variant="outline"
                  className="border-orange-300 text-orange-600 hover:bg-orange-50"
                >
                  <Undo2 className="w-4 h-4 mr-2" />
                  Reset to Default Template
                </Button>
              </div>

              {(updateVapiAgentMutation.isPending ||
                testCallMutation.isPending) && (
                <Alert>
                  <AlertDescription>
                    {updateVapiAgentMutation.isPending
                      ? "Saving voice agent configuration..."
                      : "Initiating test call..."}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends">
          <Card>
            <CardHeader>
              <CardTitle>Trend Report Prompt Editor</CardTitle>
              <CardDescription>
                Edit the AI prompt that generates personalized health trend reports. This prompt is used by the AI Trend Reports feature to analyze patient data and create comprehensive health summaries.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Textarea
                  placeholder="Loading trend report prompt..."
                  value={trendReportPrompt}
                  onChange={(e) => setTrendReportPrompt(e.target.value)}
                  className="min-h-[400px] font-mono text-sm"
                  disabled={isTrendPromptLoading}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleSaveTrendReportPrompt}
                  disabled={updateTrendReportPromptMutation.isPending || isTrendPromptLoading}
                  className="bg-gradient-to-r from-green-500 to-green-700 hover:from-green-600 hover:to-green-800"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save Trend Report Prompt
                </Button>
                <Button
                  onClick={handleResetTrendReportToDefault}
                  disabled={isTrendPromptLoading}
                  variant="outline"
                  className="border-orange-300 text-orange-600 hover:bg-orange-50"
                >
                  <Undo2 className="w-4 h-4 mr-2" />
                  Reset to Default
                </Button>
              </div>

              {updateTrendReportPromptMutation.isPending && (
                <Alert>
                  <AlertDescription>
                    Saving trend report prompt...
                  </AlertDescription>
                </Alert>
              )}

              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h4 className="font-semibold text-blue-900 mb-2">Trend Report Template Variables</h4>
                <div className="text-sm text-blue-800 space-y-1">
                  <p><code className="bg-blue-100 px-1 rounded">{'${patient.name}'}</code> - Patient's full name</p>
                  <p><code className="bg-blue-100 px-1 rounded">{'${patient.age}'}</code> - Patient's calculated age</p>
                  <p><code className="bg-blue-100 px-1 rounded">{'${patient.condition}'}</code> - Patient's primary health condition</p>
                  <p><code className="bg-blue-100 px-1 rounded">{'${patient.isAlert}'}</code> - Alert status (true/false)</p>
                  <p><code className="bg-blue-100 px-1 rounded">{'${patient.variables}'}</code> - Additional health data and measurements</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
