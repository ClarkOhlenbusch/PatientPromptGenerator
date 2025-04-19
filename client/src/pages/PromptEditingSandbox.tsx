import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, RefreshCw, Save, Trash2, Edit, Check, X } from "lucide-react";
import { PatientPrompt } from "@shared/schema";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function PromptEditingSandbox() {
  // State for patient selection
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [selectedBatchId, setSelectedBatchId] = useState<string>("");
  
  // State for prompt templates
  const [promptTemplate, setPromptTemplate] = useState<string>("");
  const [originalTemplate, setOriginalTemplate] = useState<string>("");
  
  // State for system prompt
  const [systemPrompt, setSystemPrompt] = useState<string>("");
  const [isEditingSystemPrompt, setIsEditingSystemPrompt] = useState<boolean>(false);
  
  // State for template variables
  const [currentTab, setCurrentTab] = useState<string>("template");
  const [newVariable, setNewVariable] = useState<{
    placeholder: string;
    description: string;
    example: string;
  }>({ placeholder: "", description: "", example: "" });
  const [editingVariableId, setEditingVariableId] = useState<number | null>(null);
  const [editingVariable, setEditingVariable] = useState<{
    placeholder: string;
    description: string;
    example: string;
  }>({ placeholder: "", description: "", example: "" });
  
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
  
  // Query to get system prompt
  const { data: systemPromptData, isLoading: systemPromptLoading } = useQuery({
    queryKey: ["/api/sandbox/system-prompt", selectedBatchId],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", `/api/sandbox/system-prompt?batchId=${selectedBatchId || ''}`);
        return await res.json();
      } catch (error) {
        console.error("Failed to fetch system prompt:", error);
        toast({
          title: "Error",
          description: "Failed to load system prompt",
          variant: "destructive"
        });
        return { prompt: "" };
      }
    },
    enabled: !!selectedBatchId
  });
  
  // Query to get template variables
  const { data: templateVariables, isLoading: variablesLoading } = useQuery({
    queryKey: ["/api/sandbox/variables", selectedBatchId],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", `/api/sandbox/variables?batchId=${selectedBatchId || ''}`);
        const data = await res.json();
        return data.variables || [];
      } catch (error) {
        console.error("Failed to fetch template variables:", error);
        toast({
          title: "Error",
          description: "Failed to load template variables",
          variant: "destructive"
        });
        return [];
      }
    },
    enabled: !!selectedBatchId
  });
  
  // Update system prompt
  const updateSystemPromptMutation = useMutation({
    mutationFn: async (data: { prompt: string, batchId?: string }) => {
      const res = await apiRequest("POST", "/api/sandbox/system-prompt", data);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "System prompt updated successfully",
      });
      setIsEditingSystemPrompt(false);
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["/api/sandbox/system-prompt", selectedBatchId] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to update system prompt: ${error.message}`,
        variant: "destructive"
      });
    }
  });
  
  // Create template variable
  const createVariableMutation = useMutation({
    mutationFn: async (data: { 
      placeholder: string; 
      description: string; 
      example: string;
      batchId?: string;
    }) => {
      const res = await apiRequest("POST", "/api/sandbox/variables", data);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Template variable created successfully",
      });
      setNewVariable({ placeholder: "", description: "", example: "" });
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["/api/sandbox/variables", selectedBatchId] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to create template variable: ${error.message}`,
        variant: "destructive"
      });
    }
  });
  
  // Update template variable
  const updateVariableMutation = useMutation({
    mutationFn: async (data: { 
      id: number; 
      updates: {
        placeholder?: string; 
        description?: string; 
        example?: string;
      }
    }) => {
      const res = await apiRequest("PATCH", `/api/sandbox/variables/${data.id}`, data.updates);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Template variable updated successfully",
      });
      setEditingVariableId(null);
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["/api/sandbox/variables", selectedBatchId] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to update template variable: ${error.message}`,
        variant: "destructive"
      });
    }
  });
  
  // Delete template variable
  const deleteVariableMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/sandbox/variables/${id}`);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Template variable deleted successfully",
      });
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["/api/sandbox/variables", selectedBatchId] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to delete template variable: ${error.message}`,
        variant: "destructive"
      });
    }
  });
  
  // Enhanced prompt regeneration with system prompt and variables
  const regenerateWithSystemMutation = useMutation({
    mutationFn: async (data: { patientId: string, batchId?: string }) => {
      const res = await apiRequest("POST", "/api/regenerate-prompt-with-system-and-variables", data);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Patient prompt regenerated successfully with system prompt and variables",
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
  
  // Update system prompt state when data is loaded
  useEffect(() => {
    if (systemPromptData) {
      setSystemPrompt(systemPromptData.prompt || "");
    }
  }, [systemPromptData]);
  
  const handleSaveTemplate = () => {
    if (selectedPatientId && promptTemplate) {
      updateTemplateMutation.mutate({
        patientId: selectedPatientId,
        template: promptTemplate
      });
    }
  };
  
  const handleSaveSystemPrompt = () => {
    updateSystemPromptMutation.mutate({
      prompt: systemPrompt,
      batchId: selectedBatchId
    });
  };
  
  const handleAddVariable = () => {
    if (newVariable.placeholder && newVariable.description) {
      createVariableMutation.mutate({
        ...newVariable,
        batchId: selectedBatchId
      });
    } else {
      toast({
        title: "Error",
        description: "Placeholder and description are required",
        variant: "destructive"
      });
    }
  };
  
  const handleEditVariable = (id: number) => {
    const variable = templateVariables?.find((v: any) => v.id === id);
    if (variable) {
      setEditingVariableId(id);
      setEditingVariable({
        placeholder: variable.placeholder,
        description: variable.description,
        example: variable.example || ""
      });
    }
  };
  
  const handleSaveEditedVariable = (id: number) => {
    updateVariableMutation.mutate({
      id,
      updates: editingVariable
    });
  };
  
  const handleDeleteVariable = (id: number) => {
    deleteVariableMutation.mutate(id);
  };
  
  const handleRegeneratePrompt = () => {
    if (selectedPatientId) {
      regenerateWithSystemMutation.mutate({
        patientId: selectedPatientId,
        batchId: selectedBatchId
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
      
      {/* Top section - Patient Selection */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
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
                    <SelectItem key={batch.id} value={batch.batchId}>
                      {new Date(batch.createdAt).toLocaleDateString()} ({batch.batchId})
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
              <h3 className="font-medium text-sm text-gray-500 mb-2">Built-in Variables</h3>
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
        
        {/* Top right section - System Prompt */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Initial AI Instructions (System Prompt)</span>
              {!isEditingSystemPrompt ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsEditingSystemPrompt(true)}
                  disabled={!selectedBatchId || systemPromptLoading}
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              ) : (
                <div className="space-x-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setIsEditingSystemPrompt(false)}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleSaveSystemPrompt}
                    disabled={updateSystemPromptMutation.isPending}
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Save
                  </Button>
                </div>
              )}
            </CardTitle>
            <CardDescription>
              These instructions tell the AI how to behave when generating prompts for all patients
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isEditingSystemPrompt ? (
              <Textarea 
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="Enter system-level instructions for the AI..."
                className="min-h-[150px] font-mono text-sm"
              />
            ) : (
              <div className="bg-gray-50 p-4 rounded-md">
                <p className="whitespace-pre-wrap font-mono text-sm">
                  {systemPrompt || "No system prompt set. Click Edit to add one."}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Middle section - Template Variables Management */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Custom Template Variables</CardTitle>
          <CardDescription>
            Define custom variables that can be used in your prompt templates
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={currentTab} onValueChange={setCurrentTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="template">Manage Variables</TabsTrigger>
              <TabsTrigger value="add">Add New Variable</TabsTrigger>
            </TabsList>
            
            <TabsContent value="template">
              {templateVariables?.length === 0 ? (
                <Alert>
                  <AlertDescription>
                    No custom variables defined yet. Add a variable to use it in your templates.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Placeholder</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Example</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {templateVariables?.map((variable: any) => (
                        <TableRow key={variable.id}>
                          {editingVariableId === variable.id ? (
                            <>
                              <TableCell>
                                <Input 
                                  value={editingVariable.placeholder}
                                  onChange={(e) => setEditingVariable({...editingVariable, placeholder: e.target.value})}
                                  className="w-full"
                                />
                              </TableCell>
                              <TableCell>
                                <Input 
                                  value={editingVariable.description}
                                  onChange={(e) => setEditingVariable({...editingVariable, description: e.target.value})}
                                  className="w-full"
                                />
                              </TableCell>
                              <TableCell>
                                <Input 
                                  value={editingVariable.example}
                                  onChange={(e) => setEditingVariable({...editingVariable, example: e.target.value})}
                                  className="w-full"
                                />
                              </TableCell>
                              <TableCell>
                                <div className="flex space-x-2">
                                  <Button 
                                    size="sm" 
                                    variant="ghost" 
                                    onClick={() => handleSaveEditedVariable(variable.id)}
                                    disabled={updateVariableMutation.isPending}
                                  >
                                    <Check className="h-4 w-4" />
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    variant="ghost" 
                                    onClick={() => setEditingVariableId(null)}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </>
                          ) : (
                            <>
                              <TableCell className="font-mono">{"{" + variable.placeholder + "}"}</TableCell>
                              <TableCell>{variable.description}</TableCell>
                              <TableCell>{variable.example || "-"}</TableCell>
                              <TableCell>
                                <div className="flex space-x-2">
                                  <Button 
                                    size="sm" 
                                    variant="ghost" 
                                    onClick={() => handleEditVariable(variable.id)}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    variant="ghost" 
                                    onClick={() => handleDeleteVariable(variable.id)}
                                    disabled={deleteVariableMutation.isPending}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="add">
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="variable-placeholder">Placeholder Name</Label>
                    <Input
                      id="variable-placeholder"
                      value={newVariable.placeholder}
                      onChange={(e) => setNewVariable({...newVariable, placeholder: e.target.value})}
                      placeholder="e.g. medication"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Will be used like {"{medication}"}
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="variable-description">Description</Label>
                    <Input
                      id="variable-description"
                      value={newVariable.description}
                      onChange={(e) => setNewVariable({...newVariable, description: e.target.value})}
                      placeholder="e.g. Patient's medication name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="variable-example">Example (Optional)</Label>
                    <Input
                      id="variable-example"
                      value={newVariable.example}
                      onChange={(e) => setNewVariable({...newVariable, example: e.target.value})}
                      placeholder="e.g. Metformin 500mg"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button 
                    onClick={handleAddVariable}
                    disabled={!newVariable.placeholder || !newVariable.description || createVariableMutation.isPending}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Variable
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      
      {/* Bottom section - Patient Template & Result */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Patient-specific template */}
        <Card>
          <CardHeader>
            <CardTitle>Edit Patient Prompt Template</CardTitle>
            <CardDescription>
              Customize the template that will be used to generate this patient's prompt
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
                disabled={!selectedPatientId || regenerateWithSystemMutation.isPending}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${regenerateWithSystemMutation.isPending ? 'animate-spin' : ''}`} />
                Regenerate Prompt
              </Button>
            </div>
          </CardFooter>
        </Card>
        
        {/* Preview section for the currently generated prompt */}
        {selectedPatientId && patients?.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Generated Patient Prompt</CardTitle>
              <CardDescription>
                This is the current prompt generated for the selected patient
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-gray-50 p-4 rounded-md min-h-[300px]">
                <p className="whitespace-pre-wrap">
                  {patients.find((p: PatientPrompt) => p.patientId === selectedPatientId)?.prompt || 
                  "No prompt available for this patient."}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}