import React from "react";

export const CalicoCareLogoSVG: React.FC<React.SVGProps<SVGSVGElement>> = (props) => {
  return (
    <svg width="180" height="66" viewBox="0 0 180 66" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M65.5209 33.5229C65.5209 51.2574 51.3051 65.5229 33.5209 65.5229C15.7368 65.5229 1.52094 51.2574 1.52094 33.5229C1.52094 15.7884 15.7368 1.52295 33.5209 1.52295C51.3051 1.52295 65.5209 15.7884 65.5209 33.5229Z" fill="#F5A443" stroke="#F5A443" strokeWidth="3"/>
      <path d="M51.6377 39.3604C51.6377 49.2937 43.4543 57.3604 33.5209 57.3604C23.5876 57.3604 15.4042 49.2937 15.4042 39.3604C15.4042 29.427 23.5876 21.3604 33.5209 21.3604C43.4543 21.3604 51.6377 29.427 51.6377 39.3604Z" fill="white" stroke="#3498DB" strokeWidth="3"/>
      <path d="M44.5209 39.3604C44.5209 45.4115 39.5721 50.3604 33.5209 50.3604C27.4698 50.3604 22.5209 45.4115 22.5209 39.3604C22.5209 33.3092 27.4698 28.3604 33.5209 28.3604C39.5721 28.3604 44.5209 33.3092 44.5209 39.3604Z" fill="#3498DB"/>
      <text x="75" y="36" fontFamily="Arial" fontSize="24" fontWeight="bold" fill="#F5A443">calico</text>
      <text x="140" y="36" fontFamily="Arial" fontSize="24" fontStyle="italic" fill="#3498DB">care</text>
    </svg>
  );
};

export default CalicoCareLogoSVG;