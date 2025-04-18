import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, MessageSquare, RefreshCw } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

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
}

export default function AIPoweredTriage() {
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const { toast } = useToast();
  
  // Query to get today's alerts
  const { data: alerts, isLoading } = useQuery({
    queryKey: ["/api/triage/alerts", selectedDate],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", `/api/triage/alerts?date=${selectedDate}`);
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
    }
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
            <CardDescription>Overview of today's patient alerts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-amber-600">
                  {isLoading ? (
                    <RefreshCw className="h-6 w-6 animate-spin" />
                  ) : (
                    alerts?.filter((a: PatientAlert) => a.status === "pending").length || 0
                  )}
                </span>
                <span className="text-sm text-amber-800">Pending Alerts</span>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-green-600">
                  {isLoading ? (
                    <RefreshCw className="h-6 w-6 animate-spin" />
                  ) : (
                    alerts?.filter((a: PatientAlert) => a.status === "sent").length || 0
                  )}
                </span>
                <span className="text-sm text-green-800">Sent Alerts</span>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-red-600">
                  {isLoading ? (
                    <RefreshCw className="h-6 w-6 animate-spin" />
                  ) : (
                    alerts?.filter((a: PatientAlert) => a.status === "failed").length || 0
                  )}
                </span>
                <span className="text-sm text-red-800">Failed Alerts</span>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <div className="flex items-center">
              <label htmlFor="date-select" className="mr-2 text-sm font-medium">Date:</label>
              <input
                id="date-select"
                type="date"
                value={selectedDate}
                onChange={handleDateChange}
                className="border rounded-md p-1 text-sm"
              />
            </div>
            <Button 
              onClick={handleSendAllAlerts} 
              disabled={sendAlertsMutation.isPending || isLoading || !alerts?.some((a: PatientAlert) => a.status === "pending")}
            >
              {sendAlertsMutation.isPending && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
              Send All Pending Alerts
            </Button>
          </CardFooter>
        </Card>
      </div>
      
      {/* Alerts table */}
      <Card>
        <CardHeader>
          <CardTitle>Patient Alerts</CardTitle>
          <CardDescription>
            Alerts generated from patient data that require attention
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : alerts?.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-amber-400" />
              <p>No alerts found for the selected date.</p>
            </div>
          ) : (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient</TableHead>
                    <TableHead>Condition</TableHead>
                    <TableHead className="hidden md:table-cell">Alert Value</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Timestamp</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alerts.map((alert: PatientAlert) => (
                    <TableRow key={alert.id}>
                      <TableCell className="font-medium">
                        {alert.patientName} <span className="text-gray-500 text-xs">({alert.age})</span>
                      </TableCell>
                      <TableCell>{alert.condition}</TableCell>
                      <TableCell className="hidden md:table-cell">{alert.alertValue}</TableCell>
                      <TableCell>
                        {alert.status === "pending" && (
                          <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">
                            Pending
                          </Badge>
                        )}
                        {alert.status === "sent" && (
                          <Badge variant="outline" className="bg-green-50 text-green-800 border-green-200">
                            Sent
                          </Badge>
                        )}
                        {alert.status === "failed" && (
                          <Badge variant="outline" className="bg-red-50 text-red-800 border-red-200">
                            Failed
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {new Date(alert.timestamp).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {alert.status === "pending" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSendSingleAlert(alert.id)}
                            disabled={sendSingleAlertMutation.isPending}
                            className="flex items-center"
                          >
                            <MessageSquare className="h-4 w-4 mr-1" />
                            Send SMS
                          </Button>
                        )}
                        {alert.status === "sent" && (
                          <span className="text-xs text-gray-500">
                            Sent: {new Date(alert.sentAt!).toLocaleTimeString()}
                          </span>
                        )}
                        {alert.status === "failed" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSendSingleAlert(alert.id)}
                            disabled={sendSingleAlertMutation.isPending}
                            className="text-red-600 border-red-200 flex items-center"
                          >
                            <RefreshCw className="h-4 w-4 mr-1" />
                            Retry
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* SMS message preview */}
      {alerts?.some((a: PatientAlert) => a.status === "pending") && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>SMS Message Preview</CardTitle>
            <CardDescription>
              Preview of the SMS messages that will be sent to caregivers
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {alerts
                .filter((alert: PatientAlert) => alert.status === "pending")
                .map((alert: PatientAlert) => (
                  <div key={alert.id} className="border p-4 rounded-md bg-gray-50">
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-medium">To: Caregiver of {alert.patientName}</span>
                      <Badge variant="outline" className="bg-blue-50 text-blue-800 border-blue-200">
                        SMS
                      </Badge>
                    </div>
                    <p className="text-gray-700 whitespace-pre-wrap">{alert.message}</p>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}