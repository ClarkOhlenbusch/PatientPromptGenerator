import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, MessageSquare, Heart, Clock, Users, Settings } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Patient {
  id: string;
  name: string;
  age: number;
  condition: string;
  phoneNumber?: string;
  personalInfo?: string;
}

interface CompanionCallConfig {
  maxDuration: number;
  conversationStyle: string;
  topics: string[];
  personalizedPrompt: string;
}

export default function AICompanionCalls() {
  const { toast } = useToast();
  const [selectedPatient, setSelectedPatient] = useState<string>("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [personalInfo, setPersonalInfo] = useState("");
  const [callConfig, setCallConfig] = useState<CompanionCallConfig>({
    maxDuration: 15,
    conversationStyle: "friendly",
    topics: ["health", "daily-life", "family"],
    personalizedPrompt: ""
  });
  const [isInitiatingCall, setIsInitiatingCall] = useState(false);

  // Query to fetch patients
  const { data: patientsData, isLoading: patientsLoading } = useQuery({
    queryKey: ["/api/patients"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/patients");
      if (!response.ok) throw new Error("Failed to fetch patients");
      return response.json();
    }
  });

  // Query to fetch recent companion calls
  const { data: recentCallsData } = useQuery({
    queryKey: ["/api/call-history", "companion"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/call-history?type=companion");
      if (!response.ok) throw new Error("Failed to fetch call history");
      return response.json();
    }
  });

  const patients: Patient[] = patientsData?.patients || [];
  const recentCalls = recentCallsData?.callHistory || [];

  // Initiate companion call mutation
  const initiateCallMutation = useMutation({
    mutationFn: async (callData: any) => {
      const response = await apiRequest("POST", "/api/vapi/companion-call", callData);
      if (!response.ok) throw new Error("Failed to initiate call");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Companion Call Initiated",
        description: "The AI companion call has been started successfully.",
      });
      // Reset form
      setSelectedPatient("");
      setPhoneNumber("");
      setPersonalInfo("");
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
      setPersonalInfo(patient.personalInfo || "");
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

    // Basic phone number validation (same as triage section)
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    if (cleanPhone.length < 10 || cleanPhone.length > 15) {
      toast({
        title: "Invalid Phone Number",
        description: "Please enter a valid phone number (10-15 digits)",
        variant: "destructive"
      });
      return;
    }

    // Format phone number to E.164 format (same as triage section)
    const formattedPhone = cleanPhone.startsWith('1') ? `+${cleanPhone}` : `+1${cleanPhone}`;

    const patient = patients.find(p => p.id === selectedPatient);
    if (!patient) return;

    setIsInitiatingCall(true);
    try {
      await initiateCallMutation.mutateAsync({
        patientId: patient.id,
        patientName: patient.name,
        phoneNumber: formattedPhone, // ✅ Now properly formatted
        personalInfo,
        callConfig,
        callType: "companion"
      });
    } finally {
      setIsInitiatingCall(false);
    }
  };

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Heart className="w-8 h-8 text-red-500" />
            AI Companion Calls
          </h1>
          <p className="text-gray-600 mt-2">
            Initiate caring, personalized conversations with patients
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Call Configuration */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="w-5 h-5" />
              Initiate Companion Call
            </CardTitle>
            <CardDescription>
              Uses your Voice Agent configuration from Prompt Editing. Personalize with patient-specific information below.
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

            {/* Personal Information */}
            <div>
              <Label htmlFor="personal-info">Personal Information</Label>
              <Textarea
                id="personal-info"
                value={personalInfo}
                onChange={(e) => setPersonalInfo(e.target.value)}
                placeholder="e.g., John loves to talk about travelling, his wife Betty who passed away recently, his children Clark and Tomas..."
                rows={3}
              />
            </div>

            {/* Call Duration */}
            <div>
              <Label htmlFor="duration">Max Call Duration (minutes)</Label>
              <Select
                value={callConfig.maxDuration.toString()}
                onValueChange={(value) => setCallConfig({...callConfig, maxDuration: parseInt(value)})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 minutes</SelectItem>
                  <SelectItem value="10">10 minutes</SelectItem>
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="20">20 minutes</SelectItem>
                  <SelectItem value="30">30 minutes</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Conversation Style */}
            <div>
              <Label htmlFor="style">Conversation Style</Label>
              <Select
                value={callConfig.conversationStyle}
                onValueChange={(value) => setCallConfig({...callConfig, conversationStyle: value})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="friendly">Friendly & Casual</SelectItem>
                  <SelectItem value="professional">Professional & Caring</SelectItem>
                  <SelectItem value="warm">Warm & Empathetic</SelectItem>
                  <SelectItem value="cheerful">Cheerful & Upbeat</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleInitiateCall}
              disabled={isInitiatingCall || !selectedPatient || !phoneNumber}
              className="w-full"
            >
              {isInitiatingCall ? (
                <>
                  <Phone className="w-4 h-4 mr-2 animate-pulse" />
                  Initiating Call...
                </>
              ) : (
                <>
                  <Phone className="w-4 h-4 mr-2" />
                  Start Companion Call
                </>
              )}
            </Button>
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
                Companion calls use your configured Voice Agent settings from the Prompt Editing section.
              </p>
              <div className="bg-gray-50 p-3 rounded-lg space-y-1">
                <p><strong>Voice:</strong> Uses your saved voice configuration</p>
                <p><strong>Model:</strong> Uses your saved AI model</p>
                <p><strong>Prompt:</strong> Uses your saved system prompt</p>
              </div>
              <p className="text-xs text-gray-500">
                To modify voice settings, go to Prompt Editing → Voice Agent tab.
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

      {/* Recent Companion Calls */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Recent Companion Calls
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentCalls.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No companion calls yet. Start your first call above!</p>
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
                  </div>
                  <div className="text-right">
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      call.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {call.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
