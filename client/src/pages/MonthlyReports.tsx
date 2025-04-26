import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  FileUp, 
  Loader2, 
  Activity,
  PlusCircle
} from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PatientData } from '@shared/types';

// Define types for patients
interface Patient extends PatientData {
  id: number;
  batchId: string;
  name: string;
  patientId: string;
  createdAt: string;
}

export default function MonthlyReports() {
  const [selectedPatientId, setSelectedPatientId] = useState<string>("all");
  const { toast } = useToast();
  
  // Query to get the latest batch
  const { data: latestBatch } = useQuery({
    queryKey: ["/api/latest-batch"],
    queryFn: async () => {
      try {
        // Get all batches and sort by most recent
        const res = await apiRequest("GET", "/api/batches");
        const batches = await res.json();
        
        if (batches && batches.length > 0) {
          // Sort batches by createdAt, descending
          const sortedBatches = [...batches].sort((a, b) => 
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          return sortedBatches[0]; // Return the most recent batch
        }
        return null;
      } catch (error) {
        console.error("Failed to fetch latest batch:", error);
        return null;
      }
    }
  });
  
  // Query to get patients from the latest batch
  const { data: patients, isLoading: isPatientsLoading } = useQuery({
    queryKey: ["/api/patients", latestBatch?.batchId],
    queryFn: async () => {
      if (!latestBatch?.batchId) return [];
      
      try {
        const res = await apiRequest("GET", `/api/patient-prompts/${latestBatch.batchId}`);
        const allPatients = await res.json();
        
        // Create a map to store the latest entry for each patient name
        const latestPatientMap = new Map();
        
        allPatients.forEach((patient: Patient) => {
          const existingPatient = latestPatientMap.get(patient.name);
          if (!existingPatient || new Date(patient.createdAt) > new Date(existingPatient.createdAt)) {
            latestPatientMap.set(patient.name, patient);
          }
        });
        
        // Convert map back to array and sort by name
        return Array.from(latestPatientMap.values()).sort((a, b) => 
          a.name.localeCompare(b.name)
        );
      } catch (error) {
        console.error("Failed to fetch patients:", error);
        return [];
      }
    },
    enabled: !!latestBatch?.batchId // Only run if we have a batch ID
  });
  
  // Mutation for generating a PDF report from the latest upload data
  const generateReportMutation = useMutation({
    mutationFn: async (patientId?: string) => {
      // If patientId is provided, generate report for just that patient
      const endpoint = patientId 
        ? `/api/monthly-report?patientId=${patientId}`
        : `/api/monthly-report`;
      
      // For direct PDF response, we need to open in a new tab/window
      window.open(endpoint, '_blank');
      
      // Return success since we're handling the download through window.open
      return { success: true };
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Monthly report generated successfully. If your PDF doesn't open automatically, please check your popup blocker settings.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to generate report: ${error.message}`,
        variant: "destructive"
      });
    }
  });
  
  // Generate report for all patients or a specific patient
  const handleGenerateReport = () => {
    if (selectedPatientId && selectedPatientId !== "all") {
      generateReportMutation.mutate(selectedPatientId);
    } else {
      // Pass undefined explicitly to use the default value
      generateReportMutation.mutate(undefined);
    }
  };
  
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col items-center mb-8 text-center">
        <Activity className="h-12 w-12 text-primary mb-4" />
        <h1 className="text-3xl font-bold mb-3">Monthly Health Reports</h1>
        <p className="text-muted-foreground max-w-2xl">
          Generate comprehensive monthly health reports based on your most recently uploaded patient data. 
          Reports include trend visualizations, health marker progression, and personalized insights.
        </p>
      </div>
      
      <Card className="max-w-2xl mx-auto shadow-lg border-2">
        <CardHeader className="bg-muted/30">
          <CardTitle className="flex items-center">
            <PlusCircle className="h-5 w-5 mr-2 text-primary" />
            Generate New Monthly Report
          </CardTitle>
          <CardDescription>
            Create a health report using your most recently uploaded data
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Select Patient (Optional)
              </label>
              <Select
                value={selectedPatientId}
                onValueChange={setSelectedPatientId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Patients" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Patients</SelectItem>
                  {/* Use real patient data if available */}
                  {isPatientsLoading ? (
                    <SelectItem value="loading" disabled>Loading patients...</SelectItem>
                  ) : (patients && patients.length > 0) ? (
                    patients.map((patient: Patient) => (
                      <SelectItem key={patient.patientId} value={patient.patientId}>
                        {patient.name.replace(/\s*\([^)]*\)\s*/g, '')}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="nodata" disabled>No patient data available</SelectItem>
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Leave empty to generate a report for all patients from the latest upload
              </p>
            </div>
            
            <div className="space-y-4">
              <p className="text-sm">
                <strong>Report Contents:</strong> Health marker trending, condition-specific visualizations, 
                progression graphs, and personalized recommendations.
              </p>
              
              <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                <div className="flex items-center">
                  <div className="w-3 h-3 rounded-full bg-green-500 mr-2"></div>
                  <span>Green: Healthy Markers</span>
                </div>
                <div className="flex items-center">
                  <div className="w-3 h-3 rounded-full bg-yellow-500 mr-2"></div>
                  <span>Yellow: Needs Attention</span>
                </div>
                <div className="flex items-center">
                  <div className="w-3 h-3 rounded-full bg-red-500 mr-2"></div>
                  <span>Red: Critical Markers</span>
                </div>
                <div className="flex items-center">
                  <div className="w-3 h-3 rounded-full bg-blue-500 mr-2"></div>
                  <span>Blue: Trending Items</span>
                </div>
              </div>
            </div>
            
            <Button 
              className="w-full" 
              size="lg"
              onClick={handleGenerateReport}
              disabled={generateReportMutation.isPending}
            >
              {generateReportMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Generating Report...
                </>
              ) : (
                <>
                  <FileUp className="mr-2 h-5 w-5" />
                  Generate Report
                </>
              )}
            </Button>
            
            <p className="text-xs text-center text-muted-foreground">
              Reports use only your most recently uploaded data.
              Please upload new patient data if you need updated reports.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}