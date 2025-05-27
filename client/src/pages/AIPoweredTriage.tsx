import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, RotateCw, FileDown, Copy, Maximize2, Phone, History, Clock, MessageSquare } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import ReactMarkdown from 'react-markdown';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PatientPrompt {
  id: number;
  patientName: string;
  age: number;
  condition: string;
  promptText: string;
  reasoning: string;
  isAlert: boolean;
  status: 'healthy' | 'alert';
}

interface CallHistory {
  id: number;
  callId: string;
  patientId: string;
  patientName: string;
  phoneNumber: string;
  duration: number;
  status: string;
  summary: string;
  keyPoints: string[];
  healthConcerns: string[];
  followUpItems: string[];
  callDate: string;
  transcript?: string;
}

// Utility function to extract reasoning from prompt text
const extractReasoning = (promptText: string): { displayPrompt: string, reasoning: string } => {
  // First check for explicitly marked reasoning section with various formats
  // Format 1: **Reasoning:** text
  const markdownReasoningMatch = promptText.match(/\*\*Reasoning:\*\*\s*([\s\S]*?)(\n\s*$|$)/);
  
  if (markdownReasoningMatch) {
    // Extract the reasoning text
    const reasoning = markdownReasoningMatch[1].trim();
    
    // Remove the reasoning section from the prompt
    const displayPrompt = promptText.replace(/\*\*Reasoning:\*\*\s*([\s\S]*?)(\n\s*$|$)/, '').trim();
    
    return { displayPrompt, reasoning };
  }
  
  // Format 2: Reasoning: text
  const plainReasoningMatch = promptText.match(/(?:^|\n|\r)Reasoning:\s*([\s\S]*?)(\n\s*$|$)/i);
  
  if (plainReasoningMatch) {
    // Extract the reasoning text
    const reasoning = plainReasoningMatch[1].trim();
    
    // Remove the reasoning section from the prompt
    const displayPrompt = promptText.replace(/(?:^|\n|\r)Reasoning:\s*([\s\S]*?)(\n\s*$|$)/i, '').trim();
    
    return { displayPrompt, reasoning };
  }
  
  // Format 3: **Reasoning** text or **Reasoning**:text
  const boldReasoningMatch = promptText.match(/\*\*Reasoning\*\*:?\s*([\s\S]*?)(\n\s*$|$)/i);
  
  if (boldReasoningMatch) {
    // Extract the reasoning text
    const reasoning = boldReasoningMatch[1].trim();
    
    // Remove the reasoning section from the prompt
    const displayPrompt = promptText.replace(/\*\*Reasoning\*\*:?\s*([\s\S]*?)(\n\s*$|$)/i, '').trim();
    
    return { displayPrompt, reasoning };
  }
  
  // If no specific format is found, check for a section labeled with anything like "Reasoning"
  const lines = promptText.trim().split(/\n/);
  
  // Look for any heading that might be a reasoning section in the latter half of the document
  const reasoningHeaderIndex = lines.findIndex((line, index) => 
    index > lines.length / 2 && ( // Only look in the second half of the content
      line.toLowerCase().includes("reasoning") || 
      line.toLowerCase().includes("rationale") ||
      line.toLowerCase().includes("justification") ||
      (line.startsWith("**") && line.endsWith("**")) // Any bold section header
    )
  );
  
  if (reasoningHeaderIndex !== -1) {
    // Extract everything after the reasoning header
    const displayPrompt = lines.slice(0, reasoningHeaderIndex).join('\n').trim();
    const reasoning = lines.slice(reasoningHeaderIndex).join('\n').trim();
    
    return { displayPrompt, reasoning };
  }
  
  // Fallback: If no reasoning section is found at all, return original with no reasoning
  return { displayPrompt: promptText, reasoning: "No explicit reasoning provided." };
};

