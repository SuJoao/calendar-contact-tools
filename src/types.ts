export type Placement = 'homepage' | 'ics-tools' | 'vcf-tools' | 'all-tools' | 'footer';

export interface Sponsor {
  id: string;
  name: string;
  description: string;
  image: string;
  url: string;
  placement: Placement[];
  startDate: string;
  endDate: string;
  label: string;
  isActive: boolean;
}

export interface RouteDefinition {
  path: string;
  title: string;
  description: string;
  seoTitle: string;
  metaDescription: string;
  primaryIntent: string;
  group?: 'ics' | 'vcf';
  sample?: string;
  extensions?: string[];
  multiple?: boolean;
}

export interface ProcessMessage {
  type: 'error' | 'warning' | 'success' | 'info';
  text: string;
}
