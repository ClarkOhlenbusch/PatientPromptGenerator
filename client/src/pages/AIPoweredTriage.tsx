import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, MessageSquare, RefreshCw, Loader2, Send, Shield } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

type AlertStatus = "pending" | "sent" | "failed";

interface PatientAlert {
  id: string;
  patientId: string;
  patientName: string;
  age: number;
  condition: string;
  alertValue: string;
  timestamp: string;
  status: AlertStatus;
  message: string;
  sentAt?: string;
  alertCount?: number;
  createdAt: string;
  variables?: { name: string; value: string; timestamp?: string }[];
  reasoning?: string;
  severity?: 'red' | 'yellow' | 'green';
  alertReasons?: string[];
  isAlert?: boolean;
}

export default function AIPoweredTriage() {
  const [selectedBatchId, setSelectedBatchId] = useState<string>("");
  const { toast } = useToast();
  
  // Query to get all patient batches
  const { data: patientBatches, isLoading: batchesLoading } = useQuery({
    queryKey: ["/api/batches"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/batches");
        const batches = await res.json();
        
        // If batches available, auto-select the most recent one
        if (batches && batches.length > 0 && !selectedBatchId) {
          setSelectedBatchId(batches[0].batchId);
        }
        
        return batches;
      } catch (error) {
        console.error("Failed to fetch batches:", error);
        toast({
          title: "Error",
          description: "Failed to load patient batches",
          variant: "destructive"
        });
        return [];
      }
    }
  });
  
  // Query to get alerts for selected batch
  const { data: alerts, isLoading } = useQuery({
    queryKey: ["/api/triage/alerts", selectedBatchId],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", `/api/triage/alerts${selectedBatchId ? `?batchId=${selectedBatchId}` : ''}`);
        const data = await res.json();
        console.log("Fetched patient alerts:", data);
        return data;
      } catch (error) {
        console.error("Failed to fetch alerts:", error);
        toast({
          title: "Error",
          description: "Failed to load patient alerts",
          variant: "destructive"
        });
        return [];
      }
    },
    enabled: !!selectedBatchId
  });
  
  // Mutation to send SMS alerts
  const sendAlertsMutation = useMutation({
    mutationFn: async (alertIds: string[]) => {
      const res = await apiRequest("POST", "/api/triage/send-alerts", { alertIds });
      return await res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: `Sent ${data.sent} SMS alerts successfully`,
      });
      // Invalidate alerts query to refresh the list
      queryClient.invalidateQueries({ queryKey: ["/api/triage/alerts", selectedDate] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to send alerts: ${error.message}`,
        variant: "destructive"
      });
    }
  });
  
  // Mutation to send a single SMS alert
  const sendSingleAlertMutation = useMutation({
    mutationFn: async (alertId: string) => {
      const res = await apiRequest("POST", "/api/triage/send-alert", { alertId });
      return await res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: `SMS alert sent successfully to ${data.patientName}`,
      });
      // Invalidate alerts query to refresh the list
      queryClient.invalidateQueries({ queryKey: ["/api/triage/alerts", selectedDate] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to send alert: ${error.message}`,
        variant: "destructive"
      });
    }
  });
  
  // Handle sending all pending alerts
  const handleSendAllAlerts = () => {
    const pendingAlertIds = alerts
      .filter((alert: PatientAlert) => alert.status === "pending")
      .map((alert: PatientAlert) => alert.id);
    
    if (pendingAlertIds.length === 0) {
      toast({
        title: "Info",
        description: "No pending alerts to send",
      });
      return;
    }
    
    sendAlertsMutation.mutate(pendingAlertIds);
  };
  
  // Handle sending a single alert
  const handleSendSingleAlert = (alertId: string) => {
    sendSingleAlertMutation.mutate(alertId);
  };
  
  // Handle date change
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedDate(e.target.value);
  };
  
  return (
    <div className="container mx-auto">
      <h1 className="text-3xl font-bold mb-6">AI-Powered Triage</h1>
      <p className="text-gray-600 mb-8">
        Monitor patient alerts and send SMS notifications to caregivers for immediate action.
      </p>
      
      <div className="flex flex-col md:flex-row gap-6 mb-8">
        <Card className="flex-1">
          <CardHeader>
            <CardTitle>Alert Summary</CardTitle>
            <CardDescription>Overview of patient alerts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Red alerts */}
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-red-600">
                  {isLoading ? (
                    <RefreshCw className="h-6 w-6 animate-spin" />
                  ) : (
                    alerts?.filter((a: PatientAlert) => a.severity === "red").length || 0
                  )}
                </span>
                <span className="text-sm text-red-800">URGENT</span>
              </div>
              
              {/* Yellow alerts */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-yellow-600">
                  {isLoading ? (
                    <RefreshCw className="h-6 w-6 animate-spin" />
                  ) : (
                    alerts?.filter((a: PatientAlert) => a.severity === "yellow").length || 0
                  )}
                </span>
                <span className="text-sm text-yellow-800">ATTENTION</span>
              </div>

              {/* Green (healthy) status */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-green-600">
                  {isLoading ? (
                    <RefreshCw className="h-6 w-6 animate-spin" />
                  ) : (
                    alerts?.filter((a: PatientAlert) => a.severity === "green").length || 0
                  )}
                </span>
                <span className="text-sm text-green-800">HEALTHY</span>
              </div>
              
              {/* Date picker */}
              <div className="border border-gray-200 rounded-lg p-4 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-gray-700">
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={handleDateChange}
                    className="border rounded p-1 text-sm"
                  />
                </span>
                <span className="text-sm text-gray-600 mt-1">Selected Date</span>
              </div>
            </div>
            
            {/* Status of message sending */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex justify-between items-center">
                <div>
                  <span className="text-amber-800 font-medium">Pending SMS</span>
                  <span className="ml-2 text-xl font-bold text-amber-600">
                    {isLoading ? (
                      <RefreshCw className="inline h-5 w-5 animate-spin" />
                    ) : (
                      alerts?.filter((a: PatientAlert) => a.status === "pending" && a.isAlert).length || 0
                    )}
                  </span>
                </div>
                <Button 
                  size="sm" 
                  className="bg-amber-600 hover:bg-amber-700"
                  onClick={handleSendAllAlerts}
                  disabled={sendAlertsMutation.isPending || !alerts?.some((a: PatientAlert) => a.status === "pending" && a.isAlert)}
                >
                  {sendAlertsMutation.isPending ? (
                    <>
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="mr-1 h-3 w-3" />
                      Send All
                    </>
                  )}
                </Button>
              </div>
              
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex justify-between items-center">
                <div>
                  <span className="text-green-800 font-medium">Sent SMS</span>
                  <span className="ml-2 text-xl font-bold text-green-600">
                    {isLoading ? (
                      <RefreshCw className="inline h-5 w-5 animate-spin" />
                    ) : (
                      alerts?.filter((a: PatientAlert) => a.status === "sent").length || 0
                    )}
                  </span>
                </div>
              </div>
            </div>
            

          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Patient Alerts</CardTitle>
          <CardDescription>
            Patients with critical alerts that need attention
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : alerts?.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Shield className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p>No alerts for the selected date.</p>
              <p className="text-sm">All patients are stable.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {alerts.map((alert: PatientAlert) => (
                <Card key={alert.id} className={
                  alert.status === "sent" ? "border-green-200 bg-green-50" : 
                  alert.status === "failed" ? "border-red-200 bg-red-50" : 
                  alert.severity === "red" ? "border-red-300 bg-red-50" :
                  alert.severity === "yellow" ? "border-yellow-300 bg-yellow-50" :
                  alert.severity === "green" ? "border-green-300 bg-green-50" :
                  "border-amber-200 bg-amber-50"
                }>
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center">
                          {alert.severity === 'red' && (
                            <span className="w-4 h-4 mr-2 rounded-full bg-red-500 animate-pulse" title="Urgent" />
                          )}
                          {alert.severity === 'yellow' && (
                            <span className="w-4 h-4 mr-2 rounded-full bg-yellow-400" title="Attention needed" />
                          )}
                          {alert.severity === 'green' && (
                            <span className="w-4 h-4 mr-2 rounded-full bg-green-500" title="Healthy" />
                          )}
                          <CardTitle className="text-lg">{alert.patientName}</CardTitle>
                        </div>
                        <CardDescription>
                          ID: {alert.patientId} • Age: {alert.age} • 
                          {alert.alertReasons && alert.alertReasons.length > 0 ? 
                            ` Alerts: ${alert.alertReasons.length}` : 
                            alert.alertCount ? ` Alerts: ${alert.alertCount}` : ''}
                          {alert.createdAt && ` • Last reading: ${new Date(alert.createdAt).toLocaleString()}`}
                        </CardDescription>
                      </div>
                      <div className="flex flex-col gap-1 items-end">
                        <Badge variant="outline" className={
                          alert.severity === "red" ? "bg-red-100 text-red-800 border-red-300" :
                          alert.severity === "yellow" ? "bg-yellow-100 text-yellow-800 border-yellow-300" :
                          alert.severity === "green" ? "bg-green-100 text-green-800 border-green-300" :
                          alert.status === "sent" ? "bg-green-100 text-green-800 border-green-200" : 
                          alert.status === "failed" ? "bg-red-100 text-red-800 border-red-200" : 
                          "bg-amber-100 text-amber-800 border-amber-200"
                        }>
                          {alert.severity === "red" ? "URGENT" :
                          alert.severity === "yellow" ? "ATTENTION" :
                          alert.severity === "green" ? "HEALTHY" :
                          alert.status === "sent" ? "Sent" : 
                          alert.status === "failed" ? "Failed" : 
                          "Pending"}
                        </Badge>
                        {alert.status === "pending" && alert.isAlert && (
                          <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200 text-xs">
                            Requires SMS
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Accordion type="single" collapsible className="bg-white rounded-md">
                      <AccordionItem value="details">
                        <AccordionTrigger>View Details</AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-2 text-sm">
                            <div className="font-medium">Alert Variables:</div>
                            {alert.variables && alert.variables.length > 0 ? (
                              <ul className="list-disc pl-5 space-y-1">
                                {alert.variables.map((variable, index) => (
                                  <li key={index}>
                                    <span className="font-medium">{variable.name}:</span> {variable.value}
                                    {variable.timestamp && (
                                      <span className="text-gray-500 text-xs"> at {new Date(variable.timestamp).toLocaleString()}</span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-gray-500">No specific variables recorded</p>
                            )}
                            
                            {alert.reasoning && (
                              <div>
                                <div className="font-medium mt-3">Reasoning:</div>
                                <p className="text-gray-700">{alert.reasoning}</p>
                              </div>
                            )}
                            
                            <div className="font-medium mt-3">Message Preview:</div>
                            <div className="border p-3 rounded-md bg-gray-50 whitespace-pre-wrap text-gray-700">
                              {alert.message}
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                    
                    {alert.status === "pending" && (
                      <Button
                        className="w-full mt-3"
                        variant="outline"
                        onClick={() => handleSendSingleAlert(alert.id)}
                        disabled={sendSingleAlertMutation.isPending}
                      >
                        {sendSingleAlertMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Sending SMS...
                          </>
                        ) : (
                          <>
                            <MessageSquare className="mr-2 h-4 w-4" />
                            Send SMS Alert
                          </>
                        )}
                      </Button>
                    )}
                    
                    {alert.status === "failed" && (
                      <Button
                        className="w-full mt-3 text-red-600 border-red-200"
                        variant="outline"
                        onClick={() => handleSendSingleAlert(alert.id)}
                        disabled={sendSingleAlertMutation.isPending}
                      >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Retry Sending
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}