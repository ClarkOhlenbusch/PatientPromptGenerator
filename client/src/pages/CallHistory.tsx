import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Phone,
  Clock,
  CheckCircle,
  XCircle,
  MessageSquare,
  Search,
  Calendar,
  AlertTriangle,
  Heart,
  FileText,
  Filter
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface CallHistory {
  id: number;
  callId: string;
  patientId: string;
  patientName: string;
  phoneNumber: string;
  duration: number;
  status: string;
  summary: string;
  keyPoints: string[];
  healthConcerns: string[];
  followUpItems: string[];
  callDate: string;
  transcript?: string;
}

export default function CallHistory() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCall, setSelectedCall] = useState<CallHistory | null>(null);
  const [callDetailDialogOpen, setCallDetailDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("date");
  const [isTestingWebhook, setIsTestingWebhook] = useState(false);

  // Query to fetch all call history
  const { data: callHistoryData, isLoading, error, refetch } = useQuery({
    queryKey: ["/api/call-history"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/call-history");
      if (!res.ok) {
        throw new Error("Failed to fetch call history");
      }
      return res.json();
    }
  });

  const callHistory: CallHistory[] = callHistoryData?.data || [];

  // Test webhook function
  const testWebhook = async () => {
    setIsTestingWebhook(true);
    try {
      console.log("🧪 Frontend: Starting webhook test...");
      const response = await apiRequest("POST", "/api/vapi/webhook/test");
      console.log("🧪 Frontend: Response status:", response.status);

      if (response.ok) {
        const result = await response.json();
        console.log("🧪 Frontend: Response data:", result);
        toast({
          title: "Test Webhook Successful",
          description: `Created test call: ${result.callId}`,
        });
        // Refresh the call history
        console.log("🧪 Frontend: Refreshing call history...");
        refetch();
      } else {
        const errorData = await response.json().catch(() => ({ message: "Unknown error" }));
        console.error("🧪 Frontend: Error response:", errorData);
        throw new Error(errorData.message || "Failed to test webhook");
      }
    } catch (error) {
      console.error("🧪 Frontend: Catch block error:", error);
      toast({
        title: "Test Webhook Failed",
        description: (error as Error)?.message || "Could not create test call record",
        variant: "destructive",
      });
    } finally {
      setIsTestingWebhook(false);
    }
  };

  // Filter and search logic
  const filteredCalls = callHistory
    .filter(call => {
      const matchesSearch = call.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           call.summary.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === "all" || call.status === statusFilter;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "date":
          return new Date(b.callDate).getTime() - new Date(a.callDate).getTime();
        case "duration":
          return b.duration - a.duration;
        case "patient":
          return a.patientName.localeCompare(b.patientName);
        default:
          return 0;
      }
    });

  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
        return <Badge variant="default" className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Completed</Badge>;
      case 'failed':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
      case 'no-answer':
        return <Badge variant="secondary"><Phone className="w-3 h-3 mr-1" />No Answer</Badge>;
      case 'busy':
        return <Badge variant="outline"><Phone className="w-3 h-3 mr-1" />Busy</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const openCallDetail = (call: CallHistory) => {
    setSelectedCall(call);
    setCallDetailDialogOpen(true);
  };

  if (error) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-red-600">
              <AlertTriangle className="w-12 h-12 mx-auto mb-4" />
              <p>Error loading call history: {error.message}</p>
              <Button onClick={() => refetch()} className="mt-4">
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Call History</h1>
          <p className="text-gray-600 mt-2">
            View and analyze patient call summaries and outcomes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-sm">
            <Phone className="w-3 h-3 mr-1" />
            {callHistory.length} Total Calls
          </Badge>
        </div>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Search by patient name or call summary..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="no-answer">No Answer</SelectItem>
                <SelectItem value="busy">Busy</SelectItem>
              </SelectContent>
            </Select>

            {/* Sort By */}
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date">Recent First</SelectItem>
                <SelectItem value="duration">Duration</SelectItem>
                <SelectItem value="patient">Patient Name</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Call History Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              Patient Calls ({filteredCalls.length})
            </div>
            <Button
              onClick={testWebhook}
              disabled={isTestingWebhook}
              variant="outline"
              size="sm"
              className="text-xs"
            >
              {isTestingWebhook ? "Testing..." : "🧪 Test Webhook"}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading call history...</p>
            </div>
          ) : filteredCalls.length === 0 ? (
            <div className="text-center py-8">
              <Phone className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-600">
                {searchQuery || statusFilter !== "all"
                  ? "No calls match your search criteria"
                  : "No call history available yet"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient</TableHead>
                    <TableHead>Date & Time</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Summary</TableHead>
                    <TableHead>Concerns</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCalls.map((call) => (
                    <TableRow key={call.id} className="hover:bg-gray-50">
                      <TableCell className="font-medium">
                        <div>
                          <p className="font-semibold">{call.patientName}</p>
                          <p className="text-sm text-gray-500">{call.phoneNumber}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          <span className="text-sm">{formatDate(call.callDate)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-gray-400" />
                          <span className="text-sm font-mono">{formatDuration(call.duration)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(call.status)}
                      </TableCell>
                      <TableCell className="max-w-md">
                        <p className="text-sm line-clamp-2">{call.summary}</p>
                      </TableCell>
                      <TableCell>
                        {call.healthConcerns && call.healthConcerns.length > 0 ? (
                          <div className="flex items-center gap-1">
                            <Heart className="w-4 h-4 text-red-500" />
                            <Badge variant="outline" className="text-xs">
                              {call.healthConcerns.length} concern{call.healthConcerns.length !== 1 ? 's' : ''}
                            </Badge>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-sm">None</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openCallDetail(call)}
                          className="text-xs"
                        >
                          <FileText className="w-3 h-3 mr-1" />
                          View Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Call Detail Dialog */}
      <Dialog open={callDetailDialogOpen} onOpenChange={setCallDetailDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="w-5 h-5" />
              Call Details - {selectedCall?.patientName}
            </DialogTitle>
            <DialogDescription>
              {selectedCall && formatDate(selectedCall.callDate)} • {selectedCall && formatDuration(selectedCall.duration)}
            </DialogDescription>
          </DialogHeader>

          {selectedCall && (
            <div className="space-y-6">
              {/* Call Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-center">
                      <Clock className="w-8 h-8 mx-auto text-blue-600 mb-2" />
                      <p className="text-2xl font-bold">{formatDuration(selectedCall.duration)}</p>
                      <p className="text-sm text-gray-600">Duration</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-center">
                      {getStatusBadge(selectedCall.status)}
                      <p className="text-sm text-gray-600 mt-2">Call Status</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-center">
                      <MessageSquare className="w-8 h-8 mx-auto text-green-600 mb-2" />
                      <p className="text-2xl font-bold">{selectedCall.keyPoints?.length || 0}</p>
                      <p className="text-sm text-gray-600">Key Points</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-center">
                      <Heart className="w-8 h-8 mx-auto text-red-600 mb-2" />
                      <p className="text-2xl font-bold">{selectedCall.healthConcerns?.length || 0}</p>
                      <p className="text-sm text-gray-600">Health Concerns</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Call Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-700 leading-relaxed">{selectedCall.summary}</p>
                </CardContent>
              </Card>

              {/* Key Points */}
              {selectedCall.keyPoints && selectedCall.keyPoints.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Key Discussion Points</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {selectedCall.keyPoints.map((point, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <span className="inline-block w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></span>
                          <span className="text-gray-700">{point}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Health Concerns */}
              {selectedCall.healthConcerns && selectedCall.healthConcerns.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg text-red-700">Health Concerns</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {selectedCall.healthConcerns.map((concern, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                          <span className="text-gray-700">{concern}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Follow-up Items */}
              {selectedCall.followUpItems && selectedCall.followUpItems.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg text-green-700">Follow-up Actions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {selectedCall.followUpItems.map((item, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                          <span className="text-gray-700">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Transcript (if available) */}
              {selectedCall.transcript && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Call Transcript</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-gray-50 p-4 rounded-lg max-h-60 overflow-y-auto">
                      <pre className="text-sm whitespace-pre-wrap text-gray-700 font-mono">
                        {selectedCall.transcript}
                      </pre>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}