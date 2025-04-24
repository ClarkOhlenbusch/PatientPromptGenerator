import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, RotateCw, FileDown, Copy, Maximize2 } from "lucide-react";
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

  // Query to get the latest batch
  const { data: latestBatch, isLoading: isBatchLoading } = useQuery({
    queryKey: ["/api/batches/latest"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/batches/latest");
      return await res.json();
    }
  });

  // Query to get all patient prompts
  const { data: prompts, isLoading: isPromptsLoading } = useQuery<PatientPrompt[]>({
    queryKey: ["/api/prompts", latestBatch?.batchId],
    queryFn: async () => {
      try {
        if (!latestBatch?.batchId) {
          return [];
        }
        const res = await apiRequest("GET", `/api/prompts?batchId=${latestBatch.batchId}`);
        return await res.json();
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
    enabled: !!latestBatch?.batchId
  });

  // Process prompts to extract reasoning when they change
  useEffect(() => {
    if (prompts) {
      const processed = prompts.map(prompt => {
        // If the prompt already has reasoning, use it
        if (prompt.reasoning && prompt.reasoning.trim().length > 0) {
          return prompt;
        }
        
        // Otherwise extract reasoning from the prompt text
        const { displayPrompt, reasoning } = extractReasoning(prompt.promptText);
        return {
          ...prompt,
          promptText: displayPrompt,
          reasoning: reasoning
        };
      });
      setProcessedPrompts(processed);
    }
  }, [prompts]);

  // Mutation for regenerating prompts
  const regeneratePromptMutation = useMutation({
    mutationFn: async (patientId: number) => {
      const res = await apiRequest("POST", `/api/prompts/${patientId}/regenerate`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prompts"] });
      toast({
        title: "Success",
        description: "Prompt regenerated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to regenerate prompt: ${error.message}`,
        variant: "destructive"
      });
    }
  });

  // Mutation for regenerating all prompts
  const regenerateAllMutation = useMutation({
    mutationFn: async () => {
      if (!latestBatch?.batchId) {
        throw new Error("No batch found to regenerate");
      }
      
      console.log(`Regenerating all prompts for batch: ${latestBatch.batchId}`);
      const res = await apiRequest("POST", `/api/prompts/regenerate-all?batchId=${latestBatch.batchId}`);
      return await res.json();
    },
    onSuccess: (data) => {
      console.log("Regeneration result:", data);
      // Invalidate both general prompts query and the specific batch query
      queryClient.invalidateQueries({ queryKey: ["/api/prompts"] });
      if (latestBatch?.batchId) {
        queryClient.invalidateQueries({ queryKey: ["/api/prompts", latestBatch.batchId] });
      }
      
      toast({
        title: "Success",
        description: data.regenerated 
          ? `Successfully regenerated ${data.regenerated}/${data.total} prompts`
          : "All prompts regenerated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to regenerate prompts: ${error.message}`,
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
  const handleCopyPrompt = (prompt: string) => {
    navigator.clipboard.writeText(prompt);
    toast({
      title: "Copied",
      description: "Prompt copied to clipboard",
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
            onClick={() => {
              // Handle CSV export
              // Implementation needed
            }}
          >
            <FileDown className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          <Button
            variant="default"
            onClick={() => regenerateAllMutation.mutate()}
            disabled={regenerateAllMutation.isPending}
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
                <TableHead className="w-[40%]">Generated Prompt</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPromptsLoading || isBatchLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <div className="flex justify-center items-center">
                      <RotateCw className="w-6 h-6 animate-spin text-gray-400" />
                    </div>
                  </TableCell>
                </TableRow>
              ) : !latestBatch?.batchId ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                    No batch found. Please upload a patient data file first.
                  </TableCell>
                </TableRow>
              ) : filteredPrompts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-gray-500">
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
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
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
                onClick={() => selectedPrompt?.reasoning && handleCopyPrompt(selectedPrompt.reasoning)}
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