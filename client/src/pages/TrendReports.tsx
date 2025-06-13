import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { 
  BarChart3, 
  Loader2, 
  Activity,
  Sparkles
} from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
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

export default function TrendReports() {
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [generatedReport, setGeneratedReport] = useState<string>("");
  const { toast } = useToast();
  
  // Query to get the latest batch
  const { data: latestBatch } = useQuery({
    queryKey: ["/api/latest-batch"],
    queryFn: async () => {
      try {
        // Fetch all batches and sort by most recent to determine the latest
        const res = await apiRequest("GET", "/api/batches");
        const responseData = await res.json();

        const batches =
          responseData.success && responseData.data ? responseData.data : [];

        if (batches && batches.length > 0) {
          const sortedBatches = [...batches].sort(
            (a, b) =>
              new Date(b.createdAt).getTime() -
              new Date(a.createdAt).getTime()
          );
          return sortedBatches[0];
        }
        return null;
      } catch (error) {
        console.error("Failed to fetch latest batch:", error);
        return null;
      }
    },
  });

  // Query to get all batches to find one with prompts
  const { data: allBatches } = useQuery({
    queryKey: ["/api/batches"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/batches");
      const data = await res.json();
      return data.success ? data.data : [];
    },
  });

  // Find the most recent batch that has prompts
  const [batchWithPrompts, setBatchWithPrompts] = useState<string | null>(null);

  useEffect(() => {
    async function findBatchWithPrompts() {
      if (allBatches && allBatches.length > 0 && !batchWithPrompts) {
        for (const batch of allBatches) {
          try {
            const response = await fetch(`/api/patient-prompts/${batch.batchId}`, {
              method: "GET",
              credentials: "include",
              headers: {
                "Content-Type": "application/json",
              },
            });

            if (response.ok) {
              const responseData = await response.json();
              const prompts =
                responseData.success && responseData.data
                  ? responseData.data
                  : [];
              if (prompts && prompts.length > 0) {
                console.log(`Found prompts in batch: ${batch.batchId}`);
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

    findBatchWithPrompts();
  }, [allBatches, batchWithPrompts]);

  // Use either the batch with prompts or the latest batch
  const effectiveBatchId = batchWithPrompts || latestBatch?.batchId;
  
  // Query to get patients from the effective batch
  const { data: patients, isLoading: isPatientsLoading } = useQuery({
    queryKey: ["/api/patient-prompts", effectiveBatchId],
    queryFn: async () => {
      if (!effectiveBatchId) return [];
      
      try {
        const res = await apiRequest("GET", `/api/patient-prompts/${effectiveBatchId}`);
        const responseData = await res.json();
        const allPatients = responseData.success && responseData.data ? responseData.data : [];
        
        console.log("Loaded patients for trend reports:", allPatients);
        console.log("Effective batch ID:", effectiveBatchId);
        console.log("Patient data structure:", allPatients[0]);
        return allPatients;
      } catch (error) {
        console.error("Error fetching patients:", error);
        return [];
      }
    },
    enabled: !!effectiveBatchId,
  });

  // Mutation to generate AI-powered trend report
  const generateTrendReportMutation = useMutation({
    mutationFn: async (patientId: string) => {
      const res = await apiRequest("POST", "/api/generate-trend-report", { patientId });
      return await res.json();
    },
    onSuccess: (data: any) => {
      if (data.success) {
        setGeneratedReport(data.report);
        toast({
          title: "Success",
          description: "AI trend report generated successfully!",
        });
      } else {
        toast({
          title: "Error",
          description: data.message || "Failed to generate trend report",
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to generate trend report: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const handleGenerateReport = () => {
    if (!selectedPatientId) {
      toast({
        title: "Error",
        description: "Please select a patient to generate a trend report.",
        variant: "destructive",
      });
      return;
    }
    
    generateTrendReportMutation.mutate(selectedPatientId);
  };

  const handleClearReport = () => {
    setGeneratedReport("");
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <BarChart3 className="h-8 w-8 text-blue-600" />
        <div>
          <h1 className="text-3xl font-bold">AI Trend Reports</h1>
          <p className="text-gray-600">Generate personalized health trend reports using AI analysis</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Patient Selection Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Select Patient
            </CardTitle>
            <CardDescription>
              Choose a patient to generate an AI-powered trend report
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Patient</label>
              <Select value={selectedPatientId} onValueChange={setSelectedPatientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a patient..." />
                </SelectTrigger>
                <SelectContent>
                  {isPatientsLoading ? (
                    <SelectItem value="loading" disabled>
                      Loading patients...
                    </SelectItem>
                  ) : patients && patients.length > 0 ? (
                    patients.map((patient: Patient) => (
                      <SelectItem key={patient.patientId} value={patient.patientId}>
                        {patient.name} ({patient.patientId})
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="no-patients" disabled>
                      No patients available
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <Button 
                onClick={handleGenerateReport}
                disabled={!selectedPatientId || generateTrendReportMutation.isPending}
                className="flex-1"
              >
                {generateTrendReportMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate AI Report
                  </>
                )}
              </Button>
              
              {generatedReport && (
                <Button 
                  onClick={handleClearReport}
                  variant="outline"
                >
                  Clear
                </Button>
              )}
            </div>

            {!effectiveBatchId && (
              <div className="text-sm text-amber-600 bg-amber-50 p-3 rounded-md">
                No patient data available. Please upload patient data first.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Generated Report Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Generated Report
            </CardTitle>
            <CardDescription>
              AI-generated health trend analysis
            </CardDescription>
          </CardHeader>
          <CardContent>
            {generatedReport ? (
              <div className="space-y-4">
                <Textarea
                  value={generatedReport}
                  readOnly
                  className="min-h-[400px] font-mono text-sm"
                  placeholder="Generated report will appear here..."
                />
                <div className="text-xs text-gray-500">
                  Report generated using AI analysis of patient health data and trends
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Select a patient and click "Generate AI Report" to see the trend analysis</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Information Card */}
      <Card>
        <CardHeader>
          <CardTitle>About AI Trend Reports</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4 text-sm">
            <div>
              <h4 className="font-semibold mb-2">Summary Analysis</h4>
              <p className="text-gray-600">
                Comprehensive overview of health trends and patterns with care team recommendations
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Compliance Tracking</h4>
              <p className="text-gray-600">
                Analysis of patient data submission consistency and engagement levels
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Health Insights</h4>
              <p className="text-gray-600">
                Key insights and observations based on patient condition and data patterns
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}