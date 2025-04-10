import { useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, CloudUpload, File } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface FileUploadProps {
  onFileUpload: (file: File) => void;
}

export default function FileUpload({ onFileUpload }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    
    const droppedFile = e.dataTransfer.files[0];
    handleFile(droppedFile);
  };

  const handleFileSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (selectedFile: File) => {
    if (!selectedFile) return;
    
    // Check if file is Excel
    if (!selectedFile.name.endsWith('.xlsx')) {
      setFileError('Please upload a valid Excel (.xlsx) file.');
      return;
    }
    
    // Clear previous error if any
    setFileError(null);
    setFile(selectedFile);
    
    // Simulate initial progress
    setUploadProgress(0);
    
    // Start the upload process
    const simulateProgress = () => {
      setUploadProgress(prev => {
        const newProgress = prev + 5;
        if (newProgress >= 100) {
          // Complete upload - pass file to parent component
          setTimeout(() => onFileUpload(selectedFile), 500);
          return 100;
        }
        
        // Continue simulation
        setTimeout(simulateProgress, 100);
        return newProgress;
      });
    };
    
    setTimeout(simulateProgress, 100);
  };

  const openFileDialog = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div className="mb-8">
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-medium text-gray-800 mb-4">Upload Patient Data</h3>
          
          <div 
            className={`rounded-lg p-8 text-center cursor-pointer border-2 border-dashed transition-all ${
              isDragging ? 'border-primary bg-primary/5' : 'border-gray-200'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={openFileDialog}
          >
            <div className="flex flex-col items-center justify-center">
              <CloudUpload className="h-12 w-12 text-gray-400 mb-3" />
              <h4 className="text-base font-medium text-gray-700 mb-1">Drag & Drop Excel File Here</h4>
              <p className="text-sm text-gray-500 mb-3">or click to browse files</p>
              <p className="text-xs text-gray-400">Supported format: .xlsx</p>
              
              <input 
                type="file" 
                ref={fileInputRef}
                className="hidden" 
                accept=".xlsx" 
                onChange={handleFileSelection}
              />
              
              <Button className="mt-4" onClick={(e) => { e.stopPropagation(); openFileDialog(); }}>
                Browse Files
              </Button>
            </div>
          </div>
          
          {file && (
            <div className="mt-4">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center">
                  <File className="h-5 w-5 text-primary mr-2" />
                  <span className="text-sm font-medium text-gray-700">{file.name}</span>
                </div>
                <span className="text-sm text-gray-500">{uploadProgress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-primary rounded-full h-2 transition-all" 
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
            </div>
          )}
          
          {fileError && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{fileError}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
