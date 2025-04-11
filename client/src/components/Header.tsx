import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import CalicoCareLogoSVG from "@/assets/calicocare_logo";

export default function Header() {
  return (
    <header className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
        <Link href="/">
          <div className="flex items-center cursor-pointer">
            <div className="flex items-center">
              <CalicoCareLogoSVG className="h-12 w-auto" />
              <div className="flex flex-col ml-1">
                <span className="text-[#F5A443] font-bold text-lg leading-tight">calico</span>
                <span className="text-[#3498DB] italic text-lg leading-tight">care</span>
              </div>
            </div>
            <h1 className="ml-4 text-xl font-bold text-gray-800 border-l-2 border-gray-300 pl-4">Patient Prompt Generator</h1>
          </div>
        </Link>
        
        <div className="hidden md:flex items-center space-x-4">
          <Link href="/faq">
            <span className="text-gray-600 hover:text-primary text-sm font-medium transition-colors cursor-pointer">Help</span>
          </Link>
          <a href="#" className="text-gray-600 hover:text-primary text-sm font-medium transition-colors">Support</a>
          <Button>
            Contact Us
          </Button>
        </div>
        
        <button className="md:hidden text-gray-600 hover:text-gray-900">
          <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>
    </header>
  );
}
