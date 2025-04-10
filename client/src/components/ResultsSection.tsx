import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Eye, RefreshCw, Copy, Download } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PatientPrompt } from "@shared/schema";

interface ResultsSectionProps {
  patientPrompts: PatientPrompt[];
  isLoading: boolean;
  totalPrompts: number;
  currentPage: number;
  totalPages: number;
  setCurrentPage: (page: number) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  onViewPrompt: (patient: PatientPrompt) => void;
  onRegeneratePrompt: (patientId: string) => void;
  onRegenerateAll: () => void;
  onExportCSV: () => void;
  onCopyPrompt: (prompt: string) => void;
  isPending: boolean;
}

export default function ResultsSection({
  patientPrompts,
  isLoading,
  totalPrompts,
  currentPage,
  totalPages,
  setCurrentPage,
  searchTerm,
  setSearchTerm,
  onViewPrompt,
  onRegeneratePrompt,
  onRegenerateAll,
  onExportCSV,
  onCopyPrompt,
  isPending
}: ResultsSectionProps) {
  return (
    <Card className="shadow overflow-hidden">
      <CardContent className="p-0">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium text-gray-800">Generated Patient Prompts</h3>
            <div className="flex space-x-3">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onExportCSV} 
                disabled={isPending || isLoading || patientPrompts.length === 0}
              >
                <Download className="h-4 w-4 mr-1.5 text-gray-500" />
                Export CSV
              </Button>
              <Button 
                size="sm" 
                onClick={onRegenerateAll}
                disabled={isPending || isLoading || patientPrompts.length === 0}
              >
                <RefreshCw className={`h-4 w-4 mr-1.5 ${isPending ? 'animate-spin' : ''}`} />
                Regenerate All
              </Button>
            </div>
          </div>
          
          <div className="mt-4">
            <div className="flex items-center">
              <span className="text-sm text-gray-500">
                Total patients: <span className="font-medium">{totalPrompts}</span>
              </span>
              <div className="ml-auto">
                <div className="relative rounded-md shadow-sm w-64">
                  <Input 
                    type="text" 
                    placeholder="Search patients..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Patient Name</TableHead>
                <TableHead>Age</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Generated Prompt</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array(5).fill(0).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-10" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-10 w-full" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-24" /></TableCell>
                  </TableRow>
                ))
              ) : patientPrompts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                    {searchTerm ? "No matching patients found" : "No patient data available"}
                  </TableCell>
                </TableRow>
              ) : (
                patientPrompts.map((patient) => (
                  <TableRow key={patient.patientId}>
                    <TableCell className="whitespace-nowrap font-medium text-gray-900">
                      {patient.patientId}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-gray-500">
                      {patient.name}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-gray-500">
                      {patient.age}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-gray-500">
                      {patient.condition}
                    </TableCell>
                    <TableCell className="text-gray-500 max-w-md">
                      <div className="line-clamp-2">{patient.prompt}</div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-gray-500">
                      <div className="flex space-x-2">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => onViewPrompt(patient)}
                          className="text-indigo-600 hover:text-indigo-900 transition-colors"
                        >
                          <Eye className="h-5 w-5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => onRegeneratePrompt(patient.patientId)}
                          disabled={isPending}
                          className="text-indigo-600 hover:text-indigo-900 transition-colors"
                        >
                          <RefreshCw className={`h-5 w-5 ${isPending ? 'animate-spin' : ''}`} />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => onCopyPrompt(patient.prompt)}
                          className="text-indigo-600 hover:text-indigo-900 transition-colors"
                        >
                          <Copy className="h-5 w-5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
            <div className="flex-1 flex justify-between sm:hidden">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  Showing <span className="font-medium">{(currentPage - 1) * 10 + 1}</span> to{" "}
                  <span className="font-medium">
                    {Math.min(currentPage * 10, totalPrompts)}
                  </span>{" "}
                  of <span className="font-medium">{totalPrompts}</span> results
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                  <Button
                    variant="outline"
                    size="icon"
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border text-sm font-medium"
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                  >
                    <span className="sr-only">Previous</span>
                    <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </Button>
                  
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    // Show first, last, current, and adjacent pages
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                      if (i === 4) pageNum = totalPages;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = i === 0 ? 1 : totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    
                    return (
                      <Button
                        key={pageNum}
                        variant={currentPage === pageNum ? "default" : "outline"}
                        size="icon"
                        className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                          currentPage === pageNum 
                            ? "bg-primary border-primary text-white" 
                            : "bg-white border-gray-300 text-gray-500 hover:bg-gray-50"
                        }`}
                        onClick={() => setCurrentPage(pageNum)}
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                  
                  <Button
                    variant="outline"
                    size="icon"
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border text-sm font-medium"
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                  >
                    <span className="sr-only">Next</span>
                    <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                  </Button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
