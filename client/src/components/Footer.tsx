import { FaGithub, FaTwitter } from "react-icons/fa";
import { FileText } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-white border-t border-gray-200">
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div className="md:flex md:items-center md:justify-between">
          <div className="flex justify-center md:order-2">
            <a href="#" className="text-gray-400 hover:text-gray-500">
              <span className="sr-only">Documentation</span>
              <FileText className="h-5 w-5" />
            </a>
            <a href="#" className="ml-6 text-gray-400 hover:text-gray-500">
              <span className="sr-only">GitHub</span>
              <FaGithub className="h-5 w-5" />
            </a>
            <a href="#" className="ml-6 text-gray-400 hover:text-gray-500">
              <span className="sr-only">Twitter</span>
              <FaTwitter className="h-5 w-5" />
            </a>
          </div>
          <div className="mt-8 md:mt-0 md:order-1">
            <p className="text-center text-sm text-gray-500">
              &copy; {new Date().getFullYear()} Patient Prompt Generator. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
