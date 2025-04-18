declare module 'pdfmake' {
  interface TDocumentDefinitions {
    content: any;
    styles?: any;
    defaultStyle?: any;
    footer?: any;
    header?: any;
    pageMargins?: [number, number, number, number];
    pageOrientation?: 'portrait' | 'landscape';
    pageSize?: string | { width: number, height: number };
    info?: {
      title?: string;
      author?: string;
      subject?: string;
      keywords?: string;
    };
  }

  interface TFontDictionary {
    [fontName: string]: {
      normal?: string;
      bold?: string;
      italics?: string;
      bolditalics?: string;
    };
  }

  class PdfPrinter {
    constructor(fonts: TFontDictionary);
    createPdfKitDocument(docDefinition: TDocumentDefinitions, options?: any): any;
  }

  export = PdfPrinter;
}