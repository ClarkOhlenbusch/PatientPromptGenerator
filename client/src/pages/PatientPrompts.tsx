import { useState, useEffect } from "react";
import ResultsSection from "@/components/ResultsSection";
import PromptModal from "@/components/PromptModal";
import { useParams, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { PatientPrompt } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function PatientPrompts() {
  const { id } = useParams();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentPatient, setCurrentPatient] = useState<PatientPrompt | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredPrompts, setFilteredPrompts] = useState<PatientPrompt[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Get patient prompts
  const { data: patientPrompts = [], isLoading } = useQuery<PatientPrompt[]>({
    queryKey: [`/api/patient-prompts/${id}`],
    enabled: !!id,
  });

  useEffect(() => {
    if (patientPrompts && patientPrompts.length > 0) {
      filterPrompts();
    }
  }, [patientPrompts, searchTerm]);

  const filterPrompts = () => {
    if (!searchTerm) {
      setFilteredPrompts(patientPrompts || []);
      return;
    }

    const filtered = (patientPrompts || []).filter((patient: PatientPrompt) => {
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

  const regenerateAllMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/patient-prompts/${id}/regenerate`, null);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/patient-prompts/${id}`] });
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

  const regenerateSingleMutation = useMutation({
    mutationFn: async (patientId: string) => {
      const response = await apiRequest('POST', `/api/patient-prompts/${id}/regenerate/${patientId}`, null);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/patient-prompts/${id}`] });
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

  const exportCSVMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('GET', `/api/patient-prompts/${id}/export`);
      return response.blob();
    },
    onSuccess: (blob) => {
      // Create a download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `patient-prompts-${id}.csv`;
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

  const handleViewPrompt = (patient: PatientPrompt) => {
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

  const paginatedPrompts = filteredPrompts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const totalPages = Math.ceil(filteredPrompts.length / itemsPerPage);

  return (
    <>
      <div className="mb-6">
        <Button 
          variant="outline" 
          onClick={() => setLocation('/')}
          className="flex items-center"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Upload Patient Data
        </Button>
      </div>

      <ResultsSection
        patientPrompts={paginatedPrompts}
        isLoading={isLoading}
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
