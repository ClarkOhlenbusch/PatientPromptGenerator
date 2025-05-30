import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, MessageSquare, Heart, Clock, Users, Settings, Eye } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Patient {
  id: string;
  name: string;
  age: number;
  condition: string;
  phoneNumber?: string;
  personalInfo?: string;
}

export default function AICompanionCalls() {
  const { toast } = useToast();
  const [selectedPatient, setSelectedPatient] = useState<string>("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [batchId, setBatchId] = useState("");
  const [isInitiatingCall, setIsInitiatingCall] = useState(false);
  const [contextPreviewOpen, setContextPreviewOpen] = useState(false);
  const [contextPreviewData, setContextPreviewData] = useState<any>(null);

  // Query to fetch patients
  const { data: patientsData, isLoading: patientsLoading } = useQuery({
    queryKey: ["/api/patients"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/patients");
      if (!response.ok) throw new Error("Failed to fetch patients");
      return response.json();
    }
  });

  // Query to fetch recent calls (all context-aware calls now)
  const { data: recentCallsData } = useQuery({
    queryKey: ["/api/call-history"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/call-history");
      if (!response.ok) throw new Error("Failed to fetch call history");
      return response.json();
    }
  });

  const patients: Patient[] = patientsData?.patients || [];
  const recentCalls = recentCallsData?.data || [];

  // Unified call mutation - uses the new /api/vapi/call endpoint
  const initiateCallMutation = useMutation({
    mutationFn: async (callData: any) => {
      const response = await apiRequest("POST", "/api/vapi/call", callData);
      if (!response.ok) throw new Error("Failed to initiate call");
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Call Initiated Successfully",
        description: `AI voice call started for ${data.patientName} with full patient context.`,
      });
      // Reset form
      setSelectedPatient("");
      setPhoneNumber("");
      setBatchId("");
      queryClient.invalidateQueries({ queryKey: ["/api/call-history"] });
    },
    onError: (error) => {
      // Handle specific VAPI daily limit error
      if (error.message.includes("Daily Outbound Call Limit")) {
        toast({
          title: "Daily Call Limit Reached",
          description: "You've reached the daily limit for free VAPI numbers. Import your own Twilio number to make unlimited calls.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Call Failed",
          description: error.message,
          variant: "destructive",
        });
      }
    }
  });

  const handlePatientSelect = (patientId: string) => {
    setSelectedPatient(patientId);
    const patient = patients.find(p => p.id === patientId);
    if (patient) {
      setPhoneNumber(patient.phoneNumber || "");
    }
  };

  const handleInitiateCall = async () => {
    if (!selectedPatient || !phoneNumber) {
      toast({
        title: "Missing Information",
        description: "Please select a patient and enter a phone number.",
        variant: "destructive",
      });
      return;
    }

    // Basic phone number validation
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    if (cleanPhone.length < 10 || cleanPhone.length > 15) {
      toast({
        title: "Invalid Phone Number",
        description: "Please enter a valid phone number (10-15 digits)",
        variant: "destructive"
      });
      return;
    }

    // Format phone number to E.164 format
    const formattedPhone = cleanPhone.startsWith('1') ? `+${cleanPhone}` : `+1${cleanPhone}`;

    const patient = patients.find(p => p.id === selectedPatient);
    if (!patient) return;

    setIsInitiatingCall(true);
    try {
      await initiateCallMutation.mutateAsync({
        patientId: patient.id,
        phoneNumber: formattedPhone,
        batchId: batchId || undefined,
        callType: "voice-agent" // This identifies it as a voice agent call (vs triage)
      });
    } finally {
      setIsInitiatingCall(false);
    }
  };

  const previewPatientContext = async () => {
    if (!selectedPatient) {
      toast({
        title: "Missing Information",
        description: "Please select a patient.",
        variant: "destructive",
      });
      return;
    }

    const patient = patients.find(p => p.id === selectedPatient);
    if (!patient) return;

    try {
      const response = await apiRequest("GET", `/api/vapi/triage-context?patientId=${patient.id}${batchId ? `&batchId=${batchId}` : ''}`);
      if (!response.ok) throw new Error("Failed to fetch patient context");
      
      const result = await response.json();
      setContextPreviewData(result.data);
      setContextPreviewOpen(true);
      
    } catch (error) {
      toast({
        title: "Context Preview Failed",
        description: error instanceof Error ? error.message : "Failed to fetch patient context",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Heart className="w-8 h-8 text-red-500" />
            AI Voice Calls
          </h1>
          <p className="text-gray-600 mt-2">
            Initiate intelligent, context-aware voice conversations with patients using their complete triage assessment data
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Call Configuration */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="w-5 h-5" />
              Initiate AI Voice Call
            </CardTitle>
            <CardDescription>
              All calls now include full patient context from triage data. Uses your Voice Agent configuration from Prompt Editing with dynamic patient data injection.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Patient Selection */}
            <div>
              <Label htmlFor="patient-select">Select Patient</Label>
              <Select value={selectedPatient} onValueChange={handlePatientSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a patient..." />
                </SelectTrigger>
                <SelectContent>
                  {patients.map((patient) => (
                    <SelectItem key={patient.id} value={patient.id}>
                      {patient.name} ({patient.age}y, {patient.condition})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Phone Number */}
            <div>
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+1234567890"
              />
            </div>

            {/* Batch ID for specific triage data */}
            <div>
              <Label htmlFor="batch-id">Batch ID (Optional)</Label>
              <Input
                id="batch-id"
                placeholder="Leave empty for latest patient data"
                value={batchId}
                onChange={(e) => setBatchId(e.target.value)}
              />
              <p className="text-sm text-gray-500 mt-1">
                Specify a batch ID to use specific triage data, or leave empty to use the most recent data for this patient.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                onClick={handleInitiateCall}
                disabled={isInitiatingCall || !selectedPatient || !phoneNumber}
                className="flex-1"
              >
                {isInitiatingCall ? (
                  <>
                    <Phone className="w-4 h-4 mr-2 animate-pulse" />
                    Initiating Call...
                  </>
                ) : (
                  <>
                    <Phone className="w-4 h-4 mr-2" />
                    Start AI Voice Call
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={previewPatientContext}
                disabled={!selectedPatient}
                className="flex-shrink-0"
              >
                <Eye className="w-4 h-4 mr-2" />
                Preview Context
              </Button>
            </div>

            {selectedPatient && (
              <div className="bg-blue-50 p-4 rounded-lg">
                <h4 className="font-medium text-blue-900 mb-2">Selected Patient Info:</h4>
                {(() => {
                  const patient = patients.find(p => p.id === selectedPatient);
                  return patient ? (
                    <div className="text-sm text-blue-800 space-y-1">
                      <p><span className="font-medium">Name:</span> {patient.name}</p>
                      <p><span className="font-medium">Age:</span> {patient.age}</p>
                      <p><span className="font-medium">Condition:</span> {patient.condition}</p>
                      <p><span className="font-medium">Context:</span> Full patient triage assessment will be included in the call. Click "Preview Context" to see details.</p>
                    </div>
                  ) : null;
                })()}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Voice Agent Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              Voice Agent Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm space-y-2">
              <p className="text-gray-600">
                All calls use your configured Voice Agent settings from the Prompt Editing section with dynamic patient context injection.
              </p>
              <div className="bg-gray-50 p-3 rounded-lg space-y-1">
                <p><strong>Voice:</strong> Uses your saved voice configuration</p>
                <p><strong>Model:</strong> Uses your saved AI model</p>
                <p><strong>Prompt:</strong> Uses your saved system prompt + patient data</p>
                <p><strong>Context:</strong> Full patient triage assessment included</p>
              </div>
              <p className="text-xs text-gray-500">
                To modify voice settings or prompts, go to Prompt Editing → Voice Agent tab.
              </p>
            </div>

            <Button
              onClick={() => window.location.href = '/prompt-editing'}
              variant="outline"
              className="w-full"
            >
              <Settings className="w-4 h-4 mr-2" />
              Configure Voice Agent
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Recent AI Voice Calls */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Recent AI Voice Calls
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentCalls.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No voice calls yet. Start your first call above!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentCalls.slice(0, 5).map((call: any) => (
                <div key={call.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium">{call.patientName}</p>
                    <p className="text-sm text-gray-600">
                      {new Date(call.callDate).toLocaleDateString()} • {Math.floor(call.duration / 60)}m {call.duration % 60}s
                    </p>
                    {call.summary && (
                      <p className="text-sm text-gray-500 mt-1 line-clamp-2">{call.summary}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      call.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {call.status}
                    </span>
                    {call.hasContext && (
                      <p className="text-xs text-blue-600 mt-1">With Context</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Patient Context Preview Dialog */}
      <Dialog open={contextPreviewOpen} onOpenChange={setContextPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Patient Context Preview</DialogTitle>
            <DialogDescription>
              This is the context that will be injected into the Vapi call
            </DialogDescription>
          </DialogHeader>
          {contextPreviewData && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Patient Information</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-2">
                    <p><span className="font-medium">Name:</span> {contextPreviewData.name}</p>
                    <p><span className="font-medium">Age:</span> {contextPreviewData.age}</p>
                    <p><span className="font-medium">Condition:</span> {contextPreviewData.condition}</p>
                    <p><span className="font-medium">Batch ID:</span> {contextPreviewData.batchId}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Context Stats</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-2">
                    <p><span className="font-medium">Triage Prompt Length:</span> {contextPreviewData.triagePromptLength} chars</p>
                    <p><span className="font-medium">Has Recent Call:</span> {contextPreviewData.hasRecentCall ? "Yes" : "No"}</p>
                    <p><span className="font-medium">Data Source:</span> Database</p>
                    <p><span className="font-medium">Context Type:</span> Full Assessment</p>
                  </CardContent>
                </Card>
              </div>
              
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Triage Assessment Content</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-gray-50 p-4 rounded-lg max-h-60 overflow-y-auto">
                    <pre className="text-sm whitespace-pre-wrap text-gray-700 font-mono">
                      {contextPreviewData.triagePrompt || "No triage prompt available"}
                    </pre>
                  </div>
                </CardContent>
              </Card>

              {contextPreviewData.enhancedSystemPrompt && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Enhanced System Prompt Preview</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-green-50 p-4 rounded-lg max-h-60 overflow-y-auto">
                      <pre className="text-sm whitespace-pre-wrap text-gray-700 font-mono">
                        {contextPreviewData.enhancedSystemPrompt.substring(0, 1000)}...
                      </pre>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Call History Section */}
    </div>
  );
}
