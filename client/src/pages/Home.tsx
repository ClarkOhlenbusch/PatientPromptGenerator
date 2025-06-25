import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { FileUploadResponse } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileUp, Loader2, CheckCircle2, Heart, Phone, MessageSquare, BarChart3 } from "lucide-react";
import caliCatImage from "@/assets/cali-cat.png";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await apiRequest('POST', '/api/upload', null, { formData });
      return await response.json() as FileUploadResponse;
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: `File processed successfully! Redirecting to triage...`,
      });
      // Redirect to triage page after successful upload
      setTimeout(() => {
        setLocation("/triage");
      }, 1500);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `File upload failed: ${error.message}`,
        variant: "destructive",
      });
    }
  });

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  // Handle file upload
  const handleUpload = async () => {
    if (!file) {
      toast({
        title: "Error",
        description: "Please select a file first",
        variant: "destructive"
      });
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    uploadMutation.mutate(formData);
  };

  return (
    <div className="container mx-auto py-8">
      {/* Header with Cat Image */}
      <div className="text-center mb-8">
        <img 
          src={caliCatImage} 
          alt="Cali - Your AI Health Assistant" 
          className="w-20 h-20 mx-auto mb-4 rounded-full shadow-lg"
        />
        <h1 className="text-3xl font-bold mb-2">Ask Cali</h1>
        <p className="text-gray-600">
          Automated Patient Care Management System
        </p>
      </div>

      {/* Quick Actions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8 justify-items-center">
        <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setLocation("/triage")}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart3 className="w-5 h-5 text-green-600" />
              AI Triage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              AI-powered patient triage and priority assessment
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setLocation("/companion-calls")}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Heart className="w-5 h-5 text-red-500" />
              AI Companion Calls
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              Initiate caring, personalized conversations with patients
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setLocation("/trend-reports")}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart3 className="w-5 h-5 text-purple-600" />
              Trend Reports
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              Generate comprehensive patient trend reports
            </p>
          </CardContent>
        </Card>
      </div>

      <h2 className="text-2xl font-bold mb-4">Upload Patient Data</h2>
      <p className="text-gray-600 mb-6">
        Upload an Excel file containing patient vitals and measurements to get started.
      </p>

      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Upload Excel File</CardTitle>
          <CardDescription>
            Select a .xlsx file containing patient data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-center w-full">
              <label
                htmlFor="file-upload"
                className="flex flex-col items-center justify-center w-full h-64 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100"
              >
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <FileUp className="w-12 h-12 mb-3 text-gray-400" />
                  <p className="mb-2 text-sm text-gray-500">
                    <span className="font-semibold">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-xs text-gray-500">Excel (.xlsx) only</p>
                </div>
                <input
                  id="file-upload"
                  type="file"
                  className="hidden"
                  accept=".xlsx"
                  onChange={handleFileChange}
                />
              </label>
            </div>

            {file && (
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center">
                  <FileUp className="w-5 h-5 mr-2 text-gray-500" />
                  <span className="text-sm font-medium">{file.name}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFile(null)}
                >
                  Remove
                </Button>
              </div>
            )}

            <div className="flex justify-end">
              <Button
                onClick={handleUpload}
                disabled={uploadMutation.isPending}
              >
                {uploadMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <FileUp className="mr-2 h-4 w-4" />
                    Upload File
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {uploadMutation.isSuccess && (
        <Card className="max-w-2xl mx-auto mt-6 border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex flex-col space-y-4">
              <div className="flex items-center">
                <CheckCircle2 className="w-8 h-8 text-green-600 mr-3 flex-shrink-0" />
                <div>
                  <h3 className="text-lg font-semibold text-green-800">Upload Successful!</h3>
                  <p className="text-sm text-green-700">
                    File processed successfully. Redirecting to triage...
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
