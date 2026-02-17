declare module "citation-js" {
  interface CitePlugins {
    input: {
      chainLink(data: string): Array<{
        type: string;
        label: string;
        properties: Record<string, any>;
      }>;
      [key: string]: any;
    };
    output: { [key: string]: any };
    config: {
      get(plugin: string): any;
      list(): string[];
    };
    [key: string]: any;
  }

  class Cite {
    constructor(data: any, options?: any);
    data: Record<string, any>[];
    static plugins: CitePlugins;
    format(style: string, options?: Record<string, any>): string;
  }

  export default Cite;
}
