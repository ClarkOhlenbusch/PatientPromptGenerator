import { apiRequest } from "@/lib/queryClient";
import { FileUploadResponse, PatientPrompt } from "@shared/schema";

export const uploadExcelFile = async (file: File): Promise<FileUploadResponse> => {
  const formData = new FormData();
  formData.append("file", file);
  
  const response = await apiRequest("POST", "/api/upload", null, { formData });
  return await response.json() as FileUploadResponse;
};

export const getPatientPrompts = async (batchId: string): Promise<PatientPrompt[]> => {
  const response = await apiRequest("GET", `/api/patient-prompts/${batchId}`);
  return await response.json() as PatientPrompt[];
};

export const regenerateAllPrompts = async (batchId: string): Promise<void> => {
  await apiRequest("POST", `/api/patient-prompts/${batchId}/regenerate`);
};

export const regeneratePrompt = async (batchId: string, patientId: string): Promise<void> => {
  await apiRequest("POST", `/api/patient-prompts/${batchId}/regenerate/${patientId}`);
};

export const exportToCSV = async (batchId: string): Promise<Blob> => {
  const response = await apiRequest("GET", `/api/patient-prompts/${batchId}/export`);
  return await response.blob();
};
