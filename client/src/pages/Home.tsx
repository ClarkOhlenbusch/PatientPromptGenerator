import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import FileUpload from "@/components/FileUpload";
import ProcessingSection from "@/components/ProcessingSection";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { FileUploadResponse } from "@shared/schema";

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
      // Update processing steps
      setProcessingSteps((prev) => {
        const newSteps = [...prev];
        newSteps[0].status = 'completed';
        newSteps[1].status = 'processing';
        return newSteps;
      });

      // Simulate processing time for extracting data
      setTimeout(() => {
        setProcessingSteps((prev) => {
          const newSteps = [...prev];
          newSteps[1].status = 'completed';
          newSteps[2].status = 'processing';
          return newSteps;
        });

        // Simulate processing time for generating prompts
        setTimeout(() => {
          setProcessingSteps((prev) => {
            const newSteps = [...prev];
            newSteps[2].status = 'completed';
            newSteps[3].status = 'processing';
            return newSteps;
          });

          // Simulate preparing results
          setTimeout(() => {
            setProcessingSteps((prev) => {
              const newSteps = [...prev];
              newSteps[3].status = 'completed';
              return newSteps;
            });

            // Redirect to results page
            setIsProcessing(false);
            setLocation(`/patient-prompts/${data.batchId}`);
            toast({
              title: "Success",
              description: "Patient prompts generated successfully!",
            });
          }, 1000);
        }, 1500);
      }, 1000);
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
    const formData = new FormData();
    formData.append('file', file);
    uploadMutation.mutate(formData);
  };

  return (
    <>
      <div className="mb-8 text-center">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Generate AI Prompts for Patient Data</h2>
        <p className="text-gray-600 max-w-3xl mx-auto">
          Upload your Excel file containing patient data. Our system will process the information and generate personalized AI prompts for each patient using OpenAI's API.
        </p>
      </div>

      {!isProcessing ? (
        <FileUpload onFileUpload={handleFileUpload} />
      ) : (
        <ProcessingSection steps={processingSteps} />
      )}
    </>
  );
}
