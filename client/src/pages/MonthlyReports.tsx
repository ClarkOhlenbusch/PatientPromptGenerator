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
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function MonthlyReports() {
  const [selectedPatientId, setSelectedPatientId] = useState<string>("all");
  const { toast } = useToast();
  
  // Mutation for generating a PDF report from the latest upload data
  const generateReportMutation = useMutation({
    mutationFn: async (patientId?: string) => {
      // If patientId is provided, generate report for just that patient
      const endpoint = patientId 
        ? `/api/monthly-report?patientId=${patientId}`
        : `/api/monthly-report`;
      
      const res = await apiRequest("GET", endpoint);
      return await res.json();
    },
    onSuccess: (data) => {
      if (data.success && data.url) {
        toast({
          title: "Success",
          description: "Monthly report generated successfully",
        });
        
        // Create link to download the PDF and click it
        const downloadLink = document.createElement('a');
        downloadLink.href = data.url;
        downloadLink.download = `monthly-health-report.pdf`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
      } else {
        toast({
          title: "Error",
          description: data.message || "Failed to generate report",
          variant: "destructive"
        });
      }
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
                  {/* To be replaced with actual patients from the latest batch */}
                  <SelectItem value="1001">Patient #1001</SelectItem>
                  <SelectItem value="1002">Patient #1002</SelectItem>
                  <SelectItem value="1003">Patient #1003</SelectItem>
                  <SelectItem value="Joe">Joe Butera</SelectItem>
                  <SelectItem value="Diane">Diane Affre</SelectItem>
                  <SelectItem value="Fabien">Fabien Deniau</SelectItem>
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