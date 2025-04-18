import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { 
  Calendar, 
  Download, 
  FileText, 
  FileUp, 
  Loader2, 
  RefreshCw,
  User
} from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface MonthlyReport {
  id: string;
  month: string;
  year: number;
  generatedAt: string;
  downloadUrl: string;
  patientCount: number;
  status: "pending" | "complete" | "failed";
  fileSize?: string;
}

export default function MonthlyReports() {
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const { toast } = useToast();
  
  // Get current month/year for default selection
  const currentDate = new Date();
  const currentMonth = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
  
  // Query to get all monthly reports
  const { data: reports, isLoading } = useQuery({
    queryKey: ["/api/monthly-reports"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/monthly-reports");
        return await res.json();
      } catch (error) {
        console.error("Failed to fetch reports:", error);
        toast({
          title: "Error",
          description: "Failed to load monthly reports",
          variant: "destructive"
        });
        return [];
      }
    }
  });
  
  // Mutation to generate a new report
  const generateReportMutation = useMutation({
    mutationFn: async (monthYear: string) => {
      const res = await apiRequest("POST", "/api/generate-monthly-report", { monthYear });
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Monthly report generation initiated",
      });
      // Invalidate reports query to refresh the list
      queryClient.invalidateQueries({ queryKey: ["/api/monthly-reports"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to generate report: ${error.message}`,
        variant: "destructive"
      });
    }
  });
  
  // Format month-year string for display
  const formatMonthYear = (monthYearStr: string) => {
    const [year, month] = monthYearStr.split('-');
    return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString(undefined, { 
      month: 'long', 
      year: 'numeric' 
    });
  };
  
  // Handle generate report
  const handleGenerateReport = () => {
    if (!selectedMonth) {
      setSelectedMonth(currentMonth);
      generateReportMutation.mutate(currentMonth);
    } else {
      generateReportMutation.mutate(selectedMonth);
    }
  };
  
  return (
    <div className="container mx-auto">
      <h1 className="text-3xl font-bold mb-6">AI-Powered Monthly Reports</h1>
      <p className="text-gray-600 mb-8">
        Generate and download comprehensive monthly reports with patient trends and insights.
      </p>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Generate New Report</CardTitle>
            <CardDescription>Create a monthly report for a specific period</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="month-select" className="text-sm font-medium">
                  Select Month and Year
                </label>
                <div className="flex items-center">
                  <input
                    id="month-select"
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="border rounded-md p-2 w-full"
                    placeholder="YYYY-MM"
                  />
                </div>
                <p className="text-xs text-gray-500">
                  Select a month to generate a report for that period
                </p>
              </div>
              
              <Button 
                className="w-full" 
                onClick={handleGenerateReport}
                disabled={generateReportMutation.isPending}
              >
                {generateReportMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <FileUp className="mr-2 h-4 w-4" />
                    Generate Report
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
        
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Report Summary</CardTitle>
            <CardDescription>
              Overview of generated monthly reports
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex flex-col items-center justify-center">
                <Calendar className="h-8 w-8 text-blue-600 mb-2" />
                <span className="text-2xl font-bold text-blue-600">
                  {isLoading ? (
                    <RefreshCw className="h-6 w-6 animate-spin" />
                  ) : (
                    reports?.length || 0
                  )}
                </span>
                <span className="text-sm text-blue-800">Total Reports</span>
              </div>
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 flex flex-col items-center justify-center">
                <FileText className="h-8 w-8 text-indigo-600 mb-2" />
                <span className="text-2xl font-bold text-indigo-600">
                  {isLoading ? (
                    <RefreshCw className="h-6 w-6 animate-spin" />
                  ) : (
                    reports?.filter((r: MonthlyReport) => r.status === "complete").length || 0
                  )}
                </span>
                <span className="text-sm text-indigo-800">Completed</span>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex flex-col items-center justify-center">
                <User className="h-8 w-8 text-green-600 mb-2" />
                <span className="text-2xl font-bold text-green-600">
                  {isLoading ? (
                    <RefreshCw className="h-6 w-6 animate-spin" />
                  ) : (
                    // Sum of all patient counts from complete reports
                    reports?.filter((r: MonthlyReport) => r.status === "complete")
                      .reduce((sum: number, r: MonthlyReport) => sum + r.patientCount, 0) || 0
                  )}
                </span>
                <span className="text-sm text-green-800">Patients Analyzed</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Reports table */}
      <Card>
        <CardHeader>
          <CardTitle>Available Reports</CardTitle>
          <CardDescription>
            Download generated monthly reports for patients
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : reports?.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p>No reports have been generated yet.</p>
              <p className="text-sm">Generate your first monthly report above.</p>
            </div>
          ) : (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead className="hidden md:table-cell">Generated</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Patients</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reports.map((report: MonthlyReport) => (
                    <TableRow key={report.id}>
                      <TableCell className="font-medium">
                        {formatMonthYear(`${report.year}-${report.month}`)}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {new Date(report.generatedAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {report.status === "pending" && (
                          <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">
                            Generating...
                          </Badge>
                        )}
                        {report.status === "complete" && (
                          <Badge variant="outline" className="bg-green-50 text-green-800 border-green-200">
                            Complete
                          </Badge>
                        )}
                        {report.status === "failed" && (
                          <Badge variant="outline" className="bg-red-50 text-red-800 border-red-200">
                            Failed
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {report.patientCount}
                      </TableCell>
                      <TableCell className="text-right">
                        {report.status === "complete" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(report.downloadUrl, '_blank')}
                            className="flex items-center"
                          >
                            <Download className="h-4 w-4 mr-1" />
                            Download
                            {report.fileSize && <span className="ml-1 text-xs">({report.fileSize})</span>}
                          </Button>
                        ) : report.status === "pending" ? (
                          <span className="text-amber-600 flex items-center justify-end">
                            <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                            Processing
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleGenerateReport()}
                            className="flex items-center"
                          >
                            <RefreshCw className="h-4 w-4 mr-1" />
                            Retry
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}