import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { Redirect } from "wouter";
import caliCatImage from "@/assets/cali-cat.png";
import calicoCareLogo from "@/assets/calico-care-logo.png";

// Form validation schema for admin login
const authSchema = z.object({
  username: z.string().min(3, {
    message: "Username must be at least 3 characters.",
  }),
  password: z.string().min(6, {
    message: "Password must be at least 6 characters.",
  }),
});

type AuthCredentials = {
  username: string;
  password: string;
};

export default function AuthPage() {
  // Get auth context
  const { user, loginMutation, isLoading } = useAuth();
  
  // Login form
  const loginForm = useForm<AuthCredentials>({
    resolver: zodResolver(authSchema),
    defaultValues: {
      username: "CalicoCare",
      password: "",
    },
  });

  // Handle login form submission
  const onLoginSubmit = (data: AuthCredentials) => {
    loginMutation.mutate(data);
  };

  // If already logged in, redirect to home page
  if (user) {
    return <Redirect to="/" />;
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Left column - Form */}
      <div className="flex flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:flex-none lg:px-20 xl:px-24">
        <div className="mx-auto w-full max-w-sm lg:w-96">
          <div className="mb-8">
            <div className="flex items-center">
              <img 
                src={calicoCareLogo} 
                alt="CalicoCare" 
                className="h-15 w-auto"
              />
            </div>
            <h2 className="mt-6 text-2xl font-bold tracking-tight text-gray-900">
              Welcome to Cali your AI Health Assistant
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Sign in with your admin credentials to access the system.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Admin Login</CardTitle>
              <CardDescription>
                Enter your credentials to access the administrator dashboard.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...loginForm}>
                <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-4">
                  <FormField
                    control={loginForm.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Username</FormLabel>
                        <FormControl>
                          <Input placeholder="CalicoCare" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={loginForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="********" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button 
                    type="submit" 
                    className="w-full"
                    disabled={loginMutation.isPending}
                  >
                    {loginMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Logging in...
                      </>
                    ) : (
                      'Login'
                    )}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </div>
      
      {/* Right column - Hero section */}
      <div className="relative hidden w-0 flex-1 lg:block">
        <div className="absolute inset-0 h-full bg-gradient-to-br from-[#3498DB] to-[#F5A443] flex flex-col justify-center overflow-y-auto">
          <div className="p-6 md:p-8 lg:p-12 max-w-xl mx-auto">
            {/* Cute Cat Image */}
            <div className="text-center mb-6">
              <img 
                src={caliCatImage} 
                alt="Cali - Your AI Health Assistant" 
                className="w-32 h-32 mx-auto mb-4 rounded-full shadow-lg bg-white/20 backdrop-blur-sm p-2"
              />
            </div>
            
            <div className="text-center text-white">
              <h1 className="text-3xl md:text-4xl font-bold mb-4 md:mb-6">How can I help you today</h1>
              <p className="text-lg md:text-xl mb-6 md:mb-8">
                Transform your medical data into personalized patient communication with AI-powered prompt generation.
              </p>
            </div>
            
            <div className="grid grid-cols-1 gap-4 md:gap-6 text-white">
              {/* Removed duplicate heading that appeared in the screenshot */}
              <div className="bg-white/10 backdrop-blur-sm p-3 md:p-4 rounded-lg">
                <h3 className="font-semibold text-base md:text-lg mb-1 md:mb-2">1. AI-Powered Care Triage</h3>
                <p className="opacity-90 text-xs md:text-sm">
                  Automatically prioritize patients based on health metrics and send SMS alerts.
                </p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm p-3 md:p-4 rounded-lg">
                <h3 className="font-semibold text-base md:text-lg mb-1 md:mb-2">2. AI-Prompt Companion Care</h3>
                <p className="opacity-90 text-xs md:text-sm">
                  Initiate caring, personalized conversations with patients using AI voice companions.
                </p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm p-3 md:p-4 rounded-lg">
                <h3 className="font-semibold text-base md:text-lg mb-1 md:mb-2">3. AI-Prompt Health Reports</h3>
                <p className="opacity-90 text-xs md:text-sm">
                  Generate comprehensive monthly analysis reports with patient trends and insights.
                </p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm p-3 md:p-4 rounded-lg">
                <h3 className="font-semibold text-base md:text-lg mb-1 md:mb-2">4. Ask Me Anything!</h3>
                <p className="opacity-90 text-xs md:text-sm">
                  Get help and guidance on using Cali's AI health assistance features.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}