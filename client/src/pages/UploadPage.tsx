import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileUp, Loader2, CheckCircle2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  
  // Mutation for file upload
  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await apiRequest("POST", "/api/upload", formData);
      return await res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: `File processed successfully (${data.patientCount} patients)`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to upload file: ${error.message}`,
        variant: "destructive"
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
    formData.append("file", file);
    uploadMutation.mutate(formData);
  };
  
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Upload Patient Data</h1>
      <p className="text-gray-600 mb-8">
        Upload an Excel file containing patient vitals and measurements.
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
                disabled={!file || uploadMutation.isPending}
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
                    Processed {uploadMutation.data.patientCount} patients from {file?.name}
                  </p>
                </div>
              </div>
              
              <div className="bg-white rounded-lg p-4 border border-green-100">
                <h4 className="text-sm font-medium text-green-800 mb-2">What's Next?</h4>
                <ul className="text-sm text-green-700 space-y-1">
                  <li>• Patient data has been securely stored</li>
                  <li>• AI prompts will be generated for each patient</li>
                  <li>• Review and send notifications in the Triage section</li>
                </ul>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={() => setLocation("/triage")}
                  className="bg-green-600 hover:bg-green-700 text-white px-6"
                >
                  Go to Triage →
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
} 