import { useState } from "react";
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

export default function AIPoweredTriage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPrompt, setSelectedPrompt] = useState<PatientPrompt | null>(null);
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);
  const [reasoningDialogOpen, setReasoningDialogOpen] = useState(false);

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
      const res = await apiRequest("POST", "/api/prompts/regenerate-all");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prompts"] });
      toast({
        title: "Success",
        description: "All prompts regenerated successfully",
      });
    }
  });

  // Deduplicate prompts by patient name
  const uniquePatientPrompts = prompts ? 
    Object.values(
      prompts.reduce((acc, prompt) => {
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
            <ReactMarkdown>{selectedPrompt?.reasoning || "No reasoning available for this prompt."}</ReactMarkdown>
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button 
              variant="outline" 
              onClick={() => setReasoningDialogOpen(false)}
            >
              Close
            </Button>
            <Button 
              onClick={() => selectedPrompt?.reasoning && handleCopyPrompt(selectedPrompt.reasoning)}
            >
              <Copy className="w-4 h-4 mr-2" /> Copy Text
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}