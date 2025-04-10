import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { CheckCircle2 } from "lucide-react";

interface ProcessingStep {
  status: 'completed' | 'processing' | 'pending';
  label: string;
}

interface ProcessingSectionProps {
  steps: ProcessingStep[];
}

export default function ProcessingSection({ steps }: ProcessingSectionProps) {
  return (
    <div className="mb-8">
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-800">Processing Patient Data</h3>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              Processing
            </span>
          </div>
          
          <div className="flex justify-center py-6">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
          </div>
          
          <div className="text-center text-gray-600">
            <p>Extracting patient data and generating prompts...</p>
            <p className="text-sm mt-2">This may take a few moments depending on the file size.</p>
          </div>
          
          {/* Processing steps */}
          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center" aria-hidden="true">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center">
                <span className="px-2 bg-white text-sm text-gray-500">Processing Steps</span>
              </div>
            </div>
            
            <ul className="mt-4 space-y-3">
              {steps.map((step, index) => (
                <li key={index} className="flex items-center text-sm">
                  <span className={`flex-shrink-0 h-5 w-5 flex items-center justify-center rounded-full 
                    ${step.status === 'completed' ? 'bg-green-100 text-green-600' : 
                      step.status === 'processing' ? 'bg-blue-100 text-blue-600' : 
                      'bg-gray-100 text-gray-400'}`}>
                    {step.status === 'completed' ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : step.status === 'processing' ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <div className="h-3 w-3" />
                    )}
                  </span>
                  <span className={`ml-2 ${
                    step.status === 'completed' ? 'text-gray-700' : 
                    step.status === 'processing' ? 'text-gray-700' : 
                    'text-gray-500'
                  }`}>{step.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
