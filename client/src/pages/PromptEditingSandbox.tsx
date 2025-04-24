import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RefreshCw, Save } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function PromptEditingSandbox() {
  const [corePrompt, setCorePrompt] = useState<string>("");
  const { toast } = useToast();
  
  // Query to get the current default system prompt
  const { data: defaultSystemPrompt, isLoading: isPromptLoading } = useQuery({
    queryKey: ["/api/system-prompt"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/system-prompt");
        const data = await res.json();
        return data.prompt || "";
      } catch (error) {
        console.error("Failed to fetch system prompt:", error);
        toast({
          title: "Error",
          description: "Failed to load system prompt",
          variant: "destructive"
        });
        return "";
      }
    }
  });

  // Update system prompt
  const updateSystemPromptMutation = useMutation({
    mutationFn: async (prompt: string) => {
      const res = await apiRequest("POST", "/api/system-prompt", { prompt });
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "System prompt updated successfully! Your changes will be applied to all new patient reports.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/system-prompt"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to update system prompt: ${error.message}`,
        variant: "destructive"
      });
    }
  });

  // Regenerate all prompts with updated system prompt
  const regeneratePromptsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/prompts/regenerate-all");
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "All patient reports have been regenerated with your new prompt",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/prompts"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to regenerate prompts: ${error.message}`,
        variant: "destructive"
      });
    }
  });

  useEffect(() => {
    if (defaultSystemPrompt) {
      setCorePrompt(defaultSystemPrompt);
    }
  }, [defaultSystemPrompt]);

  const handleSaveSystemPrompt = () => {
    updateSystemPromptMutation.mutate(corePrompt);
  };

  const handleRegeneratePrompts = () => {
    regeneratePromptsMutation.mutate();
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Core Prompt Editor</CardTitle>
          <CardDescription>
            Edit the core AI prompt that generates patient reports. After saving, go to the Triage section to see your changes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Textarea
              placeholder="Loading prompt..."
              value={corePrompt}
              onChange={(e) => setCorePrompt(e.target.value)}
              className="min-h-[400px] font-mono text-sm"
              disabled={isPromptLoading}
            />
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleSaveSystemPrompt}
              disabled={updateSystemPromptMutation.isPending || isPromptLoading}
              className="bg-gradient-to-r from-green-500 to-emerald-700 hover:from-green-600 hover:to-emerald-800"
            >
              <Save className="w-4 h-4 mr-2" />
              Save Prompt
            </Button>
            <Button
              onClick={handleRegeneratePrompts}
              disabled={regeneratePromptsMutation.isPending || updateSystemPromptMutation.isPending}
              variant="outline"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Regenerate All Patient Reports
            </Button>
          </div>

          {(updateSystemPromptMutation.isPending || regeneratePromptsMutation.isPending) && (
            <Alert>
              <AlertDescription>
                {updateSystemPromptMutation.isPending
                  ? "Saving your custom prompt..."
                  : "Regenerating all patient reports..."}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}