export default function AIPoweredTriage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPrompt, setSelectedPrompt] = useState<PatientPrompt | null>(null);
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);
  const [reasoningDialogOpen, setReasoningDialogOpen] = useState(false);
  const [processedPrompts, setProcessedPrompts] = useState<PatientPrompt[]>([]);
  const [phoneNumbers, setPhoneNumbers] = useState<Record<number, string>>({});

  // Query to get the latest batch
  const { data: latestBatch, isLoading: isBatchLoading } = useQuery({
    queryKey: ["/api/batches/latest"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/batches/latest");
      const data = await res.json();
      // Handle standardized API response format
      return data.success && data.data ? data.data : null;
    },
    retry: 1 // Limit retries to prevent excessive calls
  });
  
  // Get all batches to find one with prompts
  const { data: allBatches, isLoading: isBatchesLoading } = useQuery<any[]>({
    queryKey: ["/api/batches"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/batches");
      const data = await res.json();
      // Handle standardized API response format
      return data.success && data.data ? data.data : [];
    },
    retry: 1
  });
  
  // Find the most recent batch that has prompts
  const [batchWithPrompts, setBatchWithPrompts] = useState<string | null>(null);
  
  useEffect(() => {
    // If we have the latest batch but no prompts found, try to find the most recent batch with prompts
    async function findBatchWithPrompts() {
      if (allBatches && allBatches.length > 0) {
        // Try each batch in reverse order (newest to oldest) until we find one with prompts
        for (const batch of [...allBatches].reverse()) {
          try {
            const response = await fetch(`/api/patient-prompts/${batch.batchId}`, {
              method: 'GET',
              credentials: 'include',
              headers: {
                'Content-Type': 'application/json'
              }
            });
            
            if (response.ok) {
              const data = await response.json();
              // Handle standardized API response format
              const prompts = data.success && data.data ? data.data : [];
              if (Array.isArray(prompts) && prompts.length > 0) {
                setBatchWithPrompts(batch.batchId);
                break;
              }
            }
          } catch (error) {
            console.error(`Error checking batch ${batch.batchId}:`, error);
          }
        }
      }
    }
    
    if (!batchWithPrompts) {
      findBatchWithPrompts();
    }
  }, [allBatches, batchWithPrompts]);
  
  // Use either the batch with prompts or the latest batch
  const effectiveBatchId = batchWithPrompts || latestBatch?.batchId;
  
  // Query to get all patient prompts
  const { data: prompts, isLoading: isPromptsLoading } = useQuery<PatientPrompt[]>({
    queryKey: ["/api/patient-prompts", effectiveBatchId],
    queryFn: async () => {
      try {
        if (!effectiveBatchId) {
          return [];
        }
        // Use the correct API endpoint that returns an array of prompts
        const res = await apiRequest("GET", `/api/patient-prompts/${effectiveBatchId}`);
        const data = await res.json();
        
        // Handle standardized API response format
        if (data.success && data.data) {
          if (Array.isArray(data.data)) {
            return data.data;
          }
        }
          
        // If the data doesn't match the expected format, log error and show toast
        console.error("API did not return expected data format:", data);
        toast({
          title: "Data Error",
          description: "Received unexpected data format from server",
          variant: "destructive"
        });
        return [];
      } catch (error) {
        console.error("Failed to fetch prompts:", error);
        toast({
          title: "Error",
          description: "Failed to load patient prompts",
          variant: "destructive"
        });
        return [];
      }
    },
    enabled: !!effectiveBatchId,
    retry: 1
  });
  
  // Process prompts to extract reasoning when they change
  useEffect(() => {
    if (prompts) {
      const processed = prompts.map(prompt => {
        // The API returns 'prompt' but our component expects 'promptText'
        // Handle both possible field names
        const promptContent = (prompt as any).promptText || (prompt as any).prompt;
        
        if (!promptContent) {
          console.error("Prompt content is missing:", prompt);
          return {
            ...prompt,
            promptText: "Error: Missing prompt content", 
            reasoning: "No reasoning available due to missing prompt content"
          };
        }
        
        // Extract reasoning from the prompt text regardless of whether reasoning exists
        // This ensures we always separate the reasoning from the prompt text
        const { displayPrompt, reasoning } = extractReasoning(promptContent);
        
        // Map the status field - database has healthStatus but frontend expects status
        let status: 'healthy' | 'alert' = 'alert'; // Default to alert
        if ((prompt as any).status) {
          status = (prompt as any).status;
        } else if ((prompt as any).healthStatus === 'healthy') {
          status = 'healthy';
        } else if ((prompt as any).isAlert === 'false') {
          status = 'healthy';
        }
        
        return {
          ...prompt,
          patientName: ((prompt as any).patientName || (prompt as any).name).replace(/\s*\([^)]*\)\s*/g, ''), // Remove parentheses from name
          promptText: displayPrompt, // Only the prompt part without reasoning
          reasoning: reasoning || (prompt as any).reasoning, // Store the reasoning separately
          status: status, // Map the status field
          isAlert: status === 'alert' // Set isAlert based on status
        };
      });
      setProcessedPrompts(processed);
    }
  }, [prompts]);

  // Mutation for regenerating a single prompt
  const regeneratePromptMutation = useMutation({
    mutationFn: async (patientId: number) => {
      console.log(`Regenerating prompt with ID: ${patientId}`);
      // Use the standardized endpoint for single prompt regeneration
      const res = await apiRequest("POST", `/api/prompts/${patientId}/regenerate`);
      
      // Handle non-2xx responses
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || `Failed with status: ${res.status}`);
      }
      
      return await res.json();
    },
    onSuccess: (response) => {
      console.log("Successfully regenerated single prompt:", response);
      
      // Force refetch the patient prompts to ensure we get the latest data
      // First invalidate all queries that might contain this data
      queryClient.invalidateQueries({ queryKey: ["/api/patient-prompts"] });
      if (effectiveBatchId) {
        queryClient.invalidateQueries({ queryKey: ["/api/patient-prompts", effectiveBatchId] });
      }
      
      // Show success message
      toast({
        title: "Success",
        description: response.message || "Prompt regenerated successfully",
      });
      
      // Force refetch the data after a short delay to allow the server to complete any processing
      setTimeout(() => {
        queryClient.refetchQueries({ queryKey: ["/api/patient-prompts", effectiveBatchId] });
      }, 500);
    },
    onError: (error: Error) => {
      console.error("Failed to regenerate prompt:", error);
      toast({
        title: "Error",
        description: `Failed to regenerate prompt: ${error.message}`,
        variant: "destructive"
      });
    }
  });
  
  // Mutation for regenerating all prompts in a batch
  const regenerateAllMutation = useMutation({
    mutationFn: async (batchId: string) => {
      if (!batchId) {
        throw new Error("No batch found to regenerate");
      }
      
      console.log(`Regenerating all prompts for batch: ${batchId}`);
      // Use the standardized API endpoint
      const res = await apiRequest("POST", `/api/prompts/regenerate-all?batchId=${batchId}`);
      
      // Handle non-2xx responses
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || `Failed with status: ${res.status}`);
      }
      
      return await res.json();
    },
    onSuccess: (response, batchId) => {
      console.log("Regeneration result:", response);
      
      // Clear any cached data to ensure we get fresh data
      queryClient.invalidateQueries({ queryKey: ["/api/patient-prompts"] });
      if (batchId) {
        queryClient.invalidateQueries({ queryKey: ["/api/patient-prompts", batchId] });
      }
      
      // If we have data, show a success message with details
      if (response.data) {
        const { regenerated, total, failedPrompts } = response.data;
        const hasFailures = failedPrompts && failedPrompts.length > 0;
        
        toast({
          title: "Success",
          description: hasFailures
            ? `Regenerated ${regenerated}/${total} prompts. ${failedPrompts.length} failed.`
            : `Successfully regenerated ${regenerated}/${total} prompts`,
        });
      } else {
        // If no data, show a generic success message
        toast({
          title: "Success",
          description: response.message || "All prompts regenerated successfully",
        });
      }
      
      // Force refetch the data after a short delay to allow the server to complete any processing
      setTimeout(() => {
        queryClient.refetchQueries({ queryKey: ["/api/patient-prompts", batchId] });
      }, 500);
    },
    onError: (error: Error) => {
      console.error("Failed to regenerate all prompts:", error);
      toast({
        title: "Error",
        description: `Failed to regenerate prompts: ${error.message}`,
        variant: "destructive"
      });
    }
  });

  // Mutation for calling patients via Vapi
  const callPatientMutation = useMutation({
    mutationFn: async ({ patientId, phoneNumber, patientData }: { 
      patientId: number; 
      phoneNumber: string; 
      patientData: PatientPrompt 
    }) => {
      const res = await apiRequest("POST", "/api/vapi/call", {
        patientId,
        phoneNumber,
        patientName: patientData.patientName,
        carePrompt: patientData.promptText,
        condition: patientData.condition,
        age: patientData.age
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || `Failed with status: ${res.status}`);
      }
      
      return await res.json();
    },
    onSuccess: (response, variables) => {
      toast({
        title: "Call Initiated",
        description: `Successfully calling ${variables.patientData.patientName} at ${variables.phoneNumber}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Call Failed",
        description: `Failed to initiate call: ${error.message}`,
        variant: "destructive"
      });
    }
  });
  
  // Deduplicate prompts by patient name
  const uniquePatientPrompts = processedPrompts ? 
    Object.values(
      processedPrompts.reduce((acc, prompt) => {
        // Use patient name as the unique key
        if (!acc[prompt.patientName] || prompt.id > acc[prompt.patientName].id) {
          // Keep the latest prompt (highest ID) for each patient
          acc[prompt.patientName] = prompt;
        }
        return acc;
      }, {} as Record<string, PatientPrompt>)
    ) : [];

  // Filter prompts based on search query
  const filteredPrompts = uniquePatientPrompts.filter(prompt => 
    prompt.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    prompt.condition.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Handle copying prompt to clipboard
  const handleCopyPrompt = (prompt: string, includeReasoning: boolean = false) => {
    navigator.clipboard.writeText(prompt);
      toast({
      title: "Copied",
      description: `${includeReasoning ? "Full prompt" : "Prompt"} copied to clipboard`,
    });
  };

  // Handle opening the full prompt dialog
  const handleViewFullPrompt = (prompt: PatientPrompt) => {
    setSelectedPrompt(prompt);
    setPromptDialogOpen(true);
  };

  // Handle opening the reasoning dialog
  const handleViewReasoning = (prompt: PatientPrompt) => {
    setSelectedPrompt(prompt);
    setReasoningDialogOpen(true);
  };

  // Handle phone number changes
  const handlePhoneNumberChange = (patientId: number, phoneNumber: string) => {
    setPhoneNumbers(prev => ({
      ...prev,
      [patientId]: phoneNumber
    }));
  };

  // Handle calling a patient
  const handleCallPatient = (prompt: PatientPrompt) => {
    const phoneNumber = phoneNumbers[prompt.id];
    if (!phoneNumber || phoneNumber.trim() === '') {
      toast({
        title: "Phone Number Required",
        description: "Please enter a phone number before calling",
        variant: "destructive"
      });
      return;
    }

    // Basic phone number validation (E.164 format)
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    if (cleanPhone.length < 10 || cleanPhone.length > 15) {
      toast({
        title: "Invalid Phone Number",
        description: "Please enter a valid phone number (10-15 digits)",
        variant: "destructive"
      });
      return;
    }

    // Format phone number to E.164 format
    const formattedPhone = cleanPhone.startsWith('1') ? `+${cleanPhone}` : `+1${cleanPhone}`;

    callPatientMutation.mutate({
      patientId: prompt.id,
      phoneNumber: formattedPhone,
      patientData: prompt
    });
  };
  
  // Add CSV export function
  const handleExportCSV = () => {
    // Create CSV header
    const headers = ['Patient Name', 'Age', 'Condition', 'Status', 'Generated Prompt', 'Reasoning'];
    
    // Convert prompts to CSV rows
    const csvRows = [
      headers.join(','), // Header row
      ...uniquePatientPrompts.map(prompt => {
        // Escape and clean data for CSV format
        const escapeCsvField = (field: string) => {
          const cleaned = field.replace(/"/g, '""'); // Escape quotes
          return `"${cleaned}"`; // Wrap in quotes to handle commas and newlines
        };
        
        return [
          escapeCsvField(prompt.patientName),
          prompt.age,
          escapeCsvField(prompt.condition),
          escapeCsvField(prompt.status),
          escapeCsvField(prompt.promptText),
          escapeCsvField(prompt.reasoning || 'No reasoning provided')
        ].join(',');
      })
    ].join('\n');

    // Create and trigger download
    const blob = new Blob([csvRows], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `patient_prompts_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: "Success",
      description: "CSV file downloaded successfully",
    });
  };
  
  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Generated Patient Prompts</h1>
          <p className="text-gray-600 mt-2">
            Total patients: {uniquePatientPrompts.length || 0}
          </p>
              </div>
        <div className="flex gap-4">
          <Button
            variant="outline"
            onClick={handleExportCSV}
                  >
            <FileDown className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
                <Button 
            variant="default"
            onClick={() => effectiveBatchId && regenerateAllMutation.mutate(effectiveBatchId)}
            disabled={regenerateAllMutation.isPending || !effectiveBatchId}
          >
            <RotateCw className={`w-4 h-4 mr-2 ${regenerateAllMutation.isPending ? 'animate-spin' : ''}`} />
            Regenerate All
                </Button>
              </div>
            </div>
            
      <div className="mb-6">
        <Input
          placeholder="Search patients..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-md"
        />
      </div>
      
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Patient Name</TableHead>
                <TableHead>Age</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead className="w-[30%]">Generated Prompt</TableHead>
                <TableHead className="w-[180px]">Phone Number</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPromptsLoading || isBatchLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <div className="flex justify-center items-center">
                      <RotateCw className="w-6 h-6 animate-spin text-gray-400" />
            </div>
                  </TableCell>
                </TableRow>
              ) : !latestBatch?.batchId ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                    No batch found. Please upload a patient data file first.
                  </TableCell>
                </TableRow>
              ) : filteredPrompts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                    No prompts found in the current batch.
                  </TableCell>
                </TableRow>
              ) : (
                filteredPrompts.map((prompt) => (
                  <TableRow key={prompt.id}>
                    <TableCell>{prompt.id}</TableCell>
                    <TableCell>{prompt.patientName}</TableCell>
                    <TableCell>{prompt.age}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        prompt.status === 'healthy' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {prompt.condition}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-md">
                      <div className="truncate relative">
                        {prompt.promptText}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="tel"
                        placeholder="(555) 123-4567"
                        value={phoneNumbers[prompt.id] || ''}
                        onChange={(e) => handlePhoneNumberChange(prompt.id, e.target.value)}
                        className="w-full"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleCallPatient(prompt)}
                          disabled={callPatientMutation.isPending}
                          className="text-green-600 hover:text-green-700 hover:bg-green-50"
                        >
                          <Phone className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleViewFullPrompt(prompt)}
                        >
                          <Maximize2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleViewReasoning(prompt)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleCopyPrompt(prompt.promptText)}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => regeneratePromptMutation.mutate(prompt.id)}
                          disabled={regeneratePromptMutation.isPending}
                        >
                          <RotateCw className={`w-4 h-4 ${
                            regeneratePromptMutation.isPending ? 'animate-spin' : ''
                          }`} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Full Prompt Dialog */}
      <Dialog open={promptDialogOpen} onOpenChange={setPromptDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedPrompt?.patientName} - Full Generated Prompt
            </DialogTitle>
            <DialogDescription>
              Age: {selectedPrompt?.age} - Condition: {selectedPrompt?.condition}
            </DialogDescription>
          </DialogHeader>
          
          <div className="mt-4 bg-gray-50 p-4 rounded-md prose prose-sm max-w-none">
            <ReactMarkdown>{selectedPrompt?.promptText || ""}</ReactMarkdown>
                          </div>
                          
          <div className="flex justify-end gap-2 mt-4">
            <Button 
              variant="outline" 
              onClick={() => setPromptDialogOpen(false)}
            >
              Close
            </Button>
                              <Button 
              onClick={() => selectedPrompt && handleCopyPrompt(selectedPrompt.promptText)}
                              >
              <Copy className="w-4 h-4 mr-2" /> Copy Text
                              </Button>
                            </div>
        </DialogContent>
      </Dialog>

      {/* Reasoning Dialog */}
      <Dialog open={reasoningDialogOpen} onOpenChange={setReasoningDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedPrompt?.patientName} - AI Reasoning
            </DialogTitle>
            <DialogDescription>
              The AI's reasoning process for generating this patient's prompt
            </DialogDescription>
          </DialogHeader>
          
          <div className="mt-4 bg-gray-50 p-4 rounded-md prose prose-sm max-w-none">
            {selectedPrompt?.reasoning && selectedPrompt.reasoning.trim().length > 0 ? (
              <ReactMarkdown>{selectedPrompt.reasoning}</ReactMarkdown>
            ) : (
              <p>No reasoning provided for this prompt.</p>
                          )}
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button 
              variant="outline" 
              onClick={() => setReasoningDialogOpen(false)}
            >
              Close
            </Button>
            {selectedPrompt?.reasoning && selectedPrompt.reasoning.trim().length > 0 && (
              <Button 
                onClick={() => selectedPrompt?.reasoning && handleCopyPrompt(selectedPrompt.reasoning, true)}
              >
                <Copy className="w-4 h-4 mr-2" /> Copy Text
              </Button>
            )}
            </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}