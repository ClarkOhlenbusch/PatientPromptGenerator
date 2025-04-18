import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { RefreshCw, Save } from "lucide-react";
import { PatientPrompt } from "@shared/schema";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function PromptEditingSandbox() {
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [selectedBatchId, setSelectedBatchId] = useState<string>("");
  const [promptTemplate, setPromptTemplate] = useState<string>("");
  const [originalTemplate, setOriginalTemplate] = useState<string>("");
  const { toast } = useToast();
  
  // Query to get all patient batches
  const { data: patientBatches, isLoading: batchesLoading } = useQuery({
    queryKey: ["/api/batches"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/batches");
        return await res.json();
      } catch (error) {
        console.error("Failed to fetch batches:", error);
        toast({
          title: "Error",
          description: "Failed to load patient batches",
          variant: "destructive"
        });
        return [];
      }
    }
  });
  
  // Query to get patients from selected batch
  const { data: patients, isLoading: patientsLoading } = useQuery({
    queryKey: ["/api/patient-prompts", selectedBatchId],
    queryFn: async () => {
      if (!selectedBatchId) return [];
      try {
        const res = await apiRequest("GET", `/api/patient-prompts/${selectedBatchId}`);
        return await res.json();
      } catch (error) {
        console.error("Failed to fetch patients:", error);
        toast({
          title: "Error",
          description: "Failed to load patients",
          variant: "destructive"
        });
        return [];
      }
    },
    enabled: !!selectedBatchId
  });
  
  // Query to get prompt template
  const { data: selectedTemplate, isLoading: templateLoading } = useQuery({
    queryKey: ["/api/prompt-template", selectedPatientId],
    queryFn: async () => {
      if (!selectedPatientId) return null;
      try {
        const res = await apiRequest("GET", `/api/prompt-template/${selectedPatientId}`);
        return await res.json();
      } catch (error) {
        console.error("Failed to fetch template:", error);
        toast({
          title: "Error",
          description: "Failed to load prompt template",
          variant: "destructive"
        });
        return null;
      }
    },
    enabled: !!selectedPatientId
  });
  
  // Update prompt template
  const updateTemplateMutation = useMutation({
    mutationFn: async (data: { patientId: string, template: string }) => {
      const res = await apiRequest("POST", "/api/update-prompt-template", data);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Prompt template updated successfully",
      });
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["/api/prompt-template", selectedPatientId] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to update template: ${error.message}`,
        variant: "destructive"
      });
    }
  });
  
  // Regenerate prompt with updated template
  const regeneratePromptMutation = useMutation({
    mutationFn: async (data: { patientId: string, template: string }) => {
      const res = await apiRequest("POST", "/api/regenerate-prompt-with-template", data);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Patient prompt regenerated successfully",
      });
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["/api/patient-prompts", selectedBatchId] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to regenerate prompt: ${error.message}`,
        variant: "destructive"
      });
    }
  });
  
  // Update local state when template is loaded
  useEffect(() => {
    if (selectedTemplate) {
      setPromptTemplate(selectedTemplate.template);
      setOriginalTemplate(selectedTemplate.originalTemplate || selectedTemplate.template);
    }
  }, [selectedTemplate]);
  
  const handleSaveTemplate = () => {
    if (selectedPatientId && promptTemplate) {
      updateTemplateMutation.mutate({
        patientId: selectedPatientId,
        template: promptTemplate
      });
    }
  };
  
  const handleRegeneratePrompt = () => {
    if (selectedPatientId && promptTemplate) {
      regeneratePromptMutation.mutate({
        patientId: selectedPatientId,
        template: promptTemplate
      });
    }
  };
  
  const handleResetTemplate = () => {
    setPromptTemplate(originalTemplate);
    toast({
      title: "Template Reset",
      description: "Prompt template reset to original version",
    });
  };
  
  return (
    <div className="container mx-auto">
      <h1 className="text-3xl font-bold mb-6">AI-Prompt Editing Sandbox</h1>
      <p className="text-gray-600 mb-8">
        Edit and customize prompt templates for patients. Your changes will be used for future prompt generation.
      </p>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Select Patient</CardTitle>
            <CardDescription>
              Choose a batch and patient to edit their prompt template
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="batch-select">Batch</Label>
              <Select
                value={selectedBatchId}
                onValueChange={(value) => {
                  setSelectedBatchId(value);
                  setSelectedPatientId("");
                }}
                disabled={batchesLoading}
              >
                <SelectTrigger id="batch-select">
                  <SelectValue placeholder="Select a batch" />
                </SelectTrigger>
                <SelectContent>
                  {patientBatches?.map((batch: any) => (
                    <SelectItem key={batch.id} value={batch.id}>
                      {new Date(batch.createdAt).toLocaleDateString()} ({batch.id.slice(0, 6)}...)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="patient-select">Patient</Label>
              <Select
                value={selectedPatientId}
                onValueChange={setSelectedPatientId}
                disabled={!selectedBatchId || patientsLoading}
              >
                <SelectTrigger id="patient-select">
                  <SelectValue placeholder="Select a patient" />
                </SelectTrigger>
                <SelectContent>
                  {patients?.map((patient: PatientPrompt) => (
                    <SelectItem key={patient.patientId} value={patient.patientId}>
                      {patient.name} (ID: {patient.patientId})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="pt-4">
              <h3 className="font-medium text-sm text-gray-500 mb-2">Template Variables</h3>
              <ul className="list-disc pl-5 text-sm text-gray-600 space-y-1">
                <li><code>{"{name}"}</code> - Patient's name</li>
                <li><code>{"{age}"}</code> - Patient's age</li>
                <li><code>{"{reasoning}"}</code> - AI reasoning</li>
                <li><code>{"{condition}"}</code> - Patient's condition</li>
                <li><code>{"{current}"}</code> - Current value</li>
                <li><code>{"{slope}"}</code> - Trend change</li>
                <li><code>{"{compliance}"}</code> - Compliance %</li>
              </ul>
            </div>
          </CardContent>
        </Card>
        
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Edit Prompt Template</CardTitle>
            <CardDescription>
              Customize the template that will be used to generate the patient's prompt
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={promptTemplate}
              onChange={(e) => setPromptTemplate(e.target.value)}
              placeholder="Select a patient to edit their prompt template"
              className="min-h-[300px] font-mono text-sm"
              disabled={!selectedPatientId || templateLoading}
            />
          </CardContent>
          <CardFooter className="flex justify-between">
            <div>
              <Button 
                variant="outline" 
                onClick={handleResetTemplate}
                disabled={!selectedPatientId || templateLoading}
              >
                Reset to Original
              </Button>
            </div>
            <div className="space-x-2">
              <Button
                variant="outline"
                onClick={handleSaveTemplate}
                disabled={!selectedPatientId || updateTemplateMutation.isPending}
              >
                <Save className="h-4 w-4 mr-2" />
                Save Template
              </Button>
              <Button
                onClick={handleRegeneratePrompt}
                disabled={!selectedPatientId || regeneratePromptMutation.isPending}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${regeneratePromptMutation.isPending ? 'animate-spin' : ''}`} />
                Regenerate Prompt
              </Button>
            </div>
          </CardFooter>
        </Card>
      </div>
      
      {/* Preview section for the currently generated prompt */}
      {selectedPatientId && patients?.length > 0 && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Current Generated Prompt</CardTitle>
            <CardDescription>
              This is the current prompt generated for the selected patient
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-gray-50 p-4 rounded-md">
              <p className="whitespace-pre-wrap">
                {patients.find((p: PatientPrompt) => p.patientId === selectedPatientId)?.prompt || 
                "No prompt available for this patient."}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}