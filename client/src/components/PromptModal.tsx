import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RefreshCw, Copy, Info } from "lucide-react";
import { PatientPrompt } from "@shared/schema";

interface PromptModalProps {
  patient: PatientPrompt;
  isOpen: boolean;
  onClose: () => void;
  onRegeneratePrompt: (patientId: string) => void;
  onCopyPrompt: (prompt: string) => void;
  isPending: boolean;
}

export default function PromptModal({ 
  patient, 
  isOpen, 
  onClose, 
  onRegeneratePrompt, 
  onCopyPrompt,
  isPending
}: PromptModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <div className="sm:flex sm:items-start">
            <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-indigo-100 sm:mx-0 sm:h-10 sm:w-10">
              <Info className="h-6 w-6 text-primary" />
            </div>
            <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
              <DialogTitle>Patient Prompt Details</DialogTitle>
            </div>
          </div>
        </DialogHeader>
        
        <div className="mt-4 border-t border-b border-gray-200 py-4">
          <dl className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
            <div className="sm:col-span-1">
              <dt className="text-sm font-medium text-gray-500">Patient ID</dt>
              <dd className="mt-1 text-sm text-gray-900">{patient.patientId}</dd>
            </div>
            <div className="sm:col-span-1">
              <dt className="text-sm font-medium text-gray-500">Name</dt>
              <dd className="mt-1 text-sm text-gray-900">{patient.name}</dd>
            </div>
            <div className="sm:col-span-1">
              <dt className="text-sm font-medium text-gray-500">Age</dt>
              <dd className="mt-1 text-sm text-gray-900">{patient.age}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-sm font-medium text-gray-500">Conditions</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {patient.condition.split(', ').map((condition, index) => (
                  <span key={index} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 mr-2 mb-1">
                    {condition}
                  </span>
                ))}
              </dd>
            </div>
          </dl>
        </div>
        
        <div className="mt-4">
          <label htmlFor="prompt-text" className="block text-sm font-medium text-gray-700">Generated Prompt</label>
          <div className="mt-2">
            <Textarea
              id="prompt-text"
              rows={8}
              value={patient.prompt}
              readOnly
              className="shadow-sm focus:ring-primary focus:border-primary block w-full sm:text-sm border-gray-300 rounded-md"
            />
          </div>
        </div>
        
        <div className="mt-4 flex justify-between">
          <Button
            variant="outline"
            onClick={() => onCopyPrompt(patient.prompt)}
            className="inline-flex items-center"
          >
            <Copy className="h-5 w-5 mr-1.5 text-gray-500" />
            Copy to Clipboard
          </Button>
          
          <Button
            onClick={() => onRegeneratePrompt(patient.patientId)}
            disabled={isPending}
            className="inline-flex items-center"
          >
            <RefreshCw className={`h-5 w-5 mr-1.5 ${isPending ? 'animate-spin' : ''}`} />
            Regenerate Prompt
          </Button>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
