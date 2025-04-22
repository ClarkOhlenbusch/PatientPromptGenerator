import React, { useState, useEffect } from 'react';
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Loader2, CheckCircle, AlertCircle, Send } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";

const SettingsPage: React.FC = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [location, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<"idle" | "error" | "success" | "loading">("idle");
  const [twilioStatus, setTwilioStatus] = useState<{
    isConfigured: boolean;
    phoneConfigured: boolean;
    twilioPhone: string | null;
  } | null>(null);

  // Fetch alert phone from the server
  const {
    data: phoneData,
    isLoading: isPhoneLoading,
    error: phoneError
  } = useQuery<{ success: boolean; phone: string }>({
    queryKey: ["/api/settings/alertPhone"],
    queryFn: getSettingsFn,
  });

  // Fetch Twilio status from the server
  const {
    data: twilioStatusData,
    isLoading: isTwilioStatusLoading,
    error: twilioStatusError
  } = useQuery<{ 
    success: boolean; 
    isConfigured: boolean;
    phoneConfigured: boolean;
    twilioPhone: string | null;
  }>({
    queryKey: ["/api/settings/twilio-status"],
    queryFn: getTwilioStatusFn,
  });

  // Set phone from fetched data
  useEffect(() => {
    if (phoneData?.phone) {
      setPhone(phoneData.phone);
    }
  }, [phoneData]);

  // Set Twilio status from fetched data
  useEffect(() => {
    if (twilioStatusData) {
      setTwilioStatus({
        isConfigured: twilioStatusData.isConfigured,
        phoneConfigured: twilioStatusData.phoneConfigured,
        twilioPhone: twilioStatusData.twilioPhone
      });
    }
  }, [twilioStatusData]);

  // Update alert phone mutation
  const updatePhoneMutation = useMutation({
    mutationFn: async (phone: string) => {
      const res = await apiRequest("POST", "/api/settings/alertPhone", { phone });
      return await res.json();
    },
    onSuccess: () => {
      setStatus("success");
      toast({
        title: "Phone number updated",
        description: "The alert phone number has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/alertPhone"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/twilio-status"] });
    },
    onError: (error: Error) => {
      setStatus("error");
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Send test SMS mutation
  const sendTestSMSMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/settings/send-test-sms", {});
      return await res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Test SMS sent",
        description: data.message || "A test SMS has been sent to your phone.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to send test SMS",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Validate phone number format (E.164)
  const validatePhone = (phoneNumber: string) => {
    return /^\+[1-9]\d{1,14}$/.test(phoneNumber);
  };

  // Handle phone update
  const handleUpdatePhone = async () => {
    if (!validatePhone(phone)) {
      toast({
        title: "Invalid phone number",
        description: "Please enter a valid phone number in E.164 format (e.g., +12345678901).",
        variant: "destructive",
      });
      return;
    }
    
    setStatus("loading");
    updatePhoneMutation.mutate(phone);
  };

  // Handle test SMS
  const handleSendTestSMS = async () => {
    sendTestSMSMutation.mutate();
  };

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(e.target.value);
    setStatus("idle");
  };

  // Helper for API request
  async function getSettingsFn() {
    const res = await apiRequest("GET", "/api/settings/alertPhone");
    return await res.json();
  }

  // Helper for Twilio status API request
  async function getTwilioStatusFn() {
    const res = await apiRequest("GET", "/api/settings/twilio-status");
    return await res.json();
  }

  // If not authenticated, the ProtectedRoute component will handle redirection
  if (!user) {
    return null;
  }

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-3xl font-bold mb-6">System Settings</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>SMS Alert Configuration</CardTitle>
            <CardDescription>
              Configure the phone number to receive patient alerts via SMS
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            {isPhoneLoading ? (
              <div className="flex items-center justify-center p-6">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : phoneError ? (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>
                  Failed to load phone settings. Please try again.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Alert Phone Number (E.164 format)</Label>
                    <div className="flex space-x-2">
                      <Input
                        id="phone"
                        placeholder="+12345678901"
                        value={phone}
                        onChange={handleInputChange}
                        className="flex-1"
                      />
                      <Button 
                        onClick={handleUpdatePhone}
                        disabled={status === "loading" || updatePhoneMutation.isPending}
                      >
                        {(status === "loading" || updatePhoneMutation.isPending) ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : "Update"}
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Enter the phone number that will receive patient alerts in E.164 format (+12345678901)
                    </p>
                  </div>

                  {status === "success" && (
                    <Alert variant="default" className="bg-green-50 border-green-200">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <AlertTitle className="text-green-700">Success</AlertTitle>
                      <AlertDescription className="text-green-600">
                        Phone number updated successfully.
                      </AlertDescription>
                    </Alert>
                  )}

                  {status === "error" && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Error</AlertTitle>
                      <AlertDescription>
                        Failed to update phone number. Please try again.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
                
                <Separator className="my-6" />
                
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Test SMS Alert</h3>
                  
                  {isTwilioStatusLoading ? (
                    <div className="flex items-center justify-center p-2">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    </div>
                  ) : twilioStatusError ? (
                    <Alert variant="destructive" className="mb-4">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Error</AlertTitle>
                      <AlertDescription>
                        Failed to check Twilio configuration.
                      </AlertDescription>
                    </Alert>
                  ) : twilioStatus ? (
                    <>
                      {!twilioStatus.isConfigured ? (
                        <Alert variant="destructive" className="mb-4">
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>Twilio Not Configured</AlertTitle>
                          <AlertDescription>
                            The Twilio API credentials (Account SID, Auth Token, Phone Number) 
                            are not configured. Please add them to your environment variables.
                          </AlertDescription>
                        </Alert>
                      ) : !twilioStatus.phoneConfigured ? (
                        <Alert className="mb-4 bg-amber-50 border-amber-200">
                          <AlertCircle className="h-4 w-4 text-amber-500" />
                          <AlertTitle className="text-amber-700">Alert Phone Not Set</AlertTitle>
                          <AlertDescription className="text-amber-600">
                            Please configure an alert phone number above before testing SMS alerts.
                          </AlertDescription>
                        </Alert>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-sm text-muted-foreground mb-3">
                            Send a test SMS to verify your alert configuration is working correctly.
                          </p>
                          
                          <Button 
                            onClick={handleSendTestSMS}
                            disabled={
                              sendTestSMSMutation.isPending || 
                              !twilioStatus.isConfigured || 
                              !twilioStatus.phoneConfigured
                            }
                            className="w-full"
                          >
                            {sendTestSMSMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                              <Send className="h-4 w-4 mr-2" />
                            )}
                            Send Test SMS
                          </Button>
                          
                          {twilioStatus.twilioPhone && (
                            <p className="text-xs text-muted-foreground mt-2">
                              SMS will be sent from: {twilioStatus.twilioPhone}
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  ) : null}
                </div>
              </>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>API Configuration</CardTitle>
            <CardDescription>
              Manage API credentials and integration settings
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              The following API integrations are currently configured:
            </p>
            
            <div className="space-y-4">
              <div className="flex items-center p-3 border rounded-md">
                <div className="flex-1">
                  <h4 className="font-medium">OpenAI API</h4>
                  <p className="text-sm text-muted-foreground">
                    Used for generating patient prompts with AI
                  </p>
                </div>
                <CheckCircle className="h-5 w-5 text-green-500" />
              </div>
              
              <div className="flex items-center p-3 border rounded-md">
                <div className="flex-1">
                  <h4 className="font-medium">Twilio API</h4>
                  <p className="text-sm text-muted-foreground">
                    Used for sending SMS alerts to patients
                  </p>
                </div>
                {twilioStatus?.isConfigured ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-amber-500" />
                )}
              </div>
            </div>
            
            <div className="mt-6">
              <p className="text-sm text-muted-foreground mb-2">
                Note: API credentials are managed via environment variables and cannot be modified through the UI for security reasons.
              </p>
              <p className="text-sm font-medium">
                Required Twilio environment variables:
              </p>
              <ul className="text-xs text-muted-foreground list-disc pl-5 mt-1">
                <li>TWILIO_ACCOUNT_SID</li>
                <li>TWILIO_AUTH_TOKEN</li>
                <li>TWILIO_PHONE_NUMBER</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SettingsPage;