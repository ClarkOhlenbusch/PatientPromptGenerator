import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import FileUpload from "@/components/FileUpload";
import ProcessingSection from "@/components/ProcessingSection";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { FileUploadResponse } from "@shared/schema";
import ResultsSection from "@/components/ResultsSection";
import PromptModal from "@/components/PromptModal";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export default function Home() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingSteps, setProcessingSteps] = useState<Array<{
    status: 'completed' | 'processing' | 'pending';
    label: string;
  }>>([
    { status: 'pending', label: 'Uploading file' },
    { status: 'pending', label: 'Extracting patient data' },
    { status: 'pending', label: 'Generating AI prompts' },
    { status: 'pending', label: 'Preparing results' },
  ]);
  const [_, setLocation] = useLocation();
  const { toast } = useToast();
  const [showResults, setShowResults] = useState(false);
  const [latestBatchId, setLatestBatchId] = useState<string | null>(null);
  
  // State for patient prompts display
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredPrompts, setFilteredPrompts] = useState<any[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentPatient, setCurrentPatient] = useState<any | null>(null);
  const itemsPerPage = 10;

  // Get all batches to find the latest one
  const { data: batches = [] } = useQuery({
    queryKey: ["/api/batches"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/batches");
      return await res.json();
    },
  });
  
  // Set the latest batch ID when batches are loaded
  useEffect(() => {
    if (batches.length > 0) {
      // Find the most recent batch by date
      const sortedBatches = [...batches].sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      
      if (sortedBatches[0]) {
        setLatestBatchId(sortedBatches[0].batchId);
      }
    }
  }, [batches]);
  
  // Get patient prompts for the latest batch
  const { data: patientPrompts = [], isLoading: promptsLoading } = useQuery({
    queryKey: [`/api/patient-prompts/${latestBatchId}`],
    queryFn: async () => {
      if (!latestBatchId) return [];
      const res = await apiRequest("GET", `/api/patient-prompts/${latestBatchId}`);
      return await res.json();
    },
    enabled: !!latestBatchId,
  });
  
  // Filter patient prompts when data changes or search term changes
  useEffect(() => {
    if (patientPrompts.length > 0) {
      filterPrompts();
      setShowResults(true);
    }
  }, [patientPrompts, searchTerm]);
  
  const filterPrompts = () => {
    if (!searchTerm) {
      setFilteredPrompts(patientPrompts);
      return;
    }

    const filtered = patientPrompts.filter((patient: any) => {
      const searchTermLower = searchTerm.toLowerCase();
      return (
        patient.patientId.toLowerCase().includes(searchTermLower) ||
        patient.name.toLowerCase().includes(searchTermLower) ||
        patient.condition.toLowerCase().includes(searchTermLower) ||
        patient.prompt.toLowerCase().includes(searchTermLower)
      );
    });

    setFilteredPrompts(filtered);
    setCurrentPage(1); // Reset to first page when filtering
  };

  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      // Log the form data for debugging
      console.log("Uploading form data", { 
        hasFile: formData.has('file'),
        fileName: formData.get('file') instanceof File ? (formData.get('file') as File).name : 'No file'
      });
      
      const response = await apiRequest('POST', '/api/upload', null, { formData });
      return await response.json() as FileUploadResponse;
    },
    onSuccess: (data) => {
      // Set the latest batch ID to the one we just uploaded
      setLatestBatchId(data.batchId);
      
      // Complete all steps at once when we receive a response - the API is actually doing all steps
      setProcessingSteps((prev) => {
        return prev.map(step => ({ ...step, status: 'completed' }));
      });

      // Invalidate batches query to get the latest batch
      queryClient.invalidateQueries({ queryKey: ["/api/batches"] });
      
      // Add short delay before showing results
      setTimeout(() => {
        setIsProcessing(false);
        
        // Instead of redirecting, show the results in this page
        setShowResults(true);
        
        toast({
          title: "Success",
          description: `Processed ${data.message} - View your patient prompts below!`,
        });
      }, 500);
    },
    onError: (error) => {
      setIsProcessing(false);
      toast({
        title: "Error",
        description: `File upload failed: ${error.message}`,
        variant: "destructive",
      });
    }
  });

  const handleFileUpload = async (file: File) => {
    setIsProcessing(true);
    setShowResults(false);
    const formData = new FormData();
    formData.append('file', file);
    uploadMutation.mutate(formData);
  };
  
  // Regenerate all prompts
  const regenerateAllMutation = useMutation({
    mutationFn: async () => {
      if (!latestBatchId) throw new Error("No batch selected");
      const response = await apiRequest('POST', `/api/patient-prompts/${latestBatchId}/regenerate`, null);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/patient-prompts/${latestBatchId}`] });
      toast({
        title: "Success",
        description: "All prompts regenerated successfully!",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to regenerate prompts: ${error.message}`,
        variant: "destructive",
      });
    }
  });

  // Regenerate single prompt
  const regenerateSingleMutation = useMutation({
    mutationFn: async (patientId: string) => {
      if (!latestBatchId) throw new Error("No batch selected");
      const response = await apiRequest('POST', `/api/patient-prompts/${latestBatchId}/regenerate/${patientId}`, null);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/patient-prompts/${latestBatchId}`] });
      toast({
        title: "Success",
        description: "Prompt regenerated successfully!",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to regenerate prompt: ${error.message}`,
        variant: "destructive",
      });
    }
  });

  // Export prompts to CSV
  const exportCSVMutation = useMutation({
    mutationFn: async () => {
      if (!latestBatchId) throw new Error("No batch selected");
      const response = await apiRequest('GET', `/api/patient-prompts/${latestBatchId}/export`);
      return response.blob();
    },
    onSuccess: (blob) => {
      // Create a download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `patient-prompts-${latestBatchId}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Success",
        description: "Prompts exported to CSV successfully!",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to export prompts: ${error.message}`,
        variant: "destructive",
      });
    }
  });
  
  // Event handlers for prompt actions
  const handleViewPrompt = (patient: any) => {
    setCurrentPatient(patient);
    setIsModalOpen(true);
  };

  const handleRegeneratePrompt = (patientId: string) => {
    regenerateSingleMutation.mutate(patientId);
  };

  const handleRegenerateAll = () => {
    regenerateAllMutation.mutate();
  };

  const handleExportCSV = () => {
    exportCSVMutation.mutate();
  };

  const handleCopyPrompt = (prompt: string) => {
    navigator.clipboard.writeText(prompt);
    toast({
      title: "Success",
      description: "Prompt copied to clipboard!",
    });
  };
  
  const handleGoToDetailedView = () => {
    if (latestBatchId) {
      setLocation(`/patient-prompts/${latestBatchId}`);
    }
  };
  
  // Paginate prompts
  const paginatedPrompts = filteredPrompts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  
  const totalPages = Math.ceil(filteredPrompts.length / itemsPerPage);

  return (
    <>
      <div className="mb-8 text-center">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Generate AI Prompts for Patient Data</h2>
        <p className="text-gray-600 max-w-3xl mx-auto">
          Upload your Excel file containing patient data. Our system will process the information and generate personalized AI prompts for each patient using OpenAI's API.
        </p>
      </div>

      {!isProcessing ? (
        <>
          <FileUpload onFileUpload={handleFileUpload} />
          
          {/* Display results from latest batch if available */}
          {showResults && patientPrompts.length > 0 && (
            <div className="mt-12">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-gray-800">Latest Generated Prompts</h3>
                <Button onClick={handleGoToDetailedView}>
                  Detailed View <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
              
              <ResultsSection
                patientPrompts={paginatedPrompts}
                isLoading={promptsLoading}
                totalPrompts={filteredPrompts.length}
                currentPage={currentPage}
                totalPages={totalPages}
                setCurrentPage={setCurrentPage}
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                onViewPrompt={handleViewPrompt}
                onRegeneratePrompt={handleRegeneratePrompt}
                onRegenerateAll={handleRegenerateAll}
                onExportCSV={handleExportCSV}
                onCopyPrompt={handleCopyPrompt}
                isPending={regenerateAllMutation.isPending || regenerateSingleMutation.isPending || exportCSVMutation.isPending}
              />
            </div>
          )}
        </>
      ) : (
        <ProcessingSection steps={processingSteps} />
      )}
      
      {/* Prompt modal */}
      {isModalOpen && currentPatient && (
        <PromptModal
          patient={currentPatient}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onRegeneratePrompt={handleRegeneratePrompt}
          onCopyPrompt={handleCopyPrompt}
          isPending={regenerateSingleMutation.isPending}
        />
      )}
    </>
  );
}